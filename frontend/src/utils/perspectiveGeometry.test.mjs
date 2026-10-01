import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { orderQuadPoints, outputDimensions, validatePerspectiveQuad } from './perspectiveGeometry.js';
import { CALIBRATION_FORMAT_CHANGED, calibrationValidation, createDefaultPlanes, preparePlaneForPerspective } from './calibrationPlanes.js';

const trapezoid = [
  { x: 0.16, y: 0.12 }, { x: 0.84, y: 0.08 },
  { x: 0.91, y: 0.89 }, { x: 0.08, y: 0.94 },
];

const ordered = orderQuadPoints([trapezoid[2], trapezoid[0], trapezoid[3], trapezoid[1]]);
assert.deepEqual(ordered, {
  topLeft: trapezoid[0], topRight: trapezoid[1], bottomRight: trapezoid[2], bottomLeft: trapezoid[3],
});

const dimensions = outputDimensions(ordered, 2000, 1000);
assert.ok(dimensions.width > 1600, 'output width uses the longer opposite board edge');
assert.ok(dimensions.height > 800, 'output height uses the longer opposite board edge');
assert.equal(dimensions.corners.topLeft.x, trapezoid[0].x);

assert.equal(validatePerspectiveQuad({
  topLeft: { x: 0.1, y: 0.1 }, topRight: { x: 0.9, y: 0.9 },
  bottomRight: { x: 0.9, y: 0.1 }, bottomLeft: { x: 0.1, y: 0.9 },
}).valid, false, 'crossing named quadrilaterals are rejected');
assert.equal(validatePerspectiveQuad([
  { x: 0.2, y: 0.2 }, { x: 0.2, y: 0.2 }, { x: 0.8, y: 0.8 }, { x: 0.1, y: 0.8 },
]).valid, false, 'duplicate corners are rejected');

const freshPlane = createDefaultPlanes()[0];
assert.equal(freshPlane.points.length, 4, 'Single Region starts with exactly four handles');
assert.equal(calibrationValidation({ calibrationMode: 'SIMPLE', planes: [freshPlane] }).valid, true, 'four-corner calibration persists as valid');
const legacyPlane = { ...freshPlane, points: [...freshPlane.points, { id: 'legacy-extra', x: 0.5, y: 0.5 }] };
assert.match(calibrationValidation({ calibrationMode: 'SIMPLE', planes: [legacyPlane] }).error, new RegExp(CALIBRATION_FORMAT_CHANGED), 'legacy five-point calibration requires recalibration');
assert.equal(preparePlaneForPerspective(legacyPlane).perspectiveError, CALIBRATION_FORMAT_CHANGED, 'legacy traces cannot reach the homography');

const overlaySource = readFileSync(new URL('../components/hardware/CalibrationOverlay.jsx', import.meta.url), 'utf8');
assert.doesNotMatch(overlaySource, /'Add Point'/, 'Single Region does not expose an Add Point action');
assert.match(overlaySource, /\['delete', 'Delete', true/, 'Delete remains visible but cannot remove a required corner');

console.log('perspective geometry tests passed');
