export const QUAD_ORDER = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];

const MIN_NORMALIZED_AREA = 0.006;
const MAX_OUTPUT_DIMENSION = 4096;
const MAX_OUTPUT_PIXELS = 16_000_000;

function finitePoint(point) {
  return Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y));
}

function normalizedPoint(point) {
  return { x: Number(point.x), y: Number(point.y) };
}

function cross(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function polygonArea(points) {
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0)) / 2;
}

function asPointArray(input) {
  if (Array.isArray(input)) return input;
  return QUAD_ORDER.map(name => input?.[name]);
}

export function orderQuadPoints(input) {
  const points = asPointArray(input);
  if (points.length !== 4 || !points.every(finitePoint)) throw new Error('Four finite calibration corners are required.');

  const clean = points.map(normalizedPoint);
  const center = clean.reduce((sum, point) => ({ x: sum.x + point.x / 4, y: sum.y + point.y / 4 }), { x: 0, y: 0 });
  const circular = [...clean].sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x));
  const first = circular.reduce((best, point, index) => (
    point.x + point.y < circular[best].x + circular[best].y ? index : best
  ), 0);
  const ordered = [...circular.slice(first), ...circular.slice(0, first)];
  const clockwise = cross(ordered[0], ordered[1], ordered[2]) > 0;
  const canonical = clockwise ? ordered : [ordered[0], ordered[3], ordered[2], ordered[1]];
  return Object.fromEntries(QUAD_ORDER.map((name, index) => [name, canonical[index]]));
}

export function validatePerspectiveQuad(input) {
  // Named corners already carry canonical roles. Reject a crossed named quad rather
  // than silently changing which physical corner each role represents. Arrays are
  // intentionally reordered because they may arrive in arbitrary click order.
  if (!Array.isArray(input) && QUAD_ORDER.every(name => finitePoint(input?.[name]))) {
    const named = QUAD_ORDER.map(name => normalizedPoint(input[name]));
    if ([cross(named[0], named[1], named[2]), cross(named[1], named[2], named[3]), cross(named[2], named[3], named[0]), cross(named[3], named[0], named[1])].some(value => value <= 0)) {
      return { valid: false, error: 'Calibration corners must form a non-crossing quadrilateral.' };
    }
  }
  let corners;
  try {
    corners = orderQuadPoints(input);
  } catch (error) {
    return { valid: false, error: error.message };
  }
  const points = QUAD_ORDER.map(name => corners[name]);
  if (points.some(point => point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1)) {
    return { valid: false, error: 'Calibration corners must stay within the image.' };
  }
  const duplicate = points.some((point, index) => points.some((other, otherIndex) => otherIndex > index && Math.hypot(point.x - other.x, point.y - other.y) < 0.002));
  if (duplicate) return { valid: false, error: 'Calibration corners must not overlap.' };
  if (polygonArea(points) < MIN_NORMALIZED_AREA) return { valid: false, error: 'The calibration region is too small for perspective correction.' };
  if ([cross(points[0], points[1], points[2]), cross(points[1], points[2], points[3]), cross(points[2], points[3], points[0]), cross(points[3], points[0], points[1])].some(value => value <= 0)) {
    return { valid: false, error: 'Calibration corners must form a non-crossing quadrilateral.' };
  }
  return { valid: true, corners };
}

export function outputDimensions(input, sourceWidth, sourceHeight) {
  const checked = validatePerspectiveQuad(input);
  if (!checked.valid) throw new Error(checked.error);
  const width = Math.max(1, Number(sourceWidth) - 1);
  const height = Math.max(1, Number(sourceHeight) - 1);
  const { topLeft, topRight, bottomRight, bottomLeft } = checked.corners;
  const distance = (first, second) => Math.hypot((first.x - second.x) * width, (first.y - second.y) * height);
  const requestedWidth = Math.max(distance(topLeft, topRight), distance(bottomLeft, bottomRight));
  const requestedHeight = Math.max(distance(topLeft, bottomLeft), distance(topRight, bottomRight));
  if (requestedWidth < 2 || requestedHeight < 2) throw new Error('The calibration region is too thin for perspective correction.');
  const scale = Math.min(1, MAX_OUTPUT_DIMENSION / requestedWidth, MAX_OUTPUT_DIMENSION / requestedHeight, Math.sqrt(MAX_OUTPUT_PIXELS / (requestedWidth * requestedHeight)));
  return {
    corners: checked.corners,
    width: Math.max(2, Math.round(requestedWidth * scale)),
    height: Math.max(2, Math.round(requestedHeight * scale)),
  };
}
