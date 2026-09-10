const { transcriptionSchema } = require('./transcriptionSchema');

function cleanText(value, maxLength) {
  if (value === null || value === undefined) return null;
  return String(value).normalize('NFC').replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maxLength);
}

function normalizeTranscription(input, durationMs) {
  const parsed = transcriptionSchema.parse(input);
  const toleranceMs = 2000;
  let previousStart = -1;
  const segments = parsed.segments.map((segment, index) => {
    if (segment.startMs < previousStart || segment.endMs > durationMs + toleranceMs) {
      const error = new Error('Transcript timestamps are outside the recording timeline.');
      error.code = 'INVALID_PROVIDER_OUTPUT';
      throw error;
    }
    previousStart = segment.startMs;
    return {
      order: segment.order,
      audioStartMs: segment.startMs,
      audioEndMs: segment.endMs,
      language: cleanText(segment.language, 64),
      text: cleanText(segment.text, 10000),
      confidence: null,
      uncertain: segment.uncertain,
      uncertaintyReason: segment.uncertain ? cleanText(segment.uncertaintyReason, 1000) : null,
      _index: index,
    };
  }).sort((a, b) => a.audioStartMs - b.audioStartMs || a.order - b.order || a._index - b._index)
    .map(({ _index, ...segment }) => segment);

  const transcriptText = cleanText(parsed.transcriptText, 500000) || '';
  if (!transcriptText && segments.length === 0) {
    const error = new Error('No recognizable speech was found.');
    error.code = 'NO_RECOGNIZABLE_SPEECH';
    throw error;
  }
  return {
    language: cleanText(parsed.language, 64),
    transcriptText,
    segments,
    warnings: parsed.warnings.map(value => cleanText(value, 1000)).filter(Boolean),
  };
}

module.exports = { normalizeTranscription };
