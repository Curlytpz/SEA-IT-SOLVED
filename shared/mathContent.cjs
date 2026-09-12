function createLessonMathNormalizer(katex) {
const MATH_COMMAND_NAMES = [
  'frac', 'dfrac', 'tfrac', 'int', 'sum', 'prod', 'sqrt', 'lim',
  'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'log', 'ln', 'mathrm', 'text', 'vec', 'bar',
  'overline', 'underline', 'partial', 'infty', 'alpha', 'beta', 'gamma', 'delta',
  'theta', 'lambda', 'mu', 'pi', 'rho', 'sigma', 'phi', 'omega', 'Delta', 'nabla', 'left', 'right',
  'times', 'div', 'cdot', 'le', 'leq', 'ge', 'geq', 'ne', 'neq', 'lt', 'gt', 'approx', 'pm', 'mp', 'to',
  'rightarrow', 'leftarrow', 'Rightarrow', 'Leftarrow', 'Leftrightarrow', 'implies', 'iff', 'quad', 'qquad',
  'binom', 'begin', 'end',
];

const COMMAND_SOURCE = MATH_COMMAND_NAMES.join('|');
const BARE_MATH_COMMAND = new RegExp(`\\\\(?:${COMMAND_SOURCE})(?![A-Za-z])`);
const DOUBLE_ESCAPED_MATH_COMMAND = new RegExp(`\\\\{2,}(?=(?:${COMMAND_SOURCE})(?![A-Za-z]))`, 'g');
const DOUBLE_ESCAPED_MATH_DELIMITER = /\\{2,}(?=\$)/g;
const BARE_SCRIPT_EXPRESSION = /\b([A-Za-z](?:\([^\n)]*\))?(?:(?:\^(?:\{[^}\n]+\}|[-+]?\d+|[A-Za-z]|[+-])|_(?:\{[^}\n]+\}|\d+|[ijkn])))+)(?![A-Za-z0-9_])/g;
const PROTECTED_INLINE = /(`[^`\n]*`|\$[^$\n]+\$)/g;
const INLINE_MATH = /(^|[^$])\$([^$\n]+)\$(?!\$)/g;
const TALL_MATH = /\\(?:d?frac|tfrac|int|sum|prod|lim|sqrt|begin|left|right)(?![A-Za-z])/;
const MATH_WORDS = new Set(['dx', 'dy', 'dt', 'du', 'dv', 'dw', 'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'log', 'ln', 'mod']);

function repairEscapedMathDollars(value) {
  let output = '';
  let inlineMath = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '$' && value[index + 1] === '$') {
      output += '$$';
      index += 1;
      continue;
    }
    if (character === '$') {
      inlineMath = !inlineMath;
      output += character;
      continue;
    }
    if (character === '\\' && value[index + 1] === '$') {
      if (inlineMath) {
        index += 1;
        continue;
      }
      const hasClosingDelimiter = value.slice(index + 2).includes('$');
      if (hasClosingDelimiter) {
        output += '$';
        inlineMath = true;
        index += 1;
        continue;
      }
    }
    output += character;
  }
  return output;
}

function repairStructuralEscapes(value) {
  return String(value || '').replace(/\\(?=\d)/g, '').replace(/\\([_^])(?=[{A-Za-z0-9+-])/g, '$1').trim();
}

function repairOcrCurrency(value) {
  return String(value || '')
    .replace(/\\\$\s*\.(\d+)/g, '0.$1')
    .replace(/\\\$\s*(\d+(?:\.\d+)?)/g, '$1')
    .replace(/\$\s*\.(\d+)/g, (match, digits, offset, source) => (
      /^\s*\$/.test(source.slice(offset + match.length)) ? match : `0.${digits}`
    ));
}

function normalizeOcrNotation(value) {
  const superscripts = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-' };
  return String(value || '')
    .replace(/\\+limit(?=\s*(?:_|\{))/gi, '\\lim')
    .replace(/\\+limits?\b/gi, match => /s$/i.test(match) ? 'limits' : 'limit')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]/g, symbol => `^{${superscripts[symbol]}}`)
    .replace(/−/g, '-')
    .replace(/⇒|=>/g, '\\Rightarrow ')
    .replace(/→/g, '\\to ')
    .replace(/([A-Za-z0-9}\])])\s*->\s*(?=[A-Za-z0-9({\[+\-])/g, '$1\\to ')
    .replace(/Δ/g, '\\Delta ')
    .replace(/θ/g, '\\theta ')
    .replace(/π/g, '\\pi ')
    .replace(/(^|[^\\A-Za-z])lim(?![A-Za-z])(?=\s*(?:_|\{|\(?\s*[A-Za-z\\]))/g, '$1\\lim')
    .replace(/(^|[^\\A-Za-z])(sin|cos|tan)(?![A-Za-z])(?=\s*(?:\(|[A-Za-z\\]))/g, '$1\\$2');
}

function removeMathReviewDiagnostics(value) {
  return String(value || '')
    .replace(/\bMathematical expression needs (?:instructor )?review\.?/gi, '')
    .replace(/[ \t]{2,}/g, ' ');
}

function validateLatex(value) {
  try {
    katex.renderToString(value, {
      displayMode: false,
      throwOnError: true,
      strict: 'ignore',
      trust: false,
      maxSize: 10,
      maxExpand: 1000,
    });
    return true;
  } catch {
    return false;
  }
}

function readableMathFallback(value, delimiters) {
  const source = String(value || '').trim();
  if (!source) return '';
  if (delimiters === '$$') {
    return `\n\n\`\`\`latex\n${source.replace(/\`\`\`/g, '\` \` \`')}\n\`\`\`\n\n`;
  }
  const longestFence = Math.max(0, ...([...source.matchAll(/\`+/g)].map(match => match[0].length)));
  const fence = '`'.repeat(Math.max(1, longestFence + 1));
  return `${fence}${source.replace(/\r?\n+/g, ' ')}${fence}`;
}

function recordMathFragment(rawValue, state, delimiters = '$') {
  const latex = repairStructuralEscapes(rawValue);
  if (!latex) return '';
  if (!validateLatex(latex)) {
    state.needsReview.push({ original: String(rawValue || ''), reason: 'KATEX_PARSE_ERROR' });
    return readableMathFallback(rawValue, delimiters);
  }
  return delimiters === '$$' ? `$$\n${latex}\n$$` : `$${latex}$`;
}

function recordDisplayFragment(rawValue, state) {
  const source = repairStructuralEscapes(rawValue);
  const lines = source.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length > 1 && !/\\begin\b|\\\\/.test(source) && lines.every(validateLatex)) {
    return lines.map(line => recordMathFragment(line, state, '$$')).filter(Boolean).join('\n\n');
  }
  return recordMathFragment(source, state, '$$');
}

function commandNameAt(value, index) {
  return value.slice(index + 1).match(/^[A-Za-z]+/)?.[0] || '';
}

function expandMathStart(value, start) {
  if (commandNameAt(value, start) !== 'to') return start;
  const prefix = value.slice(0, start);
  const variable = prefix.match(/([A-Za-z])\s*$/);
  return variable ? start - variable[0].length : start;
}

function nextTokenLooksMathematical(value, index) {
  const rest = value.slice(index).trimStart();
  if (!rest) return false;
  if (/^[=+*/<>|]/.test(rest)) return true;
  if (/^-?(?:\d|\.\d)/.test(rest)) return true;
  if (rest.startsWith('\\')) return true;
  const word = rest.match(/^[A-Za-z]+/)?.[0];
  return Boolean(word && (word.length === 1 || MATH_WORDS.has(word)));
}

function rawMathEnd(value, start) {
  let depth = 0;
  for (let index = start; index < value.length;) {
    const character = value[index];
    if (character === '\\') {
      const command = value.slice(index + 1).match(/^[A-Za-z]+/)?.[0];
      index += command ? command.length + 1 : Math.min(2, value.length - index);
      continue;
    }
    if (character === '{' || character === '[' || character === '(') {
      depth += 1;
      index += 1;
      continue;
    }
    if (character === '}' || character === ']' || character === ')') {
      if (depth === 0) return index;
      depth -= 1;
      index += 1;
      continue;
    }
    if (depth > 0) {
      index += 1;
      continue;
    }
    if (/\s/.test(character)) {
      if (!nextTokenLooksMathematical(value, index)) return index;
      index += 1;
      continue;
    }
    if (/[A-Za-z]/.test(character)) {
      const word = value.slice(index).match(/^[A-Za-z]+/)?.[0] || '';
      if (word.length > 1 && !MATH_WORDS.has(word)) return index;
      index += word.length || 1;
      continue;
    }
    if (/\d/.test(character)) {
      const number = value.slice(index).match(/^\d+(?:\.\d+)?/)?.[0] || character;
      index += number.length;
      continue;
    }
    if (/[_^=+*/<>|'-]/.test(character)) {
      index += 1;
      continue;
    }
    if (character === '.' && /\d/.test(value[index - 1] || '') && /\d/.test(value[index + 1] || '')) {
      index += 1;
      continue;
    }
    return index;
  }
  return value.length;
}

function normalizeBareScripts(value, state) {
  return value.replace(BARE_SCRIPT_EXPRESSION, (_, expression) => recordMathFragment(expression, state));
}

function normalizePlainText(value, state) {
  let cursor = 0;
  let output = '';
  while (cursor < value.length) {
    const remainder = value.slice(cursor);
    const match = BARE_MATH_COMMAND.exec(remainder);
    if (!match) return output + normalizeBareScripts(remainder, state);

    const commandStart = cursor + match.index;
    const start = expandMathStart(value, commandStart);
    const end = rawMathEnd(value, commandStart);
    const expression = value.slice(start, end).trim();
    if (!expression) return output + normalizeBareScripts(remainder, state);

    output += normalizeBareScripts(value.slice(cursor, start), state);
    output += recordMathFragment(expression, state);
    cursor = end;
  }
  return output;
}

function removeUnmatchedDelimiters(line) {
  if (!BARE_MATH_COMMAND.test(line)) return line;
  let value = line;
  const inlineDollarCount = [...value.matchAll(/(^|[^$])\$(?!\$)/g)].length;
  if (inlineDollarCount % 2 === 1) value = value.replace(/(^|[^$])\$(?!\$)/g, '$1');
  if (value.includes('\\(') !== value.includes('\\)')) value = value.replace(/\\[()]/g, '');
  if (value.includes('\\[') !== value.includes('\\]')) value = value.replace(/\\[\[\]]/g, '');
  return value;
}

function promoteDisplayMath(line) {
  const expressions = [...line.matchAll(INLINE_MATH)];
  if (!expressions.length) return line;
  const prose = line.replace(INLINE_MATH, '$1').replace(/[\s.,;:!?()[\]{}-]+/g, '');
  const standalone = !prose;
  return line.replace(INLINE_MATH, (match, prefix, expression) => {
    const latex = expression.trim();
    const display = (standalone && (TALL_MATH.test(latex) || latex.length > 38)) || latex.length > 96;
    return display ? `${prefix}\n\n$$\n${latex}\n$$\n\n` : match;
  }).replace(/\n{3,}/g, '\n\n');
}

function looksLikeStandaloneFormula(value) {
  const candidate = String(value || '').trim();
  if (!candidate || /\b(?:and|or|because|before|after|where|when)\b/i.test(candidate)) return false;
  const startsLikeFormula = /^(?:\\lim\b|\\Delta\s*[A-Za-z]*\s*\\to\b|[A-Za-z](?:\([^)]*\))?\s*(?:=|\\to\b))/.test(candidate);
  const hasMathSignal = /\\(?:lim|frac|to|Delta|sin|cos|tan|sqrt|Rightarrow)\b|[\d^+*/=()[\]]/.test(candidate);
  return startsLikeFormula && hasMathSignal;
}

function normalizeInlineLine(line, state) {
  const safeLine = removeUnmatchedDelimiters(line);
  if (looksLikeStandaloneFormula(safeLine)) return promoteDisplayMath(recordMathFragment(safeLine, state));
  let cursor = 0;
  let output = '';
  for (const match of safeLine.matchAll(PROTECTED_INLINE)) {
    output += normalizePlainText(safeLine.slice(cursor, match.index), state);
    if (match[0].startsWith('`')) output += match[0];
    else output += recordMathFragment(match[0].slice(1, -1), state);
    cursor = match.index + match[0].length;
  }
  output += normalizePlainText(safeLine.slice(cursor), state);
  return promoteDisplayMath(output);
}

/**
 * Canonical display-time normalization for stored OCR, generated lessons,
 * assistant messages, and quiz content. Invalid source is retained only in the
 * returned needsReview metadata and is never injected into rendered Markdown.
 */
function normalizeLessonMathContent(value) {
  const prepared = normalizeOcrNotation(repairOcrCurrency(removeMathReviewDiagnostics(String(value || ''))
    .replace(DOUBLE_ESCAPED_MATH_COMMAND, '\\')
    .replace(DOUBLE_ESCAPED_MATH_DELIMITER, '')));
  const source = repairEscapedMathDollars(prepared)
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, expression) => `\n$$\n${expression.trim()}\n$$\n`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, expression) => `$${expression.trim()}$`);

  const state = { needsReview: [] };
  const lines = source.split('\n');
  const output = [];
  let fenced = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      fenced = !fenced;
      output.push(line);
      continue;
    }
    if (fenced) {
      output.push(line);
      continue;
    }

    const sameLineDisplay = trimmed.match(/^\$\$([\s\S]+)\$\$$/);
    if (sameLineDisplay) {
      output.push(recordDisplayFragment(sameLineDisplay[1], state));
      continue;
    }
    if (trimmed === '$$') {
      const closing = lines.slice(index + 1).findIndex(candidate => candidate.trim() === '$$');
      if (closing >= 0) {
        const end = index + closing + 1;
        output.push(recordDisplayFragment(lines.slice(index + 1, end).join('\n'), state));
        index = end;
      }
      continue;
    }
    output.push(normalizeInlineLine(line, state));
  }

  return {
    content: output.join('\n').replace(/\n{3,}/g, '\n\n'),
    needsReview: state.needsReview,
  };
}

return normalizeLessonMathContent;
}

const mathContentApi = { createLessonMathNormalizer };
if (typeof module !== 'undefined' && module.exports) module.exports = mathContentApi;
if (typeof globalThis !== 'undefined') globalThis[Symbol.for('sea-it-solved.mathContent')] = mathContentApi;
