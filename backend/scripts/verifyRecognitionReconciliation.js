const assert = require('assert/strict');
const {
  reconcileRecognitionBlocks,
  normalizeMathForComparison,
  plainTextFromBlocks,
} = require('../src/recognition/RecognitionReconciler');
const { normalizeExtraction } = require('../src/recognition/RecognitionNormalizer');
const { normalizeLessonCompilation } = require('../src/recognition/LessonRecognitionNormalizer');

function bounds(x, y, width = 0.24, height = 0.055) {
  return { x, y, width, height };
}

function math(latex, order, box, extra = {}) {
  return { type: 'math', order, text: null, latex, uncertain: false, uncertaintyReason: null, bounds: box, confidence: 0.8, ...extra };
}

function text(value, order, box, extra = {}) {
  return { type: 'text', order, text: value, latex: null, uncertain: false, uncertaintyReason: null, bounds: box, confidence: 0.8, ...extra };
}

function countMath(blocks, value) {
  return blocks.filter(block => block.type === 'math' && normalizeMathForComparison(block.latex) === normalizeMathForComparison(value)).length;
}

function providerBlock(block) {
  return {
    type: block.type,
    order: block.order,
    text: block.text,
    latex: block.latex,
    uncertain: block.uncertain,
    uncertaintyReason: block.uncertaintyReason,
    bounds: block.bounds,
  };
}

function main() {
  const duplicatedBoard = [
    text('Example A: substitution', 1, bounds(0.03, 0.04, 0.30, 0.045)),
    math('\\int (x^2 + 2x + 2)^4 (x + 1)\\, dx', 2, bounds(0.03, 0.12, 0.38, 0.06)),
    math('du = (2x + 2)dx', 3, bounds(0.04, 0.22)),
    math('du=(2x+2)\\, dx', 4, bounds(0.043, 0.223)),
    math('\\frac{1}{2}du = (x + 1)dx', 5, bounds(0.04, 0.31)),
    math('1/2 du=(x+1) dx', 6, bounds(0.043, 0.313)),
    text('Example B: a separate substitution', 7, bounds(0.63, 0.04, 0.30, 0.045)),
    math('du = (2x + 2)dx', 8, bounds(0.66, 0.22)),
    math('dv = (3x^2 - 1)dx', 9, bounds(0.66, 0.31)),
  ];
  const reconciled = reconcileRecognitionBlocks(duplicatedBoard, { scope: 'fixture-board' });
  assert.equal(reconciled.suppressedCount, 2, 'Only the two overlapping duplicates should be suppressed.');
  assert.equal(countMath(reconciled.blocks, 'du=(2x+2)dx'), 2, 'The same equation in separate board regions must remain.');
  assert.equal(countMath(reconciled.blocks, '\\frac{1}{2}du=(x+1)dx'), 1, 'Equivalent fraction formatting in one spatial region must collapse.');
  assert.ok(reconciled.blocks.some(block => block.latex === 'dv = (3x^2 - 1)dx'), 'Nearby but different equations must remain.');
  assert.deepEqual(reconciled.blocks.map(block => block.order), [1, 2, 3, 4, 5, 6, 7], 'Compiled blocks must retain stable sequential reading order.');

  const exactTiles = reconcileRecognitionBlocks([
    math('\\int x^2 dx', 2, bounds(0.2, 0.2), { reconciliationScope: 'capture-one' }),
    math('\\int x^2 dx', 1, bounds(0.205, 0.202), { reconciliationScope: 'capture-one' }),
  ]);
  assert.equal(exactTiles.blocks.length, 1, 'Overlapping tile candidates in the same parent capture must collapse.');

  const distantRepeat = reconcileRecognitionBlocks([
    math('f(x)=x^2', 1, bounds(0.04, 0.12)),
    math('f(x)=x^2', 2, bounds(0.70, 0.72)),
  ], { scope: 'fixture-board' });
  assert.equal(distantRepeat.blocks.length, 2, 'Spatially distinct legitimate repetitions must be preserved.');

  const rawProviderOutput = {
    plainText: 'Example A: substitution\nExample A: substitution',
    blocks: duplicatedBoard.map(providerBlock),
    warnings: [],
  };
  const rawSnapshot = structuredClone(rawProviderOutput);
  const normalizedImage = normalizeExtraction(rawProviderOutput);
  assert.deepEqual(rawProviderOutput, rawSnapshot, 'Normalization must not mutate raw provider output retained for audit.');
  assert.equal(normalizedImage.blocks.length, 7);
  assert.equal(normalizedImage.mathExpressions.length, 5);
  assert.match(normalizedImage.warnings.join(' '), /overlapping recognition blocks omitted/i);
  assert.equal((plainTextFromBlocks(normalizedImage.blocks).match(/Example A: substitution/g) || []).length, 1);

  const lessonInput = {
    pages: [{ pageNumber: 1, plainText: rawProviderOutput.plainText, blocks: rawSnapshot.blocks, warnings: [] }],
    warnings: [],
  };
  const lessonRawSnapshot = structuredClone(lessonInput);
  const lesson = normalizeLessonCompilation(lessonInput, [{ id: 'capture-fixture', captured_at: '2026-01-01T00:00:00.000Z' }]);
  assert.deepEqual(lessonInput, lessonRawSnapshot, 'Lesson compilation must preserve provider payload before storage.');
  assert.equal(lesson.pages[0].blocks.length, 7, 'Lesson context input must use the cleaned blocks.');
  assert.equal(countMath(lesson.pages[0].blocks, 'du=(2x+2)dx'), 2);
  assert.equal(lesson.pages[0].plainText.includes('Example B: a separate substitution'), true);

  console.log('PASS exact overlapping OCR/HMER blocks are suppressed');
  console.log('PASS conservative math formatting equivalence is reconciled');
  console.log('PASS spatially distinct repeated equations remain');
  console.log('PASS different nearby equations remain');
  console.log('PASS overlapping tile candidates in one capture are reconciled');
  console.log('PASS normalized camera/upload output is cleaned without mutating raw provider output');
  console.log('PASS lesson compilation emits cleaned blocks for context review and AI');
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
