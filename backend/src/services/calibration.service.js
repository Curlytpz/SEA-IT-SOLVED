const crypto = require('crypto');
const pool = require('../db/pool');
const AppError = require('../utils/AppError');

const POINT_NAMES = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];
const ADVANCED_POINT_NAMES = ['topLeft', 'topCenter', 'topRight', 'middleLeft', 'middleRight', 'bottomLeft', 'bottomCenter', 'bottomRight'];
const MAX_PLANES = 12;

function pointObject(value) {
  if (Array.isArray(value) && value.length === 4) return Object.fromEntries(POINT_NAMES.map((name, index) => [name, value[index]]));
  return value?.corners || value?.points || value;
}

function cleanPoints(value, names, message) {
  const candidate = value?.points || value;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new AppError(message, 400);
  const clean = {};
  for (const name of names) {
    const x = Number(candidate?.[name]?.x), y = Number(candidate?.[name]?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
      throw new AppError(`Calibration point ${name} must contain x and y values between 0 and 1.`, 400);
    }
    clean[name] = { x, y };
  }
  return clean;
}

function validatePoints(pointsInput, minimumArea = 0.006) {
  const clean = cleanPoints(pointObject(pointsInput), POINT_NAMES, 'Four normalized calibration points are required.');
  const [tl, tr, br, bl] = POINT_NAMES.map(name => clean[name]);
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const intersects = (a, b, c, d) => cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
  if (intersects(tl, tr, br, bl) || intersects(tr, br, bl, tl)) throw new AppError('Calibration corner lines cannot cross.', 400);
  if ([cross(tl, tr, br), cross(tr, br, bl), cross(br, bl, tl), cross(bl, tl, tr)].some(turn => turn <= 0)) {
    throw new AppError('Calibration corners must remain ordered: top left, top right, bottom right, bottom left.', 400);
  }
  const ordered = POINT_NAMES.map(name => clean[name]);
  const area = Math.abs(ordered.reduce((sum, point, index) => {
    const next = ordered[(index + 1) % ordered.length]; return sum + point.x * next.y - next.x * point.y;
  }, 0)) / 2;
  if (area < minimumArea) throw new AppError('Calibration plane is too small for reliable correction.', 400);
  return clean;
}

function advancedCenter(points) {
  return {
    x: (points.middleLeft.x + points.middleRight.x + points.topCenter.x + points.bottomCenter.x) / 4,
    y: (points.middleLeft.y + points.middleRight.y + points.topCenter.y + points.bottomCenter.y) / 4,
  };
}

function validateAdvancedPoints(input) {
  const points = cleanPoints(input, ADVANCED_POINT_NAMES, 'Eight normalized advanced calibration points are required.');
  if (!(points.topLeft.x < points.topCenter.x && points.topCenter.x < points.topRight.x &&
        points.middleLeft.x < points.middleRight.x &&
        points.bottomLeft.x < points.bottomCenter.x && points.bottomCenter.x < points.bottomRight.x)) {
    throw new AppError('Advanced calibration points must remain in left, center, and right order.', 400);
  }
  if (!(points.topLeft.y < points.middleLeft.y && points.middleLeft.y < points.bottomLeft.y &&
        points.topRight.y < points.middleRight.y && points.middleRight.y < points.bottomRight.y &&
        points.topCenter.y < points.bottomCenter.y)) {
    throw new AppError('Advanced calibration points must remain in top, middle, and bottom order.', 400);
  }
  const center = advancedCenter(points);
  [
    { topLeft: points.topLeft, topRight: points.topCenter, bottomRight: center, bottomLeft: points.middleLeft },
    { topLeft: points.topCenter, topRight: points.topRight, bottomRight: points.middleRight, bottomLeft: center },
    { topLeft: points.middleLeft, topRight: center, bottomRight: points.bottomCenter, bottomLeft: points.bottomLeft },
    { topLeft: center, topRight: points.middleRight, bottomRight: points.bottomRight, bottomLeft: points.bottomCenter },
  ].forEach(cell => validatePoints(cell, 0.002));
  return points;
}

function normalizeTrace(plane, corners) {
  const raw = Array.isArray(plane?.tracePoints) ? plane.tracePoints : Array.isArray(plane?.points) ? plane.points : null;
  if (!raw) return {};
  if (raw.length < 3 || raw.length > 200) throw new AppError('A board trace requires between 3 and 200 control points.', 400);
  const seen = new Set();
  const points = raw.map((point, index) => {
    const id = String(point.id || `point-${index + 1}`).trim().slice(0, 100), x = Number(point.x), y = Number(point.y);
    if (!id || seen.has(id)) throw new AppError('Trace control points require unique identifiers.', 400);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) throw new AppError('Trace points must stay within normalized image bounds.', 400);
    seen.add(id); return { id, x, y };
  });
  const segments = points.map((point, index) => ({
    type: 'line', fromPointId: point.id, toPointId: points[(index + 1) % points.length].id,
  }));
  return { perspectiveAnchors: corners, points, tracePoints: points, segments, closed: true };
}

function normalizePlanes(input, calibrationId = '') {
  const rawPlanes = Array.isArray(input?.planes) && input.planes.length
    ? input.planes
    : [{ id: calibrationId ? `legacy-${calibrationId}` : crypto.randomUUID(), label: 'Board', order: 1, corners: pointObject(input) }];
  if (!rawPlanes.length || rawPlanes.length > MAX_PLANES) throw new AppError(`Calibration requires between 1 and ${MAX_PLANES} planes.`, 400);
  const seen = new Set();
  return rawPlanes.map((plane, index) => {
    const id = String(plane.id || crypto.randomUUID()).trim().slice(0, 100);
    if (!id || seen.has(id)) throw new AppError('Each calibration plane must have a unique stable identifier.', 400);
    seen.add(id);
    const label = String(plane.label || `Plane ${index + 1}`).trim().slice(0, 80);
    if (!label) throw new AppError('Each calibration plane requires a name.', 400);
    const corners = validatePoints(plane.perspectiveAnchors || plane.corners);
    return { id, label, requestedOrder: Number(plane.order) || index + 1, corners, ...normalizeTrace(plane, corners) };
  }).sort((a, b) => a.requestedOrder - b.requestedOrder)
    .map(({ requestedOrder, ...plane }, index) => ({ ...plane, order: index + 1 }));
}

function calibrationMode(value) {
  const explicit = String(value?.calibrationMode || value?.mode || '').toUpperCase();
  if (explicit === 'ADVANCED') return 'ADVANCED';
  if (explicit === 'SIMPLE') return 'SIMPLE';
  const candidate = value?.advancedPoints || value?.controlPoints || value?.points?.points;
  return ADVANCED_POINT_NAMES.every(name => Number.isFinite(Number(candidate?.[name]?.x)) && Number.isFinite(Number(candidate?.[name]?.y)))
    ? 'ADVANCED' : 'SIMPLE';
}

function normalizeAdvanced(input, calibrationId = '') {
  const points = validateAdvancedPoints(input?.advancedPoints || input?.controlPoints || input?.points?.points || input?.points);
  return {
    boardId: String(input?.boardId || input?.points?.boardId || (calibrationId ? `advanced-${calibrationId}` : crypto.randomUUID())).slice(0, 100),
    label: String(input?.label || input?.points?.label || 'Whiteboard').trim().slice(0, 80) || 'Whiteboard',
    points,
  };
}

function safeCalibration(row) {
  const mode = calibrationMode(row.points);
  let planes, advanced = null;
  if (mode === 'ADVANCED') {
    advanced = normalizeAdvanced(row.points, row.id);
    planes = [{
      id: advanced.boardId, label: advanced.label, order: 1,
      corners: {
        topLeft: advanced.points.topLeft, topRight: advanced.points.topRight,
        bottomRight: advanced.points.bottomRight, bottomLeft: advanced.points.bottomLeft,
      },
    }];
  } else {
    planes = normalizePlanes(row.points, row.id);
  }
  return {
    id: row.id, instructorId: row.instructor_id, sourceKey: row.source_key,
    hardwareMode: row.hardware_mode, calibrationMode: mode,
    points: planes[0].corners, planes,
    boardId: advanced?.boardId || null, label: advanced?.label || null,
    advancedPoints: advanced?.points || null,
    schemaVersion: mode === 'ADVANCED' ? 3 : 4,
    sourceWidth: row.source_width, sourceHeight: row.source_height,
    isActive: row.is_active, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

async function getCalibrations(instructorId) {
  const { rows } = await pool.query('SELECT * FROM camera_calibrations WHERE instructor_id = $1 AND is_active = TRUE ORDER BY updated_at DESC', [instructorId]);
  return rows.map(safeCalibration);
}

async function getCalibration(instructorId, sourceKeyInput) {
  const sourceKey = typeof sourceKeyInput === 'string' ? sourceKeyInput.trim().slice(0, 255) : '';
  if (!sourceKey) throw new AppError('Camera source is required.', 400);
  const { rows } = await pool.query(
    'SELECT * FROM camera_calibrations WHERE instructor_id = $1 AND source_key = $2 AND is_active = TRUE ORDER BY updated_at DESC LIMIT 1',
    [instructorId, sourceKey]
  );
  return rows.length ? safeCalibration(rows[0]) : null;
}

async function saveCalibration(instructorId, input) {
  const sourceKey = typeof input.sourceKey === 'string' ? input.sourceKey.trim().slice(0, 255) : '';
  const hardwareMode = input.hardwareMode, sourceWidth = Number(input.sourceWidth), sourceHeight = Number(input.sourceHeight);
  if (!sourceKey) throw new AppError('Camera source is required.', 400);
  if (!['SIMULATED', 'BROWSER'].includes(hardwareMode)) throw new AppError('Invalid hardware mode.', 400);
  if (!Number.isInteger(sourceWidth) || sourceWidth < 1 || sourceWidth > 20000 ||
      !Number.isInteger(sourceHeight) || sourceHeight < 1 || sourceHeight > 20000) {
    throw new AppError('Camera frame dimensions are invalid.', 400);
  }
  const mode = calibrationMode(input);
  const stored = mode === 'ADVANCED'
    ? { schemaVersion: 3, mode: 'ADVANCED', ...normalizeAdvanced(input) }
    : { schemaVersion: 4, mode: 'SIMPLE', planes: normalizePlanes(input) };
  const { rows } = await pool.query(
    `INSERT INTO camera_calibrations
       (instructor_id, source_key, hardware_mode, points, source_width, source_height)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (instructor_id, source_key) DO UPDATE
       SET hardware_mode = EXCLUDED.hardware_mode, points = EXCLUDED.points,
           source_width = EXCLUDED.source_width, source_height = EXCLUDED.source_height,
           is_active = TRUE, updated_at = NOW()
     RETURNING *`,
    [instructorId, sourceKey, hardwareMode, JSON.stringify(stored), sourceWidth, sourceHeight]
  );
  return safeCalibration(rows[0]);
}

async function deleteCalibration(calibrationId, instructorId) {
  const { rowCount } = await pool.query('DELETE FROM camera_calibrations WHERE id = $1 AND instructor_id = $2', [calibrationId, instructorId]);
  if (!rowCount) throw new AppError('Calibration not found.', 404);
}

module.exports = {
  getCalibrations, getCalibration, saveCalibration, deleteCalibration,
  validatePoints, validateAdvancedPoints, normalizePlanes, normalizeAdvanced, calibrationMode, safeCalibration,
};



