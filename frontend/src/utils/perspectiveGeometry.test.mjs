import assert from 'node:assert/strict';
import { orderQuadPoints, outputDimensions, validatePerspectiveQuad } from './perspectiveGeometry.js';

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

console.log('perspective geometry tests passed');
