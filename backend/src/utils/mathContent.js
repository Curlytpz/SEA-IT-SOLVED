const katex = require('katex');
const { createLessonMathNormalizer } = require('../../../shared/mathContent.cjs');

const normalizeLessonMathContent = createLessonMathNormalizer(katex);

module.exports = { normalizeLessonMathContent };