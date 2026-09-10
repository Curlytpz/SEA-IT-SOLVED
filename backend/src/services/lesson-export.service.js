const path = require('node:path');
const PDFDocument = require('pdfkit');
const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  Math: OfficeMath,
  MathFraction,
  MathRadical,
  MathRun,
  MathSubScript,
  MathSubSuperScript,
  MathSuperScript,
  Packer,
  PageNumber,
  Paragraph,
  TextRun,
} = require('docx');
const AppError = require('../utils/AppError');
const { buildLessonDocument } = require('./lesson-document.service');
const { mathToUnicode, parseLatex } = require('../utils/mathExpression');

const A4_DOCX = { width: 11906, height: 16838 };
const PDF_MARGIN = 56;
const BODY_COLOR = '#334155';
const HEADING_COLOR = '#0f172a';

function formattedDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'Not specified';
}

function safeFilenamePart(value, fallback) {
  const clean = String(value || '').replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ').replace(/\s{2,}/g, ' ').replace(/[. ]+$/g, '').trim();
  return (clean || fallback).slice(0, 80);
}

function exportFilename(model, extension) {
  const course = safeFilenamePart(model.subjectCode || model.course.split(' • ')[0], 'Course');
  const title = safeFilenamePart(model.title, 'Lesson');
  return `${course} - ${title} - Lesson Notes.${extension}`;
}

function cleanMarkdownText(value) {
  return String(value || '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(?:\*\*|__)(.*?)(?:\*\*|__)/g, '$1')
    .replace(/(?:\*|_)(.*?)(?:\*|_)/g, '$1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

function blockText(block) {
  if (Array.isArray(block.segments) && block.segments.length) {
    return block.segments.map(segment => segment.type === 'math-inline'
      ? mathToUnicode(parseLatex(segment.latex))
      : cleanMarkdownText(segment.text)).join('').replace(/\s{2,}/g, ' ').trim();
  }
  if (block.type === 'table-row') return (block.cells || []).map(cleanMarkdownText).join('    ');
  return cleanMarkdownText(block.text || block.markdown);
}

function registerPdfFonts(doc) {
  const standardFonts = path.join(__dirname, '../../node_modules/pdfjs-dist/standard_fonts');
  doc.registerFont('LessonSans', path.join(standardFonts, 'LiberationSans-Regular.ttf'));
  doc.registerFont('LessonSansBold', path.join(standardFonts, 'LiberationSans-Bold.ttf'));
  doc.registerFont('LessonSansItalic', path.join(standardFonts, 'LiberationSans-Italic.ttf'));
}

function ensurePdfSpace(doc, height) {
  const bottom = doc.page.height - doc.page.margins.bottom - 18;
  if (doc.y + height > bottom) doc.addPage();
}

function measureMath(doc, node, size) {
  if (!node) return { width: 0, height: size * 1.25 };
  if (node.type === 'text') {
    doc.font('LessonSansItalic').fontSize(size);
    return { width: doc.widthOfString(node.text || ''), height: size * 1.25 };
  }
  if (node.type === 'row') {
    const children = node.children.map(child => ({ node: child, box: measureMath(doc, child, size) }));
    return { width: children.reduce((total, item) => total + item.box.width, 0), height: Math.max(size * 1.25, ...children.map(item => item.box.height)), children };
  }
  if (node.type === 'fraction') {
    const numerator = measureMath(doc, node.numerator, size * 0.86);
    const denominator = measureMath(doc, node.denominator, size * 0.86);
    return { width: Math.max(numerator.width, denominator.width) + 8, height: numerator.height + denominator.height + 7, numerator, denominator };
  }
  if (node.type === 'radical') {
    const body = measureMath(doc, node.body, size);
    const symbol = measureMath(doc, { type: 'text', text: '√' }, size * 1.2);
    return { width: symbol.width + body.width + 3, height: Math.max(symbol.height, body.height + 3), symbol, body };
  }
  if (node.type === 'sup' || node.type === 'sub' || node.type === 'subsup') {
    const base = measureMath(doc, node.base, size);
    const superScript = node.superScript ? measureMath(doc, node.superScript, size * 0.68) : null;
    const subScript = node.subScript ? measureMath(doc, node.subScript, size * 0.68) : null;
    return {
      width: base.width + Math.max(superScript?.width || 0, subScript?.width || 0),
      height: base.height + (superScript ? superScript.height * 0.55 : 0) + (subScript ? subScript.height * 0.55 : 0),
      base, superScript, subScript,
    };
  }
  const symbol = node.type === 'integral' ? '∫' : node.symbol || '';
  return measureMath(doc, { type: 'text', text: symbol }, size * 1.28);
}

function drawMath(doc, node, x, y, size, measured = measureMath(doc, node, size)) {
  if (!node) return;
  if (node.type === 'text') {
    doc.font('LessonSansItalic').fontSize(size).fillColor(HEADING_COLOR).text(node.text || '', x, y, { lineBreak: false });
    return;
  }
  if (node.type === 'row') {
    let cursor = x;
    const children = measured.children || node.children.map(child => ({ node: child, box: measureMath(doc, child, size) }));
    for (const child of children) {
      drawMath(doc, child.node, cursor, y + (measured.height - child.box.height) / 2, size, child.box);
      cursor += child.box.width;
    }
    return;
  }
  if (node.type === 'fraction') {
    drawMath(doc, node.numerator, x + (measured.width - measured.numerator.width) / 2, y, size * 0.86, measured.numerator);
    const lineY = y + measured.numerator.height + 1.5;
    doc.save().strokeColor(HEADING_COLOR).lineWidth(Math.max(0.7, size / 15)).moveTo(x + 1, lineY).lineTo(x + measured.width - 1, lineY).stroke().restore();
    drawMath(doc, node.denominator, x + (measured.width - measured.denominator.width) / 2, lineY + 4, size * 0.86, measured.denominator);
    return;
  }
  if (node.type === 'radical') {
    drawMath(doc, { type: 'text', text: '√' }, x, y, size * 1.2, measured.symbol);
    const bodyX = x + measured.symbol.width + 1;
    doc.save().strokeColor(HEADING_COLOR).lineWidth(0.7).moveTo(bodyX, y + 1).lineTo(bodyX + measured.body.width + 1, y + 1).stroke().restore();
    drawMath(doc, node.body, bodyX, y + 3, size, measured.body);
    return;
  }
  if (node.type === 'sup' || node.type === 'sub' || node.type === 'subsup') {
    const superOffset = measured.superScript ? measured.superScript.height * 0.45 : 0;
    drawMath(doc, node.base, x, y + superOffset, size, measured.base);
    const scriptX = x + measured.base.width;
    if (node.superScript) drawMath(doc, node.superScript, scriptX, y, size * 0.68, measured.superScript);
    if (node.subScript) drawMath(doc, node.subScript, scriptX, y + superOffset + measured.base.height * 0.66, size * 0.68, measured.subScript);
    return;
  }
  drawMath(doc, { type: 'text', text: node.type === 'integral' ? '∫' : node.symbol || '' }, x, y, size * 1.28, measured);
}

function writePdfMath(doc, latex) {
  const ast = parseLatex(latex);
  const available = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  let size = 13;
  let box = measureMath(doc, ast, size);
  if (box.width > available) {
    size = Math.max(9, size * (available / box.width));
    box = measureMath(doc, ast, size);
  }
  ensurePdfSpace(doc, box.height + 24);
  const startY = doc.y;
  const x = doc.page.margins.left + Math.max(0, (available - box.width) / 2);
  drawMath(doc, ast, x, startY + 6, size, box);
  doc.x = doc.page.margins.left;
  doc.y = startY + box.height + 18;
}

function writePdfBlock(doc, block) {
  if (block.type === 'math-review') return;
  if (block.type === 'math-block') { writePdfMath(doc, block.latex); return; }
  if (block.type === 'math-derivation') { (block.expressions || []).forEach(latex => writePdfMath(doc, latex)); return; }
  if (block.type === 'heading' || block.type === 'subheading') {
    ensurePdfSpace(doc, 64);
    doc.moveDown(0.25).font('LessonSansBold').fontSize(block.level <= 2 ? 14 : 12).fillColor(HEADING_COLOR)
      .text(blockText(block), { lineGap: 2 }).moveDown(0.18);
    return;
  }
  if (block.type === 'note') {
    ensurePdfSpace(doc, 48);
    doc.font('LessonSansItalic').fontSize(10).fillColor('#475569')
      .text(`${block.label ? `${block.label}: ` : ''}${blockText(block)}`, { indent: 12, lineGap: 3 }).moveDown(0.4);
    return;
  }
  if (block.type === 'code') {
    doc.font('LessonSans').fontSize(9.5).fillColor(BODY_COLOR).text(block.text || '', { indent: 12, lineGap: 3 }).moveDown(0.35);
    return;
  }
  const marker = block.type === 'bullet' ? '•  ' : block.type === 'number' ? `${block.number}.  ` : '';
  const text = `${marker}${blockText(block)}`;
  if (!text.trim()) return;
  doc.font('LessonSans').fontSize(block.type === 'table-row' ? 9.5 : 10.5).fillColor(BODY_COLOR)
    .text(text, { indent: marker ? 10 : 0, lineGap: 3 }).moveDown(block.type === 'bullet' || block.type === 'number' ? 0.18 : 0.38);
}

function createPdf(model) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 52, right: PDF_MARGIN, bottom: 58, left: PDF_MARGIN }, bufferPages: true,
      info: { Title: model.title, Author: model.instructor || 'SEA-IT-SOLVED', Subject: 'Published lesson notes' } });
    registerPdfFonts(doc);
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('LessonSansBold').fontSize(9).fillColor('#4f46e5').text('SEA-IT-SOLVED', { characterSpacing: 0.8 });
    doc.moveDown(0.45).fontSize(8.5).fillColor('#475569').text('Generated Lesson Materials');
    doc.moveDown(0.55).fontSize(22).fillColor(HEADING_COLOR).text(model.title, { lineGap: 2 });
    doc.moveDown(0.45).font('LessonSans').fontSize(9.5).fillColor('#475569');
    if (model.course) doc.text(`Course: ${model.course}`);
    if (model.instructor) doc.text(`Instructor: ${model.instructor}`);
    doc.text(`Lesson date: ${formattedDate(model.lessonDate)}`);
    doc.moveDown(0.75).strokeColor('#cbd5e1').lineWidth(1).moveTo(PDF_MARGIN, doc.y).lineTo(doc.page.width - PDF_MARGIN, doc.y).stroke().moveDown(0.75);

    model.sections.forEach((section, index) => {
      ensurePdfSpace(doc, 92);
      doc.font('LessonSansBold').fontSize(15).fillColor(HEADING_COLOR).text(`${index + 1}. ${section.title}`, { lineGap: 2 });
      doc.moveDown(0.35);
      section.blocks.forEach(block => writePdfBlock(doc, block));
      if (index < model.sections.length - 1) doc.moveDown(0.5);
    });

    const range = doc.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index += 1) {
      doc.switchToPage(index);
      const bottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.font('LessonSans').fontSize(8).fillColor('#64748b')
        .text(`SEA-IT-SOLVED  •  ${index + 1} of ${range.count}`, PDF_MARGIN, doc.page.height - 32, { width: doc.page.width - PDF_MARGIN * 2, align: 'center', lineBreak: false });
      doc.page.margins.bottom = bottomMargin;
    }
    doc.end();
  });
}

function docxMathComponents(node) {
  if (!node) return [];
  if (node.type === 'text') return node.text ? [new MathRun(node.text)] : [];
  if (node.type === 'row') return node.children.flatMap(docxMathComponents);
  if (node.type === 'fraction') return [new MathFraction({ numerator: docxMathComponents(node.numerator), denominator: docxMathComponents(node.denominator) })];
  if (node.type === 'radical') return [new MathRadical({ children: docxMathComponents(node.body), degree: node.degree ? docxMathComponents(node.degree) : undefined })];
  if (node.type === 'sup') return [new MathSuperScript({ children: docxMathComponents(node.base), superScript: docxMathComponents(node.superScript) })];
  if (node.type === 'sub') return [new MathSubScript({ children: docxMathComponents(node.base), subScript: docxMathComponents(node.subScript) })];
  if (node.type === 'subsup') return [new MathSubSuperScript({ children: docxMathComponents(node.base), subScript: docxMathComponents(node.subScript), superScript: docxMathComponents(node.superScript) })];
  if (node.type === 'integral') return [new MathRun('∫')];
  if (node.type === 'nary') return [new MathRun(node.symbol)];
  return [];
}

function officeMath(latex) {
  const children = docxMathComponents(parseLatex(latex));
  return new OfficeMath({ children: children.length ? children : [new MathRun(' ')] });
}

function docxInlineChildren(block) {
  if (!Array.isArray(block.segments) || !block.segments.length) return [new TextRun(cleanMarkdownText(block.text || block.markdown))];
  return block.segments.flatMap(segment => segment.type === 'math-inline'
    ? [officeMath(segment.latex)]
    : [new TextRun({ text: cleanMarkdownText(segment.text), font: 'Aptos', size: 22 })]);
}

function docxParagraph(block) {
  const common = { spacing: { after: 120, line: 276 }, keepLines: true };
  if (block.type === 'math-block') return new Paragraph({ ...common, alignment: AlignmentType.CENTER, children: [officeMath(block.latex)], spacing: { before: 100, after: 180 } });
  if (block.type === 'heading' || block.type === 'subheading') return new Paragraph({ ...common, keepNext: true, heading: block.level <= 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3, children: docxInlineChildren(block) });
  if (block.type === 'note') return new Paragraph({ ...common, indent: { left: 240 }, children: [new TextRun({ text: `${block.label ? `${block.label}: ` : ''}${blockText(block)}`, italics: true, color: '475569', size: 21 })] });
  if (block.type === 'bullet') return new Paragraph({ ...common, numbering: { reference: 'lesson-bullets', level: 0 }, children: docxInlineChildren(block) });
  if (block.type === 'number') return new Paragraph({ ...common, numbering: { reference: 'lesson-numbering', level: 0 }, children: docxInlineChildren(block) });
  if (block.type === 'code') return new Paragraph({ ...common, indent: { left: 360 }, children: [new TextRun({ text: block.text, font: 'Consolas', size: 19 })] });
  return new Paragraph({ ...common, children: docxInlineChildren(block) });
}

async function createDocx(model) {
  const children = [
    new Paragraph({ children: [new TextRun({ text: 'SEA-IT-SOLVED', bold: true, color: '4F46E5', size: 18, characterSpacing: 20 })], spacing: { after: 80 }, keepNext: true }),
    new Paragraph({ children: [new TextRun({ text: 'Generated Lesson Materials', color: '475569', size: 18 })], spacing: { after: 100 }, keepNext: true }),
    new Paragraph({ text: model.title, heading: HeadingLevel.TITLE, spacing: { after: 180 }, keepNext: true }),
  ];
  if (model.course) children.push(new Paragraph({ children: [new TextRun({ text: 'Course: ', bold: true }), new TextRun(model.course)], spacing: { after: 60 }, keepNext: true }));
  if (model.instructor) children.push(new Paragraph({ children: [new TextRun({ text: 'Instructor: ', bold: true }), new TextRun(model.instructor)], spacing: { after: 60 }, keepNext: true }));
  children.push(new Paragraph({ children: [new TextRun({ text: 'Lesson date: ', bold: true }), new TextRun(formattedDate(model.lessonDate))], spacing: { after: 260 },
    border: { bottom: { color: 'CBD5E1', style: BorderStyle.SINGLE, size: 6, space: 10 } } }));
  model.sections.forEach((section, index) => {
    children.push(new Paragraph({ text: `${index + 1}. ${section.title}`, heading: HeadingLevel.HEADING_1, keepNext: true, spacing: { before: index ? 260 : 160, after: 140 } }));
    section.blocks.forEach(block => {
      if (block.type === 'math-review') return;
      if (block.type === 'math-derivation') {
        (block.expressions || []).forEach(latex => children.push(docxParagraph({ type: 'math-block', latex })));
      } else children.push(docxParagraph(block));
    });
  });
  const document = new Document({
    creator: model.instructor || 'SEA-IT-SOLVED', title: model.title, description: 'Published lesson notes',
    numbering: { config: [
      { reference: 'lesson-bullets', levels: [{ level: 0, format: 'bullet', text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 }, spacing: { after: 140, line: 276 } } } }] },
      { reference: 'lesson-numbering', levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 }, spacing: { after: 140, line: 276 } } } }] },
    ] },
    styles: {
      default: { document: { run: { font: 'Aptos', size: 22, color: '334155' }, paragraph: { spacing: { after: 120, line: 276 } } } },
      paragraphStyles: [
        { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Aptos Display', size: 44, bold: true, color: '0F172A' }, paragraph: { spacing: { before: 0, after: 180 } } },
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Aptos Display', size: 30, bold: true, color: '1E3A5F' }, paragraph: { spacing: { before: 300, after: 150 }, keepNext: true } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Aptos Display', size: 25, bold: true, color: '1E3A5F' }, paragraph: { spacing: { before: 220, after: 110 }, keepNext: true } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Aptos Display', size: 23, bold: true, color: '334155' }, paragraph: { spacing: { before: 150, after: 80 }, keepNext: true } },
      ],
    },
    sections: [{
      properties: { page: { size: A4_DOCX, margin: { top: 1134, right: 1134, bottom: 1134, left: 1134, header: 567, footer: 567 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'SEA-IT-SOLVED  •  ', color: '64748B', size: 16 }), new TextRun({ children: [PageNumber.CURRENT], color: '64748B', size: 16 })] })] }) },
      children,
    }],
  });
  return Packer.toBuffer(document);
}

async function createLessonExport(data, requestedFormat) {
  const format = String(requestedFormat || '').toLowerCase();
  if (!['pdf', 'docx'].includes(format)) throw new AppError('Choose PDF or DOCX for the lesson download.', 400);
  const model = data.document || buildLessonDocument(data);
  if (!model.sections?.length) throw new AppError('No published lesson material is available to download.', 404);
  const buffer = format === 'pdf' ? await createPdf(model) : await createDocx(model);
  return { buffer, filename: exportFilename(model, format),
    contentType: format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
}

module.exports = { buildLessonDocument, createLessonExport };
