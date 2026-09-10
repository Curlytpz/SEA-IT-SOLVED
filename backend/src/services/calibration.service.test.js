const assert = require('assert');
const {
  calibrationMode, normalizePlanes, safeCalibration,
  validateAdvancedPoints, validatePoints,
} = require('./calibration.service');

const corners = {
  topLeft: { x: 0.1, y: 0.1 }, topRight: { x: 0.9, y: 0.1 },
  bottomRight: { x: 0.9, y: 0.9 }, bottomLeft: { x: 0.1, y: 0.9 },
};
const advancedPoints = {
  topLeft: { x: 0.04, y: 0.06 }, topCenter: { x: 0.5, y: 0.04 }, topRight: { x: 0.96, y: 0.06 },
  middleLeft: { x: 0.02, y: 0.5 }, middleRight: { x: 0.98, y: 0.5 },
  bottomLeft: { x: 0.04, y: 0.94 }, bottomCenter: { x: 0.5, y: 0.96 }, bottomRight: { x: 0.96, y: 0.94 },
};

assert.deepStrictEqual(validatePoints(corners), corners);
assert.throws(() => validatePoints({ ...corners, bottomRight: { x: 0.2, y: 0.05 } }), /ordered|cross/i);
assert.throws(() => validatePoints({
  topLeft: { x: 0.1, y: 0.1 }, topRight: { x: 0.11, y: 0.1 },
  bottomRight: { x: 0.11, y: 0.11 }, bottomLeft: { x: 0.1, y: 0.11 },
}), /too small/i);

const two = normalizePlanes({ planes: [
  { id: 'right', label: 'Right', order: 2, corners },
  { id: 'left', label: 'Left', order: 1, corners },
] });
assert.deepStrictEqual(two.map(plane => plane.id), ['left', 'right']);
assert.deepStrictEqual(two.map(plane => plane.order), [1, 2]);

const legacy = safeCalibration({
  id: 'calibration-id', instructor_id: 'instructor', source_key: 'camera',
  hardware_mode: 'BROWSER', points: corners, source_width: 1280, source_height: 720,
  is_active: true, created_at: new Date(), updated_at: new Date(),
});
assert.strictEqual(legacy.calibrationMode, 'SIMPLE');
assert.strictEqual(legacy.planes.length, 1);
assert.strictEqual(legacy.planes[0].id, 'legacy-calibration-id');
assert.deepStrictEqual(legacy.points, corners);

assert.deepStrictEqual(validateAdvancedPoints(advancedPoints), advancedPoints);
assert.strictEqual(calibrationMode({ calibrationMode: 'ADVANCED', advancedPoints }), 'ADVANCED');
assert.throws(() => validateAdvancedPoints({ ...advancedPoints, topCenter: { x: 0.99, y: 0.04 } }), /left, center, and right/i);

const advanced = safeCalibration({
  id: 'advanced-calibration', instructor_id: 'instructor', source_key: 'mock-whiteboard-camera',
  hardware_mode: 'SIMULATED',
  points: { schemaVersion: 3, mode: 'ADVANCED', boardId: 'wide-board', label: 'Wide Board', points: advancedPoints },
  source_width: 1280, source_height: 720, is_active: true, created_at: new Date(), updated_at: new Date(),
});
assert.strictEqual(advanced.calibrationMode, 'ADVANCED');
assert.strictEqual(advanced.boardId, 'wide-board');
assert.deepStrictEqual(advanced.advancedPoints, advancedPoints);
assert.strictEqual(advanced.planes.length, 1);
assert.deepStrictEqual(advanced.planes[0].corners, {
  topLeft: advancedPoints.topLeft, topRight: advancedPoints.topRight,
  bottomRight: advancedPoints.bottomRight, bottomLeft: advancedPoints.bottomLeft,
});


const tracePoints = [
  { id: 'a', x: .1, y: .1 }, { id: 'b', x: .5, y: .08 },
  { id: 'c', x: .9, y: .1 }, { id: 'd', x: .9, y: .9 }, { id: 'e', x: .1, y: .9 },
];
const traceSegments = [
  { type: 'bezier', fromPointId: 'a', toPointId: 'b', handle1: { x: .2, y: .02 }, handle2: { x: .4, y: .02 } },
  { type: 'line', fromPointId: 'b', toPointId: 'c' },
  { type: 'line', fromPointId: 'c', toPointId: 'd' },
  { type: 'line', fromPointId: 'd', toPointId: 'e' },
  { type: 'line', fromPointId: 'e', toPointId: 'a' },
];
const traced = normalizePlanes({ planes: [{ id: 'trace', label: 'Trace', corners, perspectiveAnchors: corners, points: tracePoints, segments: traceSegments, closed: true }] })[0];
assert.deepStrictEqual(traced.perspectiveAnchors, corners);
assert.deepStrictEqual(traced.points, tracePoints);
assert.deepStrictEqual(traced.tracePoints, tracePoints);
assert.deepStrictEqual(traced.segments, tracePoints.map((point, index) => ({
  type: 'line', fromPointId: point.id, toPointId: tracePoints[(index + 1) % tracePoints.length].id,
})));
assert.strictEqual(traced.closed, true);

const staleSegments = [...traceSegments, { type: 'line', fromPointId: 'deleted-point', toPointId: 'a' }];
const sanitized = normalizePlanes({ planes: [{ id: 'stale', label: 'Stale trace', corners, points: tracePoints, segments: staleSegments }] })[0];
assert.deepStrictEqual(sanitized.points, tracePoints);
assert.strictEqual(sanitized.segments.length, tracePoints.length);
assert.ok(sanitized.segments.every((segment, index) =>
  segment.fromPointId === tracePoints[index].id &&
  segment.toPointId === tracePoints[(index + 1) % tracePoints.length].id
));

console.log('Simple, multi-plane, trace, legacy, and Advanced calibration validation tests passed.');



