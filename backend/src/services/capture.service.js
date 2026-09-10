const crypto = require('crypto');
const pool = require('../db/pool');
const { captureStorage: storage } = require('../storage');
const AppError = require('../utils/AppError');
const { validateImageFile } = require('../utils/imageFile');
const { safeCalibration } = require('./calibration.service');

const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_PLANES = 12;

function positiveInteger(value, label, required = true) {
  if (!required && (value === undefined || value === null || value === '')) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20000) throw new AppError(`${label} is invalid.`, 400);
  return parsed;
}

function safeCapture(row) {
  return {
    id: row.id, lessonId: row.lesson_id, sectionId: row.section_id, instructorId: row.instructor_id,
    calibrationId: row.calibration_id || null, storageProvider: row.storage_provider, mimeType: row.mime_type,
    originalFileSize: row.original_file_size, correctedFileSize: row.corrected_file_size || null,
    originalWidth: row.original_width, originalHeight: row.original_height,
    correctedWidth: row.corrected_width || null, correctedHeight: row.corrected_height || null,
    planeCount: Number(row.plane_count || 0), capturedAt: row.captured_at, createdAt: row.created_at,
    originalUrl: `/api/captures/${row.id}/image/original`,
    correctedUrl: row.corrected_storage_key ? `/api/captures/${row.id}/image/corrected` : null,
  };
}

async function getOwnedLesson(lessonId, instructorId) {
  const { rows } = await pool.query(
    `SELECT lesson.id, lesson.section_id, lesson.instructor_id, lesson.status,
            COALESCE(settings.capture_while_paused, FALSE) AS capture_while_paused
       FROM lesson_sessions lesson
       LEFT JOIN hardware_settings settings ON settings.instructor_id = lesson.instructor_id
      WHERE lesson.id = $1`, [lessonId]
  );
  if (!rows.length) throw new AppError('Lesson not found.', 404);
  if (rows[0].instructor_id !== instructorId) throw new AppError('Access denied. You do not own this lesson.', 403);
  return rows[0];
}

function parseManifest(input, planeFiles, calibration) {
  if (!planeFiles.length && !input.planeManifest) return [];
  if (!calibration) throw new AppError('A saved calibration is required for corrected plane images.', 400);
  let manifest;
  try { manifest = JSON.parse(input.planeManifest || '[]'); }
  catch { throw new AppError('Corrected plane metadata is invalid.', 400); }
  if (!Array.isArray(manifest) || !manifest.length || manifest.length > MAX_PLANES || manifest.length !== planeFiles.length) {
    throw new AppError('Corrected plane images do not match their metadata.', 400);
  }
  const authoritative = new Map(calibration.planes.map(plane => [plane.id, plane]));
  const seen = new Set();
  return manifest.map((item, index) => {
    const plane = authoritative.get(String(item.id || ''));
    if (!plane || seen.has(plane.id)) throw new AppError('A corrected plane does not belong to the saved calibration.', 400);
    seen.add(plane.id);
    if (Number(item.order) !== plane.order) throw new AppError('Corrected plane reading order does not match the saved calibration.', 400);
    const file = planeFiles[index], mime = validateImageFile(file, `Corrected plane ${plane.order}`);
    return {
      ...plane, file, mime,
      width: positiveInteger(item.width, `Corrected plane ${plane.order} width`),
      height: positiveInteger(item.height, `Corrected plane ${plane.order} height`),
    };
  }).sort((a, b) => a.order - b.order);
}

async function createCapture(lessonId, instructorId, files, input) {
  const lesson = await getOwnedLesson(lessonId, instructorId);
  const pausedCaptureAllowed = lesson.status === 'PAUSED' && lesson.capture_while_paused;
  if (lesson.status !== 'ACTIVE' && !pausedCaptureAllowed) throw new AppError('Whiteboard captures are unavailable while this lesson is paused.', 409);

  const original = files?.original?.[0], corrected = files?.corrected?.[0] || null;
  const originalMime = validateImageFile(original, 'Original');
  const correctedMime = corrected ? validateImageFile(corrected, 'Corrected') : null;
  const originalWidth = positiveInteger(input.originalWidth, 'Original width');
  const originalHeight = positiveInteger(input.originalHeight, 'Original height');
  const correctedWidth = corrected ? positiveInteger(input.correctedWidth, 'Corrected width') : null;
  const correctedHeight = corrected ? positiveInteger(input.correctedHeight, 'Corrected height') : null;

  let calibrationId = input.calibrationId || null, calibration = null;
  if (calibrationId) {
    const { rows } = await pool.query('SELECT * FROM camera_calibrations WHERE id = $1 AND instructor_id = $2', [calibrationId, instructorId]);
    if (!rows.length) throw new AppError('Calibration not found or access denied.', 404);
    calibration = safeCalibration(rows[0]);
  }
  const planes = parseManifest(input, files?.correctedPlanes || [], calibration);
  if (calibration && planes.length && planes.length !== calibration.planes.length) {
    throw new AppError('Every saved calibration plane requires a corrected image.', 400);
  }

  const capturedAt = input.capturedAt ? new Date(input.capturedAt) : new Date();
  if (!Number.isFinite(capturedAt.getTime())) throw new AppError('Capture timestamp is invalid.', 400);

  const prefix = `${instructorId}/${lessonId}/${crypto.randomUUID()}`;
  const originalKey = `${prefix}-original.${EXTENSIONS[originalMime]}`;
  const correctedKey = corrected ? `${prefix}-corrected.${EXTENSIONS[correctedMime]}` : null;
  const storedPlanes = planes.map(plane => ({ ...plane, storageKey: `${prefix}-plane-${String(plane.order).padStart(2, '0')}.${EXTENSIONS[plane.mime]}` }));
  const written = [];
  let client;
  try {
    await storage.put(originalKey, original.buffer); written.push(originalKey);
    if (corrected) { await storage.put(correctedKey, corrected.buffer); written.push(correctedKey); }
    for (const plane of storedPlanes) { await storage.put(plane.storageKey, plane.file.buffer); written.push(plane.storageKey); }

    client = await pool.connect();
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO lesson_captures
        (lesson_id, section_id, instructor_id, calibration_id, storage_provider,
         original_storage_key, corrected_storage_key, mime_type,
         original_file_size, corrected_file_size, original_width, original_height,
         corrected_width, corrected_height, captured_at)
       VALUES ($1,$2,$3,$4,'LOCAL',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [lessonId, lesson.section_id, instructorId, calibrationId, originalKey, correctedKey,
       originalMime, original.size, corrected?.size || null, originalWidth, originalHeight,
       correctedWidth, correctedHeight, capturedAt]
    );
    for (const plane of storedPlanes) {
      await client.query(
        `INSERT INTO lesson_capture_planes
          (capture_id, calibration_plane_id, label, plane_order, corners, storage_provider,
           storage_key, mime_type, file_size, width, height)
         VALUES ($1,$2,$3,$4,$5,'LOCAL',$6,$7,$8,$9,$10)`,
        [rows[0].id, plane.id, plane.label, plane.order, JSON.stringify(plane.corners),
         plane.storageKey, plane.mime, plane.file.size, plane.width, plane.height]
      );
    }
    await client.query('COMMIT');
    return safeCapture({ ...rows[0], plane_count: storedPlanes.length });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    await Promise.allSettled(written.map(key => storage.delete(key)));
    throw error;
  } finally { client?.release(); }
}

async function getCaptures(lessonId, instructorId) {
  await getOwnedLesson(lessonId, instructorId);
  const { rows } = await pool.query(
    `SELECT capture.*, COALESCE(planes.plane_count, 0) AS plane_count
       FROM lesson_captures capture
       LEFT JOIN (SELECT capture_id, COUNT(*)::int AS plane_count FROM lesson_capture_planes GROUP BY capture_id) planes
         ON planes.capture_id = capture.id
      WHERE capture.lesson_id = $1 AND capture.instructor_id = $2
      ORDER BY capture.captured_at DESC`, [lessonId, instructorId]
  );
  return rows.map(safeCapture);
}

async function getCaptureFile(captureId, instructorId, variant) {
  if (!['original', 'corrected'].includes(variant)) throw new AppError('Invalid capture image variant.', 400);
  const { rows } = await pool.query('SELECT * FROM lesson_captures WHERE id = $1 AND instructor_id = $2', [captureId, instructorId]);
  if (!rows.length) throw new AppError('Capture not found.', 404);
  const key = variant === 'original' ? rows[0].original_storage_key : rows[0].corrected_storage_key;
  if (!key) throw new AppError('Corrected image is not available for this capture.', 404);
  const extension = key.split('.').pop().toLowerCase();
  const mime = extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';
  try { return { ...(await storage.open(key)), mime }; }
  catch (error) { if (error.code === 'ENOENT') throw new AppError('Capture image file is unavailable.', 404); throw error; }
}

async function captureKeys(captureId, instructorId) {
  const { rows } = await pool.query(
    `SELECT capture.original_storage_key, capture.corrected_storage_key,
            COALESCE(jsonb_agg(plane.storage_key) FILTER (WHERE plane.storage_key IS NOT NULL), '[]'::jsonb) AS plane_keys
       FROM lesson_captures capture
       LEFT JOIN lesson_capture_planes plane ON plane.capture_id = capture.id
      WHERE capture.id = $1 AND capture.instructor_id = $2
      GROUP BY capture.id`, [captureId, instructorId]
  );
  return rows[0] || null;
}

async function deleteCapture(captureId, instructorId) {
  const row = await captureKeys(captureId, instructorId);
  if (!row) throw new AppError('Capture not found.', 404);
  const keys = [row.original_storage_key, row.corrected_storage_key, ...(row.plane_keys || [])].filter(Boolean);
  await Promise.all(keys.map(key => storage.delete(key)));
  await pool.query('DELETE FROM lesson_captures WHERE id = $1 AND instructor_id = $2', [captureId, instructorId]);
}

async function deleteAssetsForLesson(lessonId, instructorId) {
  const { rows } = await pool.query(
    `SELECT capture.original_storage_key, capture.corrected_storage_key, plane.storage_key AS plane_storage_key
       FROM lesson_captures capture LEFT JOIN lesson_capture_planes plane ON plane.capture_id = capture.id
      WHERE capture.lesson_id = $1 AND capture.instructor_id = $2`, [lessonId, instructorId]
  );
  const keys = [...new Set(rows.flatMap(row => [row.original_storage_key, row.corrected_storage_key, row.plane_storage_key]).filter(Boolean))];
  await Promise.all(keys.map(key => storage.delete(key)));
}

module.exports = { createCapture, getCaptures, getCaptureFile, deleteCapture, deleteAssetsForLesson };