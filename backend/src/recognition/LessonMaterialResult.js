const { RecognitionProviderError } = require('./ProviderErrorMapper');

function isUsableRecognizedText(value, { minCharacters = 2, maxSuspiciousRatio = 0.15 } = {}) {
  if (typeof value !== 'string') return false;
  const characters = Array.from(value).filter(character => !/\s/u.test(character));
  if (characters.length < minCharacters) return false;
  const suspicious = characters.filter(character => {
    const codePoint = character.codePointAt(0);
    return codePoint === 0xfffd
      || (codePoint >= 0xe000 && codePoint <= 0xf8ff)
      || (codePoint >= 0xf0000 && codePoint <= 0xffffd)
      || (codePoint >= 0x100000 && codePoint <= 0x10fffd)
      || codePoint < 0x20;
  }).length;
  return suspicious / characters.length <= maxSuspiciousRatio;
}

function hasEntries(value) {
  return Array.isArray(value) && value.length > 0;
}

function pageHasRecognizableContent(page) {
  return isUsableRecognizedText(page?.text) || hasEntries(page?.mathExpressions);
}

function hasRecognizableMaterialContent(result) {
  if (!result || typeof result !== 'object') return false;
  if (isUsableRecognizedText(result.plainText) || hasEntries(result.mathExpressions)) return true;
  return Array.isArray(result.pages) && result.pages.some(pageHasRecognizableContent);
}

function materialRecognitionAssessment(result, { materialType, expectedPageCount } = {}) {
  const pages = Array.isArray(result?.pages) ? result.pages : [];
  const expected = materialType === 'PDF' ? Math.max(0, Number(expectedPageCount) || 0) : 1;
  const recognizedPageNumbers = new Set(
    pages
      .filter(pageHasRecognizableContent)
      .map(page => Number(page?.pageNumber))
      .filter(number => Number.isInteger(number) && number > 0)
  );
  const recognizedPageCount = materialType === 'PDF'
    ? Array.from({ length: expected }, (_, index) => index + 1).filter(number => recognizedPageNumbers.has(number)).length
    : (hasRecognizableMaterialContent(result) ? 1 : 0);
  return {
    expectedPageCount: expected,
    recognizedPageCount,
    complete: expected > 0 && recognizedPageCount === expected,
  };
}

function assertRecognizableMaterialContent(result, options = {}) {
  const assessment = materialRecognitionAssessment(result, options);
  if (assessment.complete) return result;
  if (assessment.recognizedPageCount > 0) {
    throw new RecognitionProviderError(
      'INCOMPLETE_RECOGNITION',
      `Recognition completed only ${assessment.recognizedPageCount} of ${assessment.expectedPageCount} PDF pages.`,
      true
    );
  }
  throw new RecognitionProviderError(
    'NO_RECOGNIZABLE_CONTENT',
    'No recognizable text or mathematics was found in this lesson material.',
    false
  );
}

module.exports = {
  isUsableRecognizedText,
  hasRecognizableMaterialContent,
  materialRecognitionAssessment,
  assertRecognizableMaterialContent,
};
