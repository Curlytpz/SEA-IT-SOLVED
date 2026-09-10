export const CORNER_ORDER = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];
export const ADVANCED_POINT_ORDER = ['topLeft', 'topCenter', 'topRight', 'middleLeft', 'middleRight', 'bottomLeft', 'bottomCenter', 'bottomRight'];
export const CALIBRATION_MODES = { SIMPLE: 'SIMPLE', ADVANCED: 'ADVANCED' };

export const DEFAULT_ADVANCED_POINTS = {
  topLeft: { x: 0.035, y: 0.065 }, topCenter: { x: 0.5, y: 0.045 }, topRight: { x: 0.965, y: 0.065 },
  middleLeft: { x: 0.02, y: 0.5 }, middleRight: { x: 0.98, y: 0.5 },
  bottomLeft: { x: 0.035, y: 0.935 }, bottomCenter: { x: 0.5, y: 0.955 }, bottomRight: { x: 0.965, y: 0.935 },
};

export const DEFAULT_CORNERS = {
  topLeft: { x: 0.1, y: 0.12 },
  topRight: { x: 0.9, y: 0.12 },
  bottomRight: { x: 0.9, y: 0.88 },
  bottomLeft: { x: 0.1, y: 0.88 },
};

const DEMO_BOUNDS = [
  [0.015, 0.285],
  [0.285, 0.505],
  [0.505, 0.73],
  [0.73, 0.985],
];

function planeId() {
  return globalThis.crypto?.randomUUID?.() || `plane-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function cloneCorners(corners) {
  return Object.fromEntries(CORNER_ORDER.map(name => [name, { ...corners[name] }]));
}
function traceId() { return globalThis.crypto?.randomUUID?.() || planeId(); }
function traceFor(corners) {
  const points = CORNER_ORDER.map(name => ({ id: traceId(), anchorName: name, ...corners[name] }));
  return { points, tracePoints: points, segments: points.map((point, index) => ({ type: 'line', fromPointId: point.id, toPointId: points[(index + 1) % points.length].id })), closed: true };
}
function assignAnchorNames(points, corners) {
  const assigned = points.map(point => ({ ...point }));
  const claimed = new Set();
  for (const name of CORNER_ORDER) {
    let index = assigned.findIndex((point, pointIndex) => point.anchorName === name && !claimed.has(pointIndex));
    if (index < 0) {
      index = assigned.reduce((best, point, pointIndex) => {
        if (claimed.has(pointIndex)) return best;
        const distance = Math.hypot(point.x - corners[name].x, point.y - corners[name].y);
        return best.index < 0 || distance < best.distance ? { index: pointIndex, distance } : best;
      }, { index: -1, distance: Infinity }).index;
    }
    if (index >= 0) {
      assigned[index].anchorName = name;
      claimed.add(index);
    }
  }
  return assigned;
}
function normalizedTrace(plane, corners) {
  const input = Array.isArray(plane?.points) ? plane.points : Array.isArray(plane?.tracePoints) ? plane.tracePoints : null;
  if (!input || input.length < 3) return traceFor(corners);
  const points = assignAnchorNames(input.map(point => ({
    id: String(point.id || traceId()),
    ...(CORNER_ORDER.includes(point.anchorName) ? { anchorName: point.anchorName } : {}),
    x: Number(point.x), y: Number(point.y),
  })), corners);
  const segments = points.map((point, index) => ({
    type: 'line', fromPointId: point.id, toPointId: points[(index + 1) % points.length].id,
  }));
  return { points, tracePoints: points, segments, closed: true };
}
function tracedPlane(plane) {
  const corners = legacyCorners(plane?.perspectiveAnchors) || legacyCorners(plane?.corners) || cloneCorners(DEFAULT_CORNERS);
  return { ...plane, corners, perspectiveAnchors: cloneCorners(corners), ...normalizedTrace(plane, corners) };
}

function cornersFromBounds(left, right, top = 0.055, bottom = 0.945) {
  return {
    topLeft: { x: left, y: top }, topRight: { x: right, y: top },
    bottomRight: { x: right, y: bottom }, bottomLeft: { x: left, y: bottom },
  };
}

export function createDefaultPlanes() {
  return [tracedPlane({ id: planeId(), label: 'Board', order: 1, corners: cloneCorners(DEFAULT_CORNERS) })];
}

export function createDefaultAdvancedCalibration() {
  return {
    boardId: planeId(),
    label: 'Whiteboard',
    points: Object.fromEntries(ADVANCED_POINT_ORDER.map(name => [name, { ...DEFAULT_ADVANCED_POINTS[name] }])),
  };
}

function cleanPointSet(value, names) {
  const candidate = value?.points || value;
  return names.every(name => Number.isFinite(Number(candidate?.[name]?.x)) && Number.isFinite(Number(candidate?.[name]?.y)))
    ? Object.fromEntries(names.map(name => [name, { x: Number(candidate[name].x), y: Number(candidate[name].y) }]))
    : null;
}

export function calibrationMode(value) {
  const explicit = String(value?.calibrationMode || value?.mode || '').toUpperCase();
  if (explicit === CALIBRATION_MODES.ADVANCED) return CALIBRATION_MODES.ADVANCED;
  if (explicit === CALIBRATION_MODES.SIMPLE) return CALIBRATION_MODES.SIMPLE;
  return cleanPointSet(value?.advancedPoints || value?.controlPoints || value?.points, ADVANCED_POINT_ORDER)
    ? CALIBRATION_MODES.ADVANCED : CALIBRATION_MODES.SIMPLE;
}

export function getAdvancedPoints(value) {
  return cleanPointSet(value?.advancedPoints || value?.controlPoints || value?.points, ADVANCED_POINT_ORDER);
}

export function outerCornersFromAdvanced(points) {
  return { topLeft: points.topLeft, topRight: points.topRight, bottomRight: points.bottomRight, bottomLeft: points.bottomLeft };
}

function legacyCorners(value) {
  const candidate = value?.corners || value?.points || value;
  return CORNER_ORDER.every(name => Number.isFinite(Number(candidate?.[name]?.x)) && Number.isFinite(Number(candidate?.[name]?.y)))
    ? Object.fromEntries(CORNER_ORDER.map(name => [name, { x: Number(candidate[name].x), y: Number(candidate[name].y) }]))
    : null;
}

function orderCornerPoints(points) {
  const byVerticalPosition = [...points].sort((a, b) => a.y - b.y || a.x - b.x);
  const top = byVerticalPosition.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottom = byVerticalPosition.slice(2, 4).sort((a, b) => a.x - b.x);
  return [top[0], top[1], bottom[1], bottom[0]];
}

export function preparePlaneForPerspective(plane) {
  if (!plane) return null;
  const existingCorners = legacyCorners(plane.perspectiveAnchors) || legacyCorners(plane.corners) || cloneCorners(DEFAULT_CORNERS);
  const trace = normalizedTrace(plane, existingCorners);
  const anchors = CORNER_ORDER.map(name => trace.points.find(point => point.anchorName === name));
  if (anchors.some(point => !point)) return null;
  const ordered = orderCornerPoints(anchors);
  const canonicalCorners = Object.fromEntries(CORNER_ORDER.map((name, index) => [name, { x: ordered[index].x, y: ordered[index].y }]));
  const anchorRoles = new Map(ordered.map((point, index) => [point.id, CORNER_ORDER[index]]));
  const points = trace.points.map(point => {
    const { anchorName: _anchorName, ...plainPoint } = point;
    const anchorName = anchorRoles.get(point.id);
    return anchorName ? { ...plainPoint, anchorName } : plainPoint;
  });
  return {
    ...plane,
    corners: canonicalCorners,
    perspectiveAnchors: canonicalCorners,
    points,
    tracePoints: points,
    segments: points.map((point, index) => ({ type: 'line', fromPointId: point.id, toPointId: points[(index + 1) % points.length].id })),
    closed: true,
  };
}

export function calibrationPlanes(value, options = {}) {
  if (calibrationMode(value) === CALIBRATION_MODES.ADVANCED) {
    const points = getAdvancedPoints(value);
    if (!points) return [];
    return [tracedPlane({
      id: String(value?.boardId || value?.planes?.[0]?.id || (value?.id ? `advanced-${value.id}` : planeId())),
      label: String(value?.label || value?.planes?.[0]?.label || 'Board').slice(0, 80),
      order: 1,
      corners: outerCornersFromAdvanced(points),
    })];
  }
  if (Array.isArray(value?.planes) && value.planes.length) {
    return value.planes.map((plane, index) => tracedPlane({
      id: String(plane.id || planeId()), label: String(plane.label || `Plane ${index + 1}`).slice(0, 80),
      order: index + 1, corners: legacyCorners(plane.perspectiveAnchors) || legacyCorners(plane.corners) || cloneCorners(DEFAULT_CORNERS),
      tracePoints: plane.tracePoints, points: Array.isArray(plane.points) ? plane.points : undefined, segments: plane.segments, closed: plane.closed,
    }));
  }
  const corners = legacyCorners(value);
  if (corners) return [{ id: String(value?.id ? `legacy-${value.id}` : planeId()), label: 'Board', order: 1, corners }];
  return createDefaultPlanes(options);
}

function cross(a, b, c) { return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); }
export function planeArea(corners) {
  const points = CORNER_ORDER.map(name => corners[name]);
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0)) / 2;
}
function intersects(a, b, c, d) {
  const ab1 = cross(a, b, c), ab2 = cross(a, b, d), cd1 = cross(c, d, a), cd2 = cross(c, d, b);
  return ab1 * ab2 < 0 && cd1 * cd2 < 0;
}

export function validatePlane(plane) {
  const corners = legacyCorners(plane?.corners);
  if (!corners || CORNER_ORDER.some(name => corners[name].x < 0 || corners[name].x > 1 || corners[name].y < 0 || corners[name].y > 1)) {
    return 'All four corners must stay within the image.';
  }
  const [tl, tr, br, bl] = CORNER_ORDER.map(name => corners[name]);
  if (intersects(tl, tr, br, bl) || intersects(tr, br, bl, tl)) return 'Corner lines cannot cross.';
  const turns = [cross(tl, tr, br), cross(tr, br, bl), cross(br, bl, tl), cross(bl, tl, tr)];
  if (turns.some(turn => turn <= 0)) return 'Corners must remain ordered: top left, top right, bottom right, bottom left.';
  if (planeArea(corners) < 0.006) return 'This plane is too small for reliable correction.';
  return '';
}

export function advancedCenter(points) {
  return {
    x: (points.middleLeft.x + points.middleRight.x + points.topCenter.x + points.bottomCenter.x) / 4,
    y: (points.middleLeft.y + points.middleRight.y + points.topCenter.y + points.bottomCenter.y) / 4,
  };
}

export function advancedCells(points) {
  const center = advancedCenter(points);
  return [
    { topLeft: points.topLeft, topRight: points.topCenter, bottomRight: center, bottomLeft: points.middleLeft },
    { topLeft: points.topCenter, topRight: points.topRight, bottomRight: points.middleRight, bottomLeft: center },
    { topLeft: points.middleLeft, topRight: center, bottomRight: points.bottomCenter, bottomLeft: points.bottomLeft },
    { topLeft: center, topRight: points.middleRight, bottomRight: points.bottomRight, bottomLeft: points.bottomCenter },
  ];
}

export function validateAdvancedPoints(pointsInput) {
  const points = cleanPointSet(pointsInput, ADVANCED_POINT_ORDER);
  if (!points || ADVANCED_POINT_ORDER.some(name => points[name].x < 0 || points[name].x > 1 || points[name].y < 0 || points[name].y > 1)) {
    return 'All eight advanced control points must stay within the image.';
  }
  if (!(points.topLeft.x < points.topCenter.x && points.topCenter.x < points.topRight.x &&
        points.middleLeft.x < points.middleRight.x &&
        points.bottomLeft.x < points.bottomCenter.x && points.bottomCenter.x < points.bottomRight.x)) {
    return 'Left, center, and right points must remain in horizontal order.';
  }
  if (!(points.topLeft.y < points.middleLeft.y && points.middleLeft.y < points.bottomLeft.y &&
        points.topRight.y < points.middleRight.y && points.middleRight.y < points.bottomRight.y &&
        points.topCenter.y < points.bottomCenter.y)) {
    return 'Top, middle, and bottom points must remain in vertical order.';
  }
  const invalidCell = advancedCells(points).map(corners => validatePlane({ corners })).find(Boolean);
  return invalidCell ? `Advanced mesh is invalid: ${invalidCell}` : '';
}

export function calibrationValidation(value) {
  const mode = calibrationMode(value);
  if (mode === CALIBRATION_MODES.ADVANCED) {
    const points = getAdvancedPoints(value);
    const error = points ? validateAdvancedPoints(points) : 'Eight advanced control points are required.';
    return { mode, valid: Boolean(points) && !error, error };
  }
  const hasSimpleGeometry = Array.isArray(value?.planes) ? value.planes.length > 0 : Boolean(legacyCorners(value));
  if (!hasSimpleGeometry) return { mode, valid: false, error: 'Four-point calibration geometry is required.' };
  const planes = calibrationPlanes(value);
  const invalid = planes.map(plane => ({ plane, error: validatePlane(plane) })).find(item => item.error);
  return {
    mode,
    valid: planes.length > 0 && !invalid,
    error: invalid ? `${invalid.plane.label}: ${invalid.error}` : planes.length ? '' : 'At least one calibration plane is required.',
  };
}

export function isValidCalibration(value) { return calibrationValidation(value).valid; }

function inside(point, start, end) { return cross(start, end, point) >= 0; }
function intersection(a, b, c, d) {
  const denominator = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
  if (Math.abs(denominator) < 1e-9) return b;
  const first = a.x * b.y - a.y * b.x, second = c.x * d.y - c.y * d.x;
  return { x: (first * (c.x - d.x) - (a.x - b.x) * second) / denominator, y: (first * (c.y - d.y) - (a.y - b.y) * second) / denominator };
}
function clippedPolygon(subject, clip) {
  let output = subject;
  for (let index = 0; index < clip.length; index += 1) {
    const start = clip[index], end = clip[(index + 1) % clip.length], input = output;
    output = [];
    for (let cursor = 0; cursor < input.length; cursor += 1) {
      const current = input[cursor], previous = input[(cursor + input.length - 1) % input.length];
      if (inside(current, start, end)) {
        if (!inside(previous, start, end)) output.push(intersection(previous, current, start, end));
        output.push(current);
      } else if (inside(previous, start, end)) output.push(intersection(previous, current, start, end));
    }
  }
  return output;
}
function polygonArea(points) {
  if (points.length < 3) return 0;
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]; return sum + point.x * next.y - next.x * point.y;
  }, 0)) / 2;
}

export function overlapWarnings(planes) {
  const warnings = [];
  for (let first = 0; first < planes.length; first += 1) for (let second = first + 1; second < planes.length; second += 1) {
    if (validatePlane(planes[first]) || validatePlane(planes[second])) continue;
    const a = CORNER_ORDER.map(name => planes[first].corners[name]);
    const b = CORNER_ORDER.map(name => planes[second].corners[name]);
    const overlap = polygonArea(clippedPolygon(a, b));
    const ratio = overlap / Math.min(planeArea(planes[first].corners), planeArea(planes[second].corners));
    if (ratio >= 0.65) warnings.push(`${planes[first].label} and ${planes[second].label} overlap by about ${Math.round(ratio * 100)}%.`);
  }
  return warnings;
}

export function duplicatePlane(source, count) {
  const offset = 0.025;
  const corners = Object.fromEntries(CORNER_ORDER.map(name => [name, {
    x: Math.min(0.98, Math.max(0.02, source.corners[name].x + offset)),
    y: Math.min(0.98, Math.max(0.02, source.corners[name].y + offset)),
  }]));
  return tracedPlane({ id: planeId(), label: `Plane ${count + 1}`, order: count + 1, corners });
}

export function orderedPlanes(planes) { return planes.map((plane, index) => ({ ...plane, order: index + 1 })); }





