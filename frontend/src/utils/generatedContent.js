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

export function normalizeGeneratedContent(value) {
  let text = scalar(value).replace(/\r\n?/g, '\n').trim();
  const protectedCommands = [];
  text = text.replace(LATEX_N_COMMANDS, command => `\u0000${protectedCommands.push(command) - 1}\u0000`)
    .replace(/\\\\n/g, '\n').replace(/\\n/g, '\n')
    .replace(/\\\\t(?![A-Za-z])|\\t(?![A-Za-z])|\t/g, '  ')
    .replace(/\[object Object\]/gi, '');
  text = text.replace(/\u0000(\d+)\u0000/g, (_, index) => protectedCommands[Number(index)] || '');
  text = text
    .replace(/Mathematical Clarification\s*\(Additional Explanatory Assistance\)/gi, 'Additional Explanation')
    .replace(/Mathematical clarifications provided beyond the exact whiteboard content are explicitly labeled as additional explanatory assistance\.?/gi, '');
  text = text.replace(/^\s*```(?:markdown|md|text|json)?\s*\n?/i, '')
    .replace(/\n?\s*```\s*$/i, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  text = normalizeMarkdownHeadings(text);
  return text
    .replace(/^(Lesson Summary|Detailed Lecture Notes|Concept Explanations?|Key Formulas?|Worked Examples?|Common Mistakes(?: and Reminders)?|Mathematical Clarification(?: \(Additional Explanatory Assistance\))?|Additional Explanation|Calculus Notations?|Problem|Solution|Step-by-step breakdown):?$/gim, (_, label) => `\n\n### ${label}\n\n`)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function normalizeGeneratedLessonTitle(value) {
  return normalizeGeneratedContent(value)
    .replace(/\n+/g, ' ')
    .replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)?\\?#{1,6}\s*/, '')
    .replace(/^(?:\*\*|__)([\s\S]*?)(?:\*\*|__)$/, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function isAssistantStructure(block) {
  return /^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>|```|\$\$|\|)/.test(block.trim());
}

export function normalizeAssistantContent(value) {
  const blocks = normalizeGeneratedContent(value).split(/\n{2,}/).map(block => block.trim()).filter(Boolean);
  const merged = [];
  for (const block of blocks) {
    const previous = merged.at(-1);
    const previousWords = previous?.split(/\s+/).length || 0;
    const blockWords = block.split(/\s+/).length;
    const canMerge = previous
      && !isAssistantStructure(previous)
      && !isAssistantStructure(block)
      && (previousWords <= 18 || blockWords <= 18)
      && previous.length + block.length < 520;
    if (canMerge) merged[merged.length - 1] = `${previous} ${block}`;
    else merged.push(block);
  }
  return merged.join('\n\n');
}

const STUDENT_SOURCE_PREFIX = /^(\s*)(?:(?:according to|based on|from)\s+(?:the\s+)?|as\s+(?:written|shown|indicated)\s+(?:on|in)\s+(?:the\s+)?)(?:whiteboard(?:\s+page)?\s*\d+|captured whiteboard content|uploaded image|image|capture\s*(?:number|#)?\s*\d+|OCR\s*(?:capture|source|text)?\s*\d*|transcript\s*(?:chunk)?\s*\d+|[^\s,;:]+\.(?:png|jpe?g|pdf))\s*[,;:–—-]*\s*/gim;
const STUDENT_INTERNAL_REFERENCE = /\b(?:whiteboard(?:\s+page)?\s*\d+|OCR\s*(?:capture|source|text)?\s*\d*|transcript\s+chunk\s*\d+|capture\s*(?:ID|number|#)\s*[:#-]?\s*[\w-]+|(?:AI|context)\s*ID\s*[:#-]?\s*[\w-]+|[^\s,;:()]+\.(?:png|jpe?g|pdf))\b/gi;
const PROVENANCE_LINE = /^\s*(?:grounded in|sources?|source references?|provenance)\s*:\s*.*$/gim;

const STUDENT_NOISE_LINE = /^(?:[.,;:!?_~`'"*#|\\/\-–—]+|(?:raw\s+)?(?:OCR|HMER)(?:\s+(?:output|result|text|label))?|recognized content|four[- ]point calibration test surface|calibration (?:test|preview|marker|point)s?|SEA-IT-SOLVED\s*[—-]\s*SIMULATED WHITEBOARD|[0-9a-f]{8}-[0-9a-f-]{27,})$/i;

function removeStudentNoiseLines(value) {
  return String(value || '').split('\n').filter(line => {
    const candidate = line.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+|#{1,6}\s+)?/, '').trim();
    return !candidate || !STUDENT_NOISE_LINE.test(candidate);
  }).join('\n');
}

export function normalizeStudentLessonContent(value) {
  const cleaned = normalizeGeneratedContent(value)
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
const QUIZ_SOURCE_PREFIX = /^\s*(?:according to|based on|from)\s+(?:the\s+)?(?:whiteboard(?:\s+page)?\s*\d+|captured whiteboard content|uploaded image|image|capture\s*(?:number|#)?\s*\d+|[\w.-]+\.(?:png|jpe?g|pdf))\s*[,;:-]\s*/i;
const QUIZ_SOURCE_REFERENCE = /\b(?:whiteboard(?:\s+page)?\s*\d+|capture\s*(?:number|#)?\s*\d+|OCR\s*(?:source|text)?|[\w.-]+\.(?:png|jpe?g|pdf))\b\s*[,;:-]?\s*/gi;
const QUIZ_SOURCE_DETECTOR = /\b(?:according to|based on|as written|as shown|captured whiteboard content|uploaded image|whiteboard(?:\s+page)?\s*\d+|capture\s*(?:number|#)?\s*\d+|OCR\s*(?:source|text)?|[\w.-]+\.(?:png|jpe?g|pdf))\b/i;

export function normalizeQuizDisplayContent(value) {
  let text = normalizeGeneratedContent(value);
  let previous = '';
  while (text !== previous) {
    previous = text;
    text = text.replace(QUIZ_SOURCE_PREFIX, '');
  }
  return text
    .replace(/\b(?:as written|as shown|as indicated)\s+(?:on|in)\s+/gi, '')
    .replace(QUIZ_SOURCE_REFERENCE, '')
    .replace(/\b(?:the\s+)?captured whiteboard content\b\s*[,;:-]?\s*/gi, '')
    .replace(/\b(?:the\s+)?uploaded image\b\s*[,;:-]?\s*/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[,;:]+\s*/, '')
    .trim();
}
export function composeQuizQuestionStem(value) {
  let text = normalizeQuizDisplayContent(value)
    .replace(/\$\$\s*([\s\S]*?)\s*\$\$/g, (_, expression) => `$${expression.trim()}$`)
    .replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_, expression) => `$${expression.trim()}$`)
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\s+([?.!,;:])/g, '$1')
    .replace(/([([{])\s+/g, '$1')
    .replace(/\s+([)\]}])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
  text = text
    .replace(/^what is (?:the )?(?:evaluated )?result of (?:the )?indefinite integral\s+/i, 'Evaluate the indefinite integral ')
    .replace(/^([a-z])/, letter => letter.toUpperCase());
  if (/^(?:Evaluate|Find|Determine|Solve|Compute)\b/.test(text)) text = text.replace(/\?$/, '.');
  return text;
}

export function containsQuizSourceReference(value) {
  return QUIZ_SOURCE_DETECTOR.test(normalizeGeneratedContent(value));
}
