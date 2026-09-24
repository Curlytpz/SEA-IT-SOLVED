const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isUsableRecognizedText,
  hasRecognizableMaterialContent,
  materialRecognitionAssessment,
  assertRecognizableMaterialContent,
} = require('./LessonMaterialResult');

test('rejects private-use PDF font codes that render as empty boxes', () => {
  const brokenPdfText = '            ';
  assert.equal(isUsableRecognizedText(brokenPdfText), false);
  assert.equal(hasRecognizableMaterialContent({
    plainText: brokenPdfText,
    mathExpressions: [],
    pages: [{ pageNumber: 1, text: brokenPdfText, mathExpressions: [] }],
  }), false);
  assert.equal(isUsableRecognizedText('Calculus integral identities and examples'), true);
});

test('accepts recognized PDF page text and mathematics', () => {
  assert.equal(hasRecognizableMaterialContent({ pages: [{ pageNumber: 1, text: 'Limits', mathExpressions: [] }] }), true);
  assert.equal(hasRecognizableMaterialContent({ pages: [{ pageNumber: 1, text: '', mathExpressions: ['x^2'] }] }), true);
  const result = { pages: [
    { pageNumber: 1, text: 'Limits', mathExpressions: [] },
    { pageNumber: 2, text: '', mathExpressions: ['x^2'] },
  ] };
  assert.deepEqual(materialRecognitionAssessment(result, { materialType: 'PDF', expectedPageCount: 2 }), {
    expectedPageCount: 2,
    recognizedPageCount: 2,
    complete: true,
  });
  assert.equal(assertRecognizableMaterialContent(result, { materialType: 'PDF', expectedPageCount: 2 }), result);
});

test('rejects empty material results instead of marking them ready for review', () => {
  assert.equal(hasRecognizableMaterialContent({ plainText: '', mathExpressions: [], pages: [] }), false);
  assert.throws(
    () => assertRecognizableMaterialContent(
      { plainText: '  ', mathExpressions: [], pages: [{ pageNumber: 1, text: '', mathExpressions: [] }] },
      { materialType: 'PDF', expectedPageCount: 1 }
    ),
    error => error.code === 'NO_RECOGNIZABLE_CONTENT' && error.retryable === false
  );
});

test('requires every expected PDF page before reporting successful recognition', () => {
  const partial = { pages: [
    { pageNumber: 1, text: 'Recognized page', mathExpressions: [] },
    { pageNumber: 2, text: '', mathExpressions: [] },
  ] };
  assert.deepEqual(materialRecognitionAssessment(partial, { materialType: 'PDF', expectedPageCount: 2 }), {
    expectedPageCount: 2,
    recognizedPageCount: 1,
    complete: false,
  });
  assert.throws(
    () => assertRecognizableMaterialContent(partial, { materialType: 'PDF', expectedPageCount: 2 }),
    error => error.code === 'INCOMPLETE_RECOGNITION' && error.retryable === true
  );
});
