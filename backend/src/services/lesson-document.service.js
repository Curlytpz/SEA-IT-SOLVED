const {
  normalizeGeneratedLessonTitle,
  normalizeGeneratedText,
  normalizeStudentLessonContent,
} = require('../utils/generatedContent');
const { normalizeLessonMathContent } = require('../utils/mathContent');

const MATERIAL_TITLES = {
  SUMMARY: 'Lesson Summary',
  NOTES: 'Lesson Notes',
  EXPLANATION: 'Concept Explanation',
  KEY_FORMULAS: 'Key Formulas',
  WORKED_EXAMPLE: 'Worked Example',
  COMMON_MISTAKES: 'Common Mistakes and Reminders',
};

const DISPLAY_MATH_STRUCTURE = /\\(?:d?frac|tfrac|int|sum|prod|begin|left|right)\b/;
const REVIEW_TEXT = 'Mathematical expression needs instructor review.';
const MAX_PARAGRAPH_LENGTH = 760;
const MAX_DERIVATION_LINES = 6;

function academicTitle(material, index) {
  const preferred = MATERIAL_TITLES[material.type];
  return normalizeGeneratedLessonTitle(preferred || material.title || `Lesson Section ${index + 1}`)
    .replace(/\s*[\[(]?OUTDATED[\])]?\s*/gi, ' ')
    .replace(/_+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim() || `Lesson Section ${index + 1}`;
}

function unwrapMathDelimiters(value) {
  let source = String(value || '').trim();
  for (let pass = 0; pass < 2; pass += 1) {
    const match = source.match(/^\$\$([\s\S]*?)\$\$$/)
      || source.match(/^\$([^$][\s\S]*?)\$$/)
      || source.match(/^\\\[([\s\S]*?)\\\]$/)
      || source.match(/^\\\(([\s\S]*?)\\\)$/);
    if (!match) break;
    source = match[1].trim();
  }
  return source;
}

function validatedLatex(value, display = false) {
  const source = unwrapMathDelimiters(value);
  if (!source) return null;
  const wrapped = display ? `$$\n${source}\n$$` : `$${source}$`;
  const normalized = normalizeLessonMathContent(wrapped);
  if (normalized.needsReview.length) return null;
  const normalizedContent = normalized.content.trim();
  const match = normalizedContent.match(/^\$\$\s*([\s\S]*?)\s*\$\$$/)
    || normalizedContent.match(/^\$([^$\n]+)\$$/);
  return match?.[1]?.trim() || null;
}

function inlineSegments(value) {
  const source = String(value || '');
  const segments = [];
  const pattern = /\$([^$\n]+)\$|\\\(([^\n]+?)\\\)/g;
  let cursor = 0;
  for (const match of source.matchAll(pattern)) {
    if (match.index > cursor) segments.push({ type: 'text', text: source.slice(cursor, match.index) });
    const latex = validatedLatex(match[1] || match[2], false);
    if (latex) segments.push({ type: 'math-inline', latex });
    else segments.push({ type: 'invalid-math', original: match[0], needsReview: true });
    cursor = match.index + match[0].length;
  }
  if (cursor < source.length) segments.push({ type: 'text', text: source.slice(cursor) });
  return segments.filter(segment => segment.type !== 'text' || segment.text);
}

function paragraphBlock(type, markdown, extra = {}) {
  const segments = inlineSegments(markdown);
  const safeMarkdown = segments.map(segment => segment.type === 'math-inline' ? `$${segment.latex}$` : segment.type === 'text' ? segment.text : '').join('');
  return {
    type,
    markdown: safeMarkdown,
    segments,
    needsReview: segments.some(segment => segment.needsReview),
    ...extra,
  };
}

function mathReviewBlock() {
  return paragraphBlock('math-review', REVIEW_TEXT, { needsReview: true });
}

function displayMathBlock(value) {
  const latex = validatedLatex(value, true);
  return latex
    ? { type: 'math-block', latex, markdown: `$$\n${latex}\n$$`, needsReview: false }
    : mathReviewBlock();
}

function displayMathBlocks(lines) {
  const values = lines.map(line => line.trim()).filter(Boolean);
  if (!values.length) return [];
  const source = values.join('\n');
  if (values.length === 1 || /\\begin\b|\\\\/.test(source)) return [displayMathBlock(source)];
  const expressions = values.map(value => validatedLatex(value, true));
  if (expressions.every(Boolean)) {
    const groups = [];
    for (let index = 0; index < expressions.length; index += MAX_DERIVATION_LINES) {
      const group = expressions.slice(index, index + MAX_DERIVATION_LINES);
      groups.push({
        type: 'math-derivation',
        expressions: group,
        markdown: group.map(value => `$$\n${value}\n$$`).join('\n\n'),
        needsReview: false,
      });
    }
    return groups;
  }
  return [mathReviewBlock()];
}

function splitLongParagraph(value) {
  const source = String(value || '').replace(/\s{2,}/g, ' ').trim();
  if (source.length <= MAX_PARAGRAPH_LENGTH) return source ? [source] : [];
  const sentences = source.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g)?.map(item => item.trim()).filter(Boolean) || [source];
  const chunks = [];
  let current = '';
  const push = valueToPush => {
    const clean = valueToPush.trim();
    if (clean) chunks.push(clean);
  };
  for (const sentence of sentences) {
    if (sentence.length > MAX_PARAGRAPH_LENGTH) {
      push(current);
      current = '';
      const words = sentence.split(/\s+/);
      let line = '';
      for (const word of words) {
        if (line && line.length + word.length + 1 > MAX_PARAGRAPH_LENGTH) {
          push(line);
          line = word;
        } else line = line ? `${line} ${word}` : word;
      }
      current = line;
      continue;
    }
    if (current && current.length + sentence.length + 1 > MAX_PARAGRAPH_LENGTH) {
      push(current);
      current = sentence;
    } else current = current ? `${current} ${sentence}` : sentence;
  }
  push(current);
  return chunks;
}

function escapePattern(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function restoreMarkdownStructure(markdown, titleCandidates = []) {
  const protectedTokens = [];
  const mathResult = normalizeLessonMathContent(normalizeStudentLessonContent(markdown));
  let source = mathResult.content.replace(
    /(\$\$[\s\S]*?\$\$|\$(?:\\.|[^$\n])+\$|\\\[[\s\S]*?\\\]|\\\((?:\\.|[^\\\n])*?\\\)|`[^`\n]*`)/g,
    token => `\u0001${protectedTokens.push(token) - 1}\u0002`
  );

  source = source
    .replace(/\\\*\\\*/g, '**')
    .replace(/[ \t]+(?=#{1,6}\s+\S)/g, '\n\n');

  for (const title of titleCandidates.filter(Boolean)) {
    const pattern = new RegExp(`^(#{1,6}\\s+${escapePattern(title)})[ \\t]+(?=\\S)`, 'i');
    source = source.replace(pattern, '$1\n\n');
  }

  source = source
    .replace(/^(#{1,6}\s+.*?)[ \t]+(?=[-*+]\s+\S)/gm, '$1\n\n')
    .replace(/[ \t]+(?=[-*+]\s+\S)/g, '\n')
    .replace(/[ \t]+(?=\d+[.)]\s+\S)/g, '\n')
    .replace(/[ \t]+(?=(?:\*\*)?(?:Concept|Formula or Definition|Example|Solution or Explanation|Key Point|Problem|Solution|Step\s+\d+|At\s+[^:]{1,24})(?:\*\*)?:\s)/g, '\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\u0001(\d+)\u0002/g, (_, index) => protectedTokens[Number(index)] || '');

  source = source.trim();
  if (mathResult.needsReview.length) source = `${source}\n\n> ${REVIEW_TEXT}`.trim();
  return source;
}

function parseMarkdown(markdown, titleCandidates = []) {
  const lines = restoreMarkdownStructure(markdown, titleCandidates).split('\n');
  const blocks = [];
  let paragraph = [];
  let code = false;
  let codeLines = [];
  let displayMath = false;
  let mathLines = [];

  const flushParagraph = () => {
    const source = paragraph.join(' ').replace(/\s{2,}/g, ' ').trim();
    paragraph = [];
    if (!source) return;
    const singleMath = source.match(/^\$([^$\n]+)\$$/) || source.match(/^\\\((.+)\\\)$/);
    if (singleMath && DISPLAY_MATH_STRUCTURE.test(singleMath[1])) {
      blocks.push(displayMathBlock(singleMath[1]));
      return;
    }
    splitLongParagraph(source).forEach(chunk => blocks.push(paragraphBlock('paragraph', chunk)));
  };
  const flushCode = () => {
    const text = codeLines.join('\n').trim();
    codeLines = [];
    if (text) blocks.push({ type: 'code', text, markdown: `\`\`\`\n${text}\n\`\`\`` });
  };
  const flushMath = () => {
    const linesToRender = mathLines;
    mathLines = [];
    blocks.push(...displayMathBlocks(linesToRender));
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('```')) {
      flushParagraph();
      if (code) flushCode();
      code = !code;
      continue;
    }
    if (code) { codeLines.push(rawLine); continue; }
    if (displayMath) {
      if (line === '$$' || line === '\\]') { displayMath = false; flushMath(); }
      else mathLines.push(line);
      continue;
    }
    if (line === '$$' || line === '\\[') { flushParagraph(); displayMath = true; continue; }
    if (/^math(?:ematical)? expression needs (?:instructor )?review\.?$/i.test(line)) {
      flushParagraph();
      blocks.push(mathReviewBlock());
      continue;
    }
    const singleDisplay = line.match(/^\$\$(.+)\$\$$/) || line.match(/^\\\[(.+)\\\]$/);
    if (singleDisplay) {
      flushParagraph();
      blocks.push(displayMathBlock(singleDisplay[1]));
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      blocks.push(paragraphBlock(level <= 2 ? 'heading' : 'subheading', heading[2], { level, text: heading[2] }));
      continue;
    }
    const note = line.match(/^(?:>\s*)?(?:(Note|Reminder|Key Point)\s*:\s*)?(.+)$/i);
    if ((line.startsWith('>') || /^(?:Note|Reminder|Key Point)\s*:/i.test(line)) && note) {
      flushParagraph();
      if (note[2].trim() === REVIEW_TEXT) blocks.push(mathReviewBlock());
      else blocks.push(paragraphBlock('note', note[2], { label: note[1] || 'Note' }));
      continue;
    }
    const bullet = line.match(/^[-*+]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      blocks.push(paragraphBlock('bullet', bullet[1]));
      continue;
    }
    const numbered = line.match(/^(\d+)[.)]\s+(.+)$/);
    if (numbered) {
      flushParagraph();
      blocks.push(paragraphBlock('number', numbered[2], { number: Number(numbered[1]) }));
      continue;
    }
    if (/^\|?\s*:?-{3,}/.test(line)) continue;
    if (line.includes('|')) {
      flushParagraph();
      const cells = line.replace(/^\||\|$/g, '').split('|').map(cell => cell.trim()).filter(Boolean);
      blocks.push({ type: 'table-row', cells, markdown: cells.join(' | ') });
      continue;
    }
    if (!line) flushParagraph();
    else paragraph.push(line);
  }
  flushParagraph();
  if (codeLines.length) flushCode();
  if (mathLines.length) flushMath();
  return blocks;
}

function buildLessonDocument(data) {
  const lesson = data.lesson || {};
  return {
    version: 1,
    title: normalizeGeneratedText(lesson.title, { maxLength: 255 }) || 'Lesson Notes',
    course: [lesson.subjectCode, lesson.subjectName, lesson.sectionName].filter(Boolean).join(' • '),
    subjectCode: lesson.subjectCode || '',
    subjectName: lesson.subjectName || '',
    sectionName: lesson.sectionName || '',
    instructor: normalizeGeneratedText(lesson.instructorName, { maxLength: 255 }),
    lessonDate: lesson.startedAt || lesson.endedAt || null,
    sections: (data.materials || []).map((material, index) => ({
      id: material.id || `section-${index + 1}`,
      materialId: material.id || null,
      materialType: material.type || null,
      title: academicTitle(material, index),
      blocks: parseMarkdown(material.content?.markdown, [material.title, academicTitle(material, index)]),
    })).filter(section => section.blocks.length),
  };
}

module.exports = { buildLessonDocument, parseMarkdown, restoreMarkdownStructure };
