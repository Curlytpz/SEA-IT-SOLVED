import { normalizeLessonMathContent } from './mathContent.js';

const JUNK_LINE = /^(?:[.,;:!?_~`'"*#|\\/\-–—]+|(?:raw\s+)?(?:OCR|HMER)(?:\s+(?:output|result|text|label))?|recognized content)$/i;
const DISPLAY_COMMAND = /\\(?:d?frac|tfrac|int|sum|prod|lim|sqrt|begin)(?![A-Za-z])/;
function mathKey(value) {
  return String(value || '')
    .replace(/\\(?:left|right)/g, '')
    .replace(/\\,/g, '')
    .replace(/[\s$\\{}()[\].,;:!?]/g, '')
    .toLowerCase();
}

function obviousJunk(value) {
  const candidate = String(value || '').trim();
  return !candidate || JUNK_LINE.test(candidate);
}

function splitLongProse(line) {
  if (line.length < 220) return [line];
  return line.split(/(?<=[.!?])\s+(?=[A-Z"'])/).map(value => value.trim()).filter(Boolean);
}

function reviewLines(value) {
  const seen = new Set();
  const lines = String(value || '').replace(/\r\n?/g, '\n').split('\n')
    .flatMap(line => splitLongProse(line.trim()))
    .map(line => line.trim())
    .filter(line => !obviousJunk(line));

  return lines.filter(line => {
    const key = line.replace(/\s+/g, ' ').toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(line => {
    const letters = line.replace(/[^A-Za-z]/g, '');
    const headingLike = letters.length >= 4 && line.length <= 90 && letters === letters.toUpperCase();
    return headingLike && !DISPLAY_COMMAND.test(line) ? `#### ${line}` : line;
  });
}

function unwrapOuterMathDelimiters(value) {
  let candidate = String(value || '').trim();
  for (let pass = 0; pass < 2; pass += 1) {
    const displayDollar = candidate.match(/^\$\$([\s\S]*?)\$\$$/);
    const inlineDollar = candidate.match(/^\$([^$][\s\S]*?)\$$/);
    const displayBracket = candidate.match(/^\\\[([\s\S]*?)\\\]$/);
    const inlineBracket = candidate.match(/^\\\(([\s\S]*?)\\\)$/);
    const unwrapped = displayDollar?.[1] || inlineDollar?.[1] || displayBracket?.[1] || inlineBracket?.[1];
    if (unwrapped === undefined) break;
    candidate = unwrapped.trim();
  }
  return candidate;
}

export function normalizeLessonContextMathValues(mathValues) {
  const seen = new Set();
  return (Array.isArray(mathValues) ? mathValues : [])
    .map(unwrapOuterMathDelimiters)
    .filter(value => {
      if (obviousJunk(value)) return false;
      const key = mathKey(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function interleaveRecognizedMath(text, mathValues) {
  let source = String(text || '').replace(/\r\n?/g, '\n');
  const entries = normalizeLessonContextMathValues(mathValues).map((value, index) => {
    const normalized = normalizeLessonMathContent(`$$\n${value}\n$$`);
    return {
      value,
      token: `sea_math_step_${index}`,
      markdown: normalized.needsReview.length ? `$$\n${value}\n$$` : normalized.content,
      valid: normalized.needsReview.length === 0,
      placed: false,
    };
  });

  entries.slice().sort((left, right) => right.value.length - left.value.length).forEach(entry => {
    const index = source.indexOf(entry.value);
    if (index < 0) return;
    source = `${source.slice(0, index)}\n\n${entry.token}\n\n${source.slice(index + entry.value.length)}`;
    entry.placed = true;
  });

  const textBlocks = reviewLines(source).map(line => {
    const entry = entries.find(candidate => line.includes(candidate.token));
    return entry ? entry.markdown : line;
  });
  const additionalMath = entries.filter(entry => !entry.placed).map(entry => entry.markdown);
  return [...textBlocks, ...additionalMath].filter(Boolean);
}

export function buildLessonContextPreview(text, mathValues) {
  const blocks = interleaveRecognizedMath(text, mathValues);
  const full = blocks.join('\n\n').trim();
  const conciseBlocks = blocks.slice(0, 6);
  const concise = conciseBlocks.join('\n\n').trim();
  return {
    concise: concise || full,
    full,
    isLong: blocks.length > 6 || String(text || '').length > 520 || normalizeLessonContextMathValues(mathValues).length > 2,
  };
}
