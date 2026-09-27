const { normalizeGeneratedText } = require('./generatedContent');
const { normalizeLessonMathContent } = require('./mathContent');

function removeSafeSerializationArtifacts(value) {
  return String(value || '')
    .replace(/\\{2,}[ \t]*(?=\r?\n)/g, '')
    .replace(/[ \t]+\r?\n/g, '\n');
}

function normalizeQuizMathContent(value, { maxLength } = {}) {
  const generated = normalizeGeneratedText(value, { markdown: true, maxLength });
  if (!generated) return { content: '', needsReview: [] };
  return normalizeLessonMathContent(removeSafeSerializationArtifacts(generated));
}

module.exports = { normalizeQuizMathContent, removeSafeSerializationArtifacts };
