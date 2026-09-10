import { normalizeLessonMathContent } from './mathContent.js';

const MATH_TOKEN = /(\$\$[\s\S]*?\$\$|\$(?:\\.|[^$\n])+\$|\\\[[\s\S]*?\\\]|\\\((?:\\.|[^\\\n])*?\\\))/g;
const SIMPLE_TEXT_MATH = /^\$\s*(-?(?:\d+(?:\.\d+)?|\.\d+)|true|false)\s*\$$/i;
const SINGLE_INLINE_MATH = /^\$(?:\\.|[^$\n])+\$$/;
const BARE_MATH = /^\s*\\(?:sqrt|frac|dfrac|tfrac|int|sum|prod|lim|sin|cos|tan|sec|csc|cot|log|ln|mathrm|vec|overline|partial|infty|alpha|beta|theta|pi|sigma|Delta|nabla|left|right|times|cdot|le|ge|ne)\b/;

export function normalizeMathEditorContent(value) {
  const original = String(value || '');
  const normalized = normalizeLessonMathContent(original);
  const source = normalized.needsReview.length ? original : normalized.content;
  const originalTrimmed = original.trim();
  const simple = originalTrimmed.match(SIMPLE_TEXT_MATH);
  if (simple) return simple[1];
  // The canonical lesson normalizer may promote a standalone expression to a
  // display block. Preserve an explicitly inline stored quiz value as inline.
  if (!normalized.needsReview.length && SINGLE_INLINE_MATH.test(originalTrimmed)) return originalTrimmed;
  return source;
}

export function splitMathEditorContent(value) {
  const source = normalizeMathEditorContent(value);
  const segments = [];
  let cursor = 0;

  for (const match of source.matchAll(MATH_TOKEN)) {
    if (match.index > cursor) segments.push({ type: 'text', value: source.slice(cursor, match.index), display: false });
    const token = match[0];
    const display = token.startsWith('$$') || token.startsWith('\\[');
    const latex = token.startsWith('$$') ? token.slice(2, -2)
      : token.startsWith('$') ? token.slice(1, -1)
        : token.slice(2, -2);
    segments.push({ type: 'math', value: latex.trim(), display });
    cursor = match.index + token.length;
  }

  if (cursor < source.length) segments.push({ type: 'text', value: source.slice(cursor), display: false });
  if (segments.length) return segments;

  // Keep malformed bare LaTeX editable without inventing or correcting its meaning.
  if (BARE_MATH.test(source)) return [{ type: 'math', value: source.trim(), display: false }];
  return [{ type: 'text', value: source, display: false }];
}

export function serializeMathEditorSegments(segments) {
  return segments.map(segment => {
    if (segment.type !== 'math') return segment.value;
    if (!segment.value) return '';
    return segment.display ? `$$\n${segment.value}\n$$` : `$${segment.value}$`;
  }).join('');
}
