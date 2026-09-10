const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const JSZip = require('jszip');
const { buildLessonDocument, createLessonExport } = require('../src/services/lesson-export.service');

const acceptanceMath = [
  'x^2',
  '\\frac{x^3}{3}',
  '\\frac{\\sin x}{x}',
  '\\frac{x\\cos x-\\sin x}{x^2}',
  '\\left(\\frac{\\sin x}{x}\\right)\\left(\\frac{x\\cos x-\\sin x}{x^2}\\right)',
  '\\int \\frac{\\sin x(x\\cos x-\\sin x)}{x^3}\\,dx',
  "\\frac{d}{dx}\\left(\\frac{f}{g}\\right)=\\frac{gf'-fg'}{g^2}",
  '\\int x^n dx=\\frac{x^{n+1}}{n+1}+C',
];

const fixture = {
  lesson: {
    title: 'Integration and the Quotient Rule',
    subjectCode: 'MATH 204',
    subjectName: 'Integral Calculus',
    sectionName: 'BSCS 2A',
    instructorName: 'Prof. Ada Santos',
    startedAt: '2026-08-22T01:00:00.000Z',
  },
  materials: [
    {
      id: 'summary', type: 'SUMMARY', title: 'Lesson Summary',
      content: { markdown: '### Lesson Overview\nUse derivative and integration rules to analyze trigonometric quotients. According to Whiteboard Page 2, verify each result.\n\n.\n\nFour-point calibration test surface\n\n- Identify the numerator and denominator.\n- Keep equivalent factors grouped.\n\nSources: Whiteboard Page 2' },
    },
    {
      id: 'notes', type: 'NOTES', title: 'Detailed Lecture Notes',
      content: { markdown: `## Math acceptance set\n\n${acceptanceMath.map(expression => `$$\n${expression}\n$$`).join('\n\n')}\n\n### Key Point\nDifferentiate a quotient before simplifying the resulting fractions.` },
    },
    {
      id: 'worked', type: 'WORKED_EXAMPLE', title: 'Worked Example',
      content: { markdown: `### Procedure\n1. Differentiate the numerator and denominator.\n2. Apply the quotient rule.\n3. Simplify only after preserving the denominator.\n\n$$\n${acceptanceMath[6]}\n$$\n\n### Common Mistake\nDo not cancel terms across addition or subtraction.` },
    },
  ],
};

async function extractPdfText(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer), disableWorker: true });
  const pdf = await loadingTask.promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map(item => item.str).join(' '));
  }
  return { pageCount: pdf.numPages, text: pages.join('\n') };
}

async function main() {
  const model = buildLessonDocument(fixture);
  const serialized = JSON.stringify(model);
  assert.equal(serialized.includes('Whiteboard Page'), false);
  assert.equal(serialized.includes('Sources:'), false);
  assert.equal(serialized.includes('Four-point calibration'), false);
  assert.equal(serialized.includes('"markdown":"."'), false);
  assert.equal(model.sections.length, 3);
  assert.equal(model.title, fixture.lesson.title);
  assert.equal(model.course, 'MATH 204 • Integral Calculus • BSCS 2A');
  const canonicalMath = model.sections.flatMap(section => section.blocks).map(block => block.latex).filter(Boolean);
  for (const expression of acceptanceMath) assert.equal(canonicalMath.includes(expression), true, `Missing canonical math: ${expression}`);

  const outputDirectory = path.join(os.tmpdir(), 'sea-it-solved-lesson-export-qa');
  await fs.mkdir(outputDirectory, { recursive: true });
  const results = {};
  for (const format of ['pdf', 'docx']) {
    const exported = await createLessonExport({ ...fixture, document: model }, format);
    assert.ok(exported.buffer.length > 1000);
    const outputPath = path.join(outputDirectory, `lesson-export-fixture.${format}`);
    await fs.writeFile(outputPath, exported.buffer);
    results[format] = { ...exported, outputPath };
    console.log(outputPath);
  }

  assert.equal(results.pdf.buffer.subarray(0, 4).toString(), '%PDF');
  const pdf = await extractPdfText(results.pdf.buffer);
  assert.ok(pdf.pageCount >= 1 && pdf.pageCount <= 12);
  assert.match(pdf.text, /Integration and the Quotient Rule/);
  assert.match(pdf.text, /Math acceptance set/);
  assert.equal(pdf.text.includes('\\frac'), false);
  assert.equal(pdf.text.includes('Whiteboard Page'), false);

  assert.equal(results.docx.buffer.subarray(0, 2).toString(), 'PK');
  const zip = await JSZip.loadAsync(results.docx.buffer);
  const documentXml = await zip.file('word/document.xml').async('string');
  assert.ok((documentXml.match(/<m:f>/g) || []).length >= 8, 'DOCX must contain native Office Math fractions.');
  assert.ok((documentXml.match(/<m:sSup>/g) || []).length >= 5, 'DOCX must contain native Office Math superscripts.');
  assert.equal(documentXml.includes('\\frac'), false);
  assert.equal(documentXml.includes('Whiteboard Page'), false);

  console.log(JSON.stringify({
    canonicalSections: model.sections.length,
    canonicalMathBlocks: model.sections.flatMap(section => section.blocks).filter(block => block.type === 'math-block').length,
    pdfPages: pdf.pageCount,
    pdfBytes: results.pdf.buffer.length,
    docxBytes: results.docx.buffer.length,
    nativeDocxFractions: (documentXml.match(/<m:f>/g) || []).length,
    nativeDocxSuperscripts: (documentXml.match(/<m:sSup>/g) || []).length,
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});