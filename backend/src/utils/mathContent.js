const katex = require('katex');
const {
  createLessonMathNormalizer,
  normalizeRecognitionNumericArtifacts,
  normalizeRecognitionLatex,
} = require('../../../shared/mathContent.cjs');

const normalizeLessonMathContent = createLessonMathNormalizer(katex);

module.exports = { normalizeLessonMathContent, normalizeRecognitionNumericArtifacts, normalizeRecognitionLatex };
