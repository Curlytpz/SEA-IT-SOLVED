const LATEX_N_COMMANDS = /\\n(?=(?:eq|e|ot|u|abla|eg|mid|parallel|rightarrow|leftarrow|times)\b)/g;

function scalar(value) {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (!value || typeof value !== 'object') return '';
  for (const key of ['markdown', 'text', 'latex', 'prompt', 'content', 'value', 'label', 'title']) {
    if (typeof value[key] === 'string') return value[key];
  }
  return '';
}

function normalizeMarkdownHeadingLine(line) {
  const indentation = line.match(/^\s*/)?.[0] || '';
  let candidate = line.trim();
  const emphasized = candidate.match(/^(?:\*\*|__)([\s\S]*?)(?:\*\*|__)$/);
  if (emphasized) candidate = emphasized[1].trim();
  const heading = candidate.match(/^(?:[-*+]\s+|\d+[.)]\s+)?\\?(#{1,6})\s*(\S[\s\S]*?)\s*$/);
  return heading ? `${indentation}${heading[1]} ${heading[2].trim()}` : line;
}

function normalizeMarkdownHeadings(value) {
  return value.split('\n').map(normalizeMarkdownHeadingLine).join('\n');
}

function normalizeGeneratedText(value, { markdown = false, maxLength = 100000 } = {}) {
  let text = scalar(value).replace(/\r\n?/g, '\n').trim();
  const protectedCommands = [];
  text = text.replace(LATEX_N_COMMANDS, command => `\u0000${protectedCommands.push(command) - 1}\u0000`)
    .replace(/\\\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\\\t(?![A-Za-z])|\\t(?![A-Za-z])|\t/g, '  ')
    .replace(/\[object Object\]/gi, '');
  text = text.replace(/\u0000(\d+)\u0000/g, (_, index) => protectedCommands[Number(index)] || '');
  text = text
    .replace(/Mathematical Clarification\s*\(Additional Explanatory Assistance\)/gi, 'Additional Explanation')
    .replace(/Mathematical clarifications provided beyond the exact whiteboard content are explicitly labeled as additional explanatory assistance\.?/gi, '');
  if (markdown) {
    text = text.replace(/^\s*```(?:markdown|md|text|json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/i, '');
  } else {
    text = text.replace(/```(?:markdown|md|text|json)?|```/gi, '');
  }
  text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
  if (markdown) text = text
    .replace(/^(Lesson Summary|Detailed Lecture Notes|Concept Explanations?|Key Formulas?|Worked Examples?|Common Mistakes(?: and Reminders)?|Additional Explanation|Calculus Notations?|Problem|Solution|Step-by-step breakdown):?$/gim, (_, label) => `\n\n### ${label}\n\n`)
    .replace(/\n{3,}/g, '\n\n').trim();
  if (markdown) text = normalizeMarkdownHeadings(text);
  return text.slice(0, maxLength);
}

function normalizeGeneratedLessonTitle(value, maxLength = 255) {
  return normalizeGeneratedText(value, { markdown: true, maxLength })
    .replace(/\n+/g, ' ')
    .replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)?\\?#{1,6}\s*/, '')
    .replace(/^(?:\*\*|__)([\s\S]*?)(?:\*\*|__)$/, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, maxLength);
}

const PROVENANCE_LINE = /^\s*(?:grounded in|sources?|source references?|provenance)\s*:\s*.*$/gim;
const STUDENT_SOURCE_PREFIX = /^(\s*)(?:(?:according to|based on|from)\s+(?:the\s+)?|as\s+(?:written|shown|indicated)\s+(?:on|in)\s+(?:the\s+)?)(?:whiteboard(?:\s+page)?\s*\d+|captured whiteboard content|uploaded image|image|capture\s*(?:number|#)?\s*\d+|OCR\s*(?:capture|source|text)?\s*\d*|transcript\s*(?:chunk)?\s*\d+|[^\s,;:]+\.(?:png|jpe?g|pdf))\s*[,;:–—-]*\s*/gim;
const STUDENT_INTERNAL_REFERENCE = /\b(?:whiteboard(?:\s+page)?\s*\d+|OCR\s*(?:capture|source|text)?\s*\d*|transcript\s+chunk\s*\d+|capture\s*(?:ID|number|#)\s*[:#-]?\s*[\w-]+|(?:AI|context)\s*ID\s*[:#-]?\s*[\w-]+|[^\s,;:()]+\.(?:png|jpe?g|pdf))\b/gi;

const STUDENT_NOISE_LINE = /^(?:[.,;:!?_~`'"*#|\\/\-–—]+|(?:raw\s+)?(?:OCR|HMER)(?:\s+(?:output|result|text|label))?|recognized content|four[- ]point calibration test surface|calibration (?:test|preview|marker|point)s?|SEA-IT-SOLVED\s*[—-]\s*SIMULATED WHITEBOARD|[0-9a-f]{8}-[0-9a-f-]{27,})$/i;

function removeStudentNoiseLines(value) {
  return String(value || '').split('\n').filter(line => {
    const candidate = line.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+|#{1,6}\s+)?/, '').trim();
    return !candidate || !STUDENT_NOISE_LINE.test(candidate);
  }).join('\n');
}

function normalizeStudentLessonContent(value) {
  const cleaned = normalizeGeneratedText(value, { markdown: true })
    .replace(PROVENANCE_LINE, '')
    .replace(STUDENT_SOURCE_PREFIX, '$1')
    .replace(STUDENT_INTERNAL_REFERENCE, '')
    .replace(/\b(?:according to|based on|from)\s*[,;:–—-]+\s*/gi, '')
    .replace(/\b(?:sources?|source references?|provenance)\s*:\s*(?=$|[.;])/gim, '')
    .replace(/[ \t]+([,.;:])/g, '$1')
    .replace(/^[,;:–—]+\s*/gm, '')
    .replace(/[ \t]{2,}/g, ' ');
  return removeStudentNoiseLines(cleaned).replace(/\n{3,}/g, '\n\n').trim();
}
function comparableAnswer(value) {
  return normalizeGeneratedText(value, { maxLength: 1000 })
    .replace(/^\s*(?:\$\$?|\\\[|\\\()|(?:\$\$?|\\\]|\\\))\s*$/g, '')
    .replace(/^[A-D][.):]\s*/i, '')
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
    .replace(/[{}()\s]/g, '')
    .replace(/\\(?:left|right)/g, '')
    .toLocaleLowerCase();
}

module.exports = { comparableAnswer, normalizeGeneratedLessonTitle, normalizeGeneratedText, normalizeStudentLessonContent };
