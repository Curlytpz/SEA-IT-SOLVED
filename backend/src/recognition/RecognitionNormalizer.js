const { extractionSchema } = require('./geminiSchema');
const { reconcileRecognitionBlocks, plainTextFromBlocks } = require('./RecognitionReconciler');
const { normalizeRecognitionNumericArtifacts, normalizeRecognitionLatex } = require('../utils/mathContent');

function cleanText(value, maxLength) {
  if (value === null || value === undefined) return null;
  return String(value)
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
}

function normalizedRecognitionText(value, maxLength, { mathContext = false } = {}) {
  const cleaned = cleanText(value, maxLength);
  return cleaned === null ? null : normalizeRecognitionNumericArtifacts(cleaned, { mathContext });
}

function normalizeExtraction(input) {
  const parsed = extractionSchema.parse(input);
  const providerBlocks = parsed.blocks
    .map((block, index) => ({
      type: block.type,
      order: block.order,
      text: block.type === 'text' ? normalizedRecognitionText(block.text, 10000) : null,
      latex: block.type === 'math'
        ? normalizeRecognitionLatex(cleanText(block.latex, 10000)?.replace(/^\$+|\$+$/g, '').trim())
        : null,
      confidence: null,
      uncertain: block.uncertain,
      uncertaintyReason: block.uncertain ? cleanText(block.uncertaintyReason, 1000) : null,
      bounds: block.bounds,
      _index: index,
    }))
    .sort((a, b) => a.order - b.order || a._index - b._index)
    .map(({ _index, ...block }) => block);
  const reconciled = reconcileRecognitionBlocks(providerBlocks);
  const blocks = reconciled.blocks;

  const plainText = plainTextFromBlocks(blocks) || (blocks.length ? '' : normalizedRecognitionText(parsed.plainText, 50000) || '');
  if (!plainText && blocks.length === 0) {
    const error = new Error('No recognizable whiteboard content was found.');
    error.code = 'NO_RECOGNIZABLE_CONTENT';
    throw error;
  }

  return {
    plainText,
    blocks,
    mathExpressions: blocks.filter(block => block.type === 'math').map(block => ({
      order: block.order,
      latex: block.latex,
      confidence: null,
      uncertain: block.uncertain,
      uncertaintyReason: block.uncertaintyReason,
      bounds: block.bounds,
    })),
    warnings: [
      ...parsed.warnings.map(value => cleanText(value, 1000)).filter(Boolean),
      ...(reconciled.suppressedCount ? [`${reconciled.suppressedCount} overlapping recognition block${reconciled.suppressedCount === 1 ? '' : 's'} omitted from the compiled result.`] : []),
    ],
    overallConfidence: null,
  };
}

module.exports = { normalizeExtraction };
