const crypto = require('crypto');
const pool = require('../db/pool');
const AppError = require('../utils/AppError');
const { lessonMaterialStorage } = require('../storage');
const { validateMaterialFile } = require('../utils/lessonMaterialFile');
const {
  GEMINI_MODEL,
  RECOGNITION_PROVIDER,
  RECOGNITION_MAX_ATTEMPTS,
  GEMINI_SHARED_RATE_LIMIT_BACKOFF_MS,
  LESSON_MATERIAL_IMAGE_MAX_MB,
  LESSON_MATERIAL_PDF_MAX_MB,
  LESSON_MATERIAL_PDF_MAX_PAGES,
} = require('../config/env');

function safeName(name) {
  return String(name || 'lesson-material').replace(/[\u0000-\u001f]/g, '').slice(0, 255) || 'lesson-material';
}

function extensionForMime(mime) {
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

function safe(row) {
  return {
    id: row.id,
    lessonId: row.lesson_id,
    sectionId: row.section_id,
    materialType: row.material_type,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    fileSize: Number(row.file_size),
    pageCount: row.page_count ? Number(row.page_count) : null,
    status: row.status,
    attemptCount: row.attempt_count,
    failureCode: row.last_failure_code || null,
    failureMessage: row.last_failure_message || null,
    uploadedAt: row.uploaded_at,
    processedAt: row.processed_at,
    fileUrl: `/api/lesson-materials/${row.id}/file`,
    result: row.result_id ? {
      id: row.result_id,
      plainText: row.plain_text || '',
      mathExpressions: row.math_expressions || [],
      pages: row.pages || [],
      provider: row.provider || null,
      providerVersion: row.provider_version || null,
    } : null,
  };
}

async function ownedLesson(lessonId, instructorId, client = pool) {
  const { rows } = await client.query(
    'SELECT id,section_id,instructor_id,status,title,topic,started_at,ended_at FROM lesson_sessions WHERE id=$1',
    [lessonId]
  );
  if (!rows.length || rows[0].instructor_id !== instructorId) throw new AppError('Lesson not found or access denied.', 404);
  return rows[0];
}

async function inspectPdf(buffer) {
  let document;
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    document = await pdfjs.getDocument({ data: new Uint8Array(buffer), disableWorker: true }).promise;
    if (document.numPages > LESSON_MATERIAL_PDF_MAX_PAGES) {
      throw new AppError(`PDF materials may contain at most ${LESSON_MATERIAL_PDF_MAX_PAGES} pages.`, 400);
    }
    const pages = [];
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      const text = content.items.map(item => item.str || '').join(' ').replace(/\s+/g, ' ').trim();
      pages.push({ pageNumber: number, text, reliable: text.length >= 24 });
    }
    return pages;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('The PDF is damaged, encrypted, or unsupported.', 400);
  } finally {
    await document?.destroy?.().catch?.(() => {});
  }
}

async function upload(lessonId, instructorId, file) {
  const lesson = await ownedLesson(lessonId, instructorId);
  if (lesson.status !== 'COMPLETED') throw new AppError('Lesson materials can be added after the lesson is completed.', 409);
  const validated = validateMaterialFile(file, {
    imageMaxMb: LESSON_MATERIAL_IMAGE_MAX_MB,
    pdfMaxMb: LESSON_MATERIAL_PDF_MAX_MB,
  });
  const nativePages = validated.materialType === 'PDF' ? await inspectPdf(file.buffer) : null;
  const id = crypto.randomUUID();
  const storageKey = `${instructorId}/${lessonId}/${id}.${extensionForMime(validated.mimeType)}`;
  await lessonMaterialStorage.put(storageKey, file.buffer);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO lesson_materials
        (id,lesson_id,section_id,instructor_id,material_type,original_filename,storage_provider,storage_key,mime_type,file_size,page_count,status,attempt_count)
       VALUES($1,$2,$3,$4,$5,$6,'LOCAL',$7,$8,$9,$10,'UPLOADED',1) RETURNING *`,
      [id, lesson.id, lesson.section_id, instructorId, validated.materialType, safeName(file.originalname),
       storageKey, validated.mimeType, file.size, nativePages?.length || 1]
    );
    await client.query(
      `INSERT INTO lesson_material_attempts
        (material_id,attempt_number,request_kind,status,provider,provider_version,next_attempt_at)
       VALUES($1,1,'INITIAL','PENDING',$2,$3,NOW())`,
      [id, RECOGNITION_PROVIDER, GEMINI_MODEL]
    );
    if (nativePages) {
      await client.query(
        `INSERT INTO lesson_material_results(material_id,provider,provider_version,pages,raw_extraction)
         VALUES($1,'LOCAL','native-pdf-text',$2,$3)`,
        [id, JSON.stringify(nativePages), JSON.stringify({ nativePages })]
      );
    }
    await client.query('COMMIT');
    return safe(rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    await lessonMaterialStorage.delete(storageKey).catch(() => {});
    throw error;
  } finally {
    file.buffer = null;
    client.release();
  }
}

async function list(lessonId, instructorId) {
  await ownedLesson(lessonId, instructorId);
  const { rows } = await pool.query(
    `SELECT material.*,result.id AS result_id,result.plain_text,result.math_expressions,result.pages,
            result.provider,result.provider_version
       FROM lesson_materials material
       LEFT JOIN lesson_material_results result ON result.material_id=material.id
      WHERE material.lesson_id=$1 AND material.instructor_id=$2
      ORDER BY material.uploaded_at,material.id`,
    [lessonId, instructorId]
  );
  return rows.map(safe);
}

async function getOwned(materialId, instructorId, client = pool, lock = false) {
  const { rows } = await client.query(
    `SELECT material.* FROM lesson_materials material
       JOIN lesson_sessions lesson ON lesson.id=material.lesson_id
      WHERE material.id=$1 AND material.instructor_id=$2 AND lesson.instructor_id=$2${lock ? ' FOR UPDATE OF material' : ''}`,
    [materialId, instructorId]
  );
  if (!rows.length) throw new AppError('Lesson material not found or access denied.', 404);
  return rows[0];
}

async function openFile(materialId, instructorId) {
  const material = await getOwned(materialId, instructorId);
  const opened = await lessonMaterialStorage.open(material.storage_key);
  return { ...opened, mime: material.mime_type, filename: material.original_filename };
}

async function remove(materialId, instructorId) {
  const client = await pool.connect();
  let storageKey;
  try {
    await client.query('BEGIN');
    const material = await getOwned(materialId, instructorId, client, true);
    const referenced = await client.query(
      `SELECT 1 FROM lesson_context_chunks chunk
        JOIN lesson_context_versions version ON version.id=chunk.context_version_id
       WHERE version.status IN ('APPROVED','ARCHIVED') AND chunk.removed=FALSE AND chunk.source->>'materialId'=$1 LIMIT 1`,
      [materialId]
    );
    if (referenced.rows.length) {
      throw new AppError('This material is preserved by a frozen lesson-context version and cannot be deleted.', 409);
    }
    storageKey = material.storage_key;
    await client.query('DELETE FROM lesson_materials WHERE id=$1', [materialId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
  await lessonMaterialStorage.delete(storageKey).catch(error => console.error('[Materials] Orphan cleanup failed:', error.message));
}

async function reprocess(materialId, instructorId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const material = await getOwned(materialId, instructorId, client, true);
    if (['PROCESSING', 'UPLOADED'].includes(material.status)) {
      await client.query('COMMIT');
      return { material: safe(material), queued: false };
    }
    const attempt = material.attempt_count + 1;
    const { rows } = await client.query(
      `UPDATE lesson_materials SET status='UPLOADED',attempt_count=$2,last_failure_code=NULL,
        last_failure_message=NULL,updated_at=NOW() WHERE id=$1 RETURNING *`, [materialId, attempt]
    );
    await client.query(
      `INSERT INTO lesson_material_attempts(material_id,attempt_number,request_kind,status,provider,provider_version,next_attempt_at)
       VALUES($1,$2,'REPROCESS','PENDING',$3,$4,NOW())`, [materialId, attempt, RECOGNITION_PROVIDER, GEMINI_MODEL]
    );
    await client.query('COMMIT');
    return { material: safe(rows[0]), queued: true };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

async function claimNextAttempt(workerId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id FROM lesson_material_attempts WHERE status='PENDING' AND next_attempt_at<=NOW()
       ORDER BY next_attempt_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1`
    );
    if (!rows.length) { await client.query('COMMIT'); return null; }
    const result = await client.query(
      `UPDATE lesson_material_attempts SET status='PROCESSING',worker_id=$2,locked_at=NOW(),
        started_at=COALESCE(started_at,NOW()) WHERE id=$1 RETURNING *`, [rows[0].id, workerId]
    );
    await client.query(`UPDATE lesson_materials SET status='PROCESSING',updated_at=NOW() WHERE id=$1`, [result.rows[0].material_id]);
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

async function getAttemptSource(attemptId) {
  const { rows } = await pool.query(
    `SELECT attempt.*,material.lesson_id,material.section_id,material.instructor_id,material.material_type,
      material.storage_key,material.mime_type,material.file_size,material.page_count,result.raw_extraction
     FROM lesson_material_attempts attempt
     JOIN lesson_materials material ON material.id=attempt.material_id
     JOIN lesson_sessions lesson ON lesson.id=material.lesson_id
     LEFT JOIN lesson_material_results result ON result.material_id=material.id
     WHERE attempt.id=$1 AND lesson.instructor_id=material.instructor_id AND lesson.status='COMPLETED'`, [attemptId]
  );
  if (!rows.length) { const error = new Error('Material ownership validation failed.'); error.code = 'OWNERSHIP_MISMATCH'; throw error; }
  return rows[0];
}

async function readBuffer(source) {
  const opened = await lessonMaterialStorage.open(source.storage_key);
  if (Number(opened.size) !== Number(source.file_size)) throw new AppError('The protected lesson material is incomplete.', 422);
  const chunks = [];
  for await (const chunk of opened.stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function completeAttempt(attempt, result) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO lesson_material_results(material_id,provider,provider_version,plain_text,math_expressions,pages,raw_extraction,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT(material_id) DO UPDATE SET provider=EXCLUDED.provider,provider_version=EXCLUDED.provider_version,
       plain_text=EXCLUDED.plain_text,math_expressions=EXCLUDED.math_expressions,pages=EXCLUDED.pages,
       raw_extraction=EXCLUDED.raw_extraction,updated_at=NOW()`,
      [attempt.material_id, RECOGNITION_PROVIDER, result.providerVersion, result.plainText,
       JSON.stringify(result.mathExpressions), JSON.stringify(result.pages), JSON.stringify(result.raw)]
    );
    await client.query(
      `UPDATE lesson_material_attempts SET status='SUCCEEDED',provider_version=$2,normalized_result=$3,
       sanitized_provider_output=$4,completed_at=NOW() WHERE id=$1`,
      [attempt.id, result.providerVersion, JSON.stringify({ plainText: result.plainText, mathExpressions: result.mathExpressions, pages: result.pages }), JSON.stringify(result.raw)]
    );
    await client.query(
      `UPDATE lesson_materials SET status='REVIEW_REQUIRED',last_failure_code=NULL,last_failure_message=NULL,
       processed_at=NOW(),updated_at=NOW() WHERE id=$1`, [attempt.material_id]
    );
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

async function failAttempt(attempt, mapped) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT status FROM lesson_material_attempts WHERE id=$1 FOR UPDATE', [attempt.id]);
    if (current.rows[0]?.status !== 'PROCESSING') { await client.query('COMMIT'); return; }
    const chain = await client.query(
      `SELECT COUNT(*)::int AS count FROM lesson_material_attempts WHERE material_id=$1
       AND created_at >= (SELECT MAX(created_at) FROM lesson_material_attempts WHERE material_id=$1 AND request_kind IN('INITIAL','REPROCESS'))`,
      [attempt.material_id]
    );
    const count = chain.rows[0].count;
    await client.query(
      `UPDATE lesson_material_attempts SET status='FAILED',failure_code=$2,failure_message=$3,completed_at=NOW() WHERE id=$1`,
      [attempt.id, mapped.code, mapped.message]
    );
    if (mapped.retryable && count < RECOGNITION_MAX_ATTEMPTS) {
      const next = attempt.attempt_number + 1;
      const delay = mapped.code === 'PROVIDER_RATE_LIMITED' ? Math.ceil(GEMINI_SHARED_RATE_LIMIT_BACKOFF_MS / 1000) : count === 1 ? 10 : 30;
      await client.query(
        `INSERT INTO lesson_material_attempts(material_id,attempt_number,request_kind,status,provider,provider_version,next_attempt_at)
         VALUES($1,$2,'AUTO_RETRY','PENDING',$3,$4,NOW()+($5::int*INTERVAL '1 second'))`,
        [attempt.material_id, next, RECOGNITION_PROVIDER, GEMINI_MODEL, delay]
      );
      await client.query(
        `UPDATE lesson_materials SET status='UPLOADED',attempt_count=$2,last_failure_code=$3,last_failure_message=$4,updated_at=NOW() WHERE id=$1`,
        [attempt.material_id, next, mapped.code, mapped.message]
      );
    } else {
      await client.query(
        `UPDATE lesson_materials SET status='FAILED',last_failure_code=$2,last_failure_message=$3,updated_at=NOW() WHERE id=$1`,
        [attempt.material_id, mapped.code, mapped.message]
      );
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

async function recoverStaleAttempts(timeoutMs) {
  const { rows } = await pool.query(
    `UPDATE lesson_material_attempts SET status='PENDING',next_attempt_at=NOW(),worker_id=NULL,locked_at=NULL,
      failure_code='WORKER_INTERRUPTED',failure_message='Material worker was interrupted.'
     WHERE status='PROCESSING' AND locked_at<NOW()-($1::bigint*INTERVAL '1 millisecond') RETURNING material_id`, [timeoutMs]
  );
  if (rows.length) await pool.query(`UPDATE lesson_materials SET status='UPLOADED',updated_at=NOW() WHERE id=ANY($1::uuid[])`, [rows.map(row => row.material_id)]);
  return rows.length;
}

module.exports = {
  upload, list, openFile, remove, reprocess, ownedLesson,
  claimNextAttempt, getAttemptSource, readBuffer, completeAttempt, failAttempt, recoverStaleAttempts,
};
