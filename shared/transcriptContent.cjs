(function installTranscriptContent(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root[Symbol.for('sea-it-solved.transcriptContent')] = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createTranscriptContent() {
  function cleanTranscriptText(value) {
    return String(value == null ? '' : value).normalize('NFC').replace(/\s+/g, ' ').trim();
  }

  function numericOffset(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, number) : fallback;
  }

  function comparableTokens(text) {
    const tokens = [];
    const expression = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
    let match;
    while ((match = expression.exec(text))) {
      tokens.push({ key: match[0].normalize('NFKC').toLocaleLowerCase(), start: match.index, end: expression.lastIndex });
    }
    return tokens;
  }

  function adjacentRemainder(previous, incoming) {
    const before = cleanTranscriptText(previous);
    const next = cleanTranscriptText(incoming);
    if (!before || !next) return { text: next, overlapTokens: 0 };
    const left = comparableTokens(before);
    const right = comparableTokens(next);
    const maximum = Math.min(left.length, right.length, 24);
    let overlapTokens = 0;
    for (let size = maximum; size >= 2; size -= 1) {
      const leftStart = left.length - size;
      let matches = true;
      for (let index = 0; index < size; index += 1) {
        if (left[leftStart + index].key !== right[index].key) { matches = false; break; }
      }
      if (matches) { overlapTokens = size; break; }
    }
    if (!overlapTokens) return { text: next, overlapTokens: 0 };
    return { text: next.slice(right[overlapTokens - 1].end).replace(/^\s+/, ''), overlapTokens };
  }

  function appendTranscriptText(current, next) {
    const before = cleanTranscriptText(current);
    const incoming = cleanTranscriptText(next);
    if (!before) return incoming;
    if (!incoming) return before;
    const remainder = adjacentRemainder(before, incoming).text;
    if (!remainder) return before;
    return /^[,.;:!?)]/.test(remainder) ? `${before}${remainder}` : `${before} ${remainder}`;
  }

  function compileTranscriptSegments(segments) {
    const ordered = (Array.isArray(segments) ? segments : []).map((segment, index) => ({
      ...segment,
      text: cleanTranscriptText(segment?.text),
      originalIndex: Number.isInteger(segment?.originalIndex) ? segment.originalIndex : index,
      lessonOffsetStartMs: numericOffset(segment?.lessonOffsetStartMs, index),
      lessonOffsetEndMs: numericOffset(segment?.lessonOffsetEndMs, numericOffset(segment?.lessonOffsetStartMs, index)),
    })).filter(segment => segment.text).sort((a, b) =>
      a.lessonOffsetStartMs - b.lessonOffsetStartMs || a.lessonOffsetEndMs - b.lessonOffsetEndMs || a.originalIndex - b.originalIndex
    );
    return {
      text: ordered.reduce((compiled, segment) => appendTranscriptText(compiled, segment.text), ''),
      segments: ordered,
    };
  }

  return { cleanTranscriptText, adjacentRemainder, appendTranscriptText, compileTranscriptSegments };
});
