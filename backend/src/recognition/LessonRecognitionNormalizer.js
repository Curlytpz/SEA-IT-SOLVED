const { lessonCompilationSchema } = require('./lessonGeminiSchema');
const { reconcileRecognitionBlocks, plainTextFromBlocks } = require('./RecognitionReconciler');
const { normalizeRecognitionNumericArtifacts, normalizeRecognitionLatex } = require('../utils/mathContent');

function clean(value, maxLength) {
  if (value === null || value === undefined) return null;
  return String(value).normalize('NFC').replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maxLength);
}

function normalizedRecognitionText(value, maxLength, { mathContext = false } = {}) {
  const cleaned = clean(value, maxLength);
  return cleaned === null ? null : normalizeRecognitionNumericArtifacts(cleaned, { mathContext });
}

function normalizedBounds(value) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return value;
  const numbers=['x','y','width','height'].map(key=>Number(value[key]));
  if (!numbers.every(Number.isFinite)) return value;
  const x=Math.min(1,Math.max(0,numbers[0]));
  const y=Math.min(1,Math.max(0,numbers[1]));
  const width=Math.min(1-x,Math.max(0,numbers[2]));
  const height=Math.min(1-y,Math.max(0,numbers[3]));
  return width>0&&height>0?{x,y,width,height}:null;
}

function normalizeLessonProviderShape(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  return {
    ...input,
    warnings:Array.isArray(input.warnings)?input.warnings:[],
    pages:Array.isArray(input.pages)?input.pages.map(page=>({
      ...page,
      warnings:Array.isArray(page?.warnings)?page.warnings:[],
      blocks:Array.isArray(page?.blocks)?page.blocks.map(block=>({
        ...block,
        ...(block?.type==='math'&&block.text===undefined?{text:null}:{}),
        ...(block?.type==='text'&&block.latex===undefined?{latex:null}:{}),
        ...(!block?.uncertain&&block?.uncertaintyReason===undefined?{uncertaintyReason:null}:{}),
        ...(block?.bounds===undefined?{bounds:null}:{bounds:normalizedBounds(block.bounds)}),
      })):page?.blocks,
    })):input.pages,
  };
}

function normalizeLessonCompilation(input, captures) {
  const parsed = lessonCompilationSchema.parse(normalizeLessonProviderShape(input));
  if (parsed.pages.length !== captures.length) {
    const error = new Error('The provider did not return one result for every lesson page.');
    error.code = 'INVALID_PROVIDER_OUTPUT';
    throw error;
  }
  const pages = parsed.pages.map((page, index) => {
    if (page.pageNumber !== index + 1) {
      const error = new Error('The provider changed the lesson page order.');
      error.code = 'INVALID_PROVIDER_OUTPUT';
      throw error;
    }
    const providerBlocks = page.blocks.sort((a,b) => a.order-b.order).map(block => ({
      type:block.type, order:block.order,
      text:block.type==='text' ? normalizedRecognitionText(block.text,10000) : null,
      latex:block.type==='math'
        ? normalizeRecognitionLatex(clean(block.latex,10000)?.replace(/^\$+|\$+$/g,'').trim())
        : null,
      confidence:null, uncertain:block.uncertain,
      uncertaintyReason:block.uncertain ? clean(block.uncertaintyReason,1000) : null,
      bounds:block.bounds,
    }));
    const reconciled = reconcileRecognitionBlocks(providerBlocks, { scope: captures[index].id });
    const blocks = reconciled.blocks;
    return {
      pageNumber:index+1, captureId:captures[index].id, capturedAt:captures[index].captured_at,
      plainText:plainTextFromBlocks(blocks) || (blocks.length ? '' : normalizedRecognitionText(page.plainText,50000)||''), blocks,
      warnings:[
        ...page.warnings.map(value=>clean(value,1000)).filter(Boolean),
        ...(reconciled.suppressedCount ? [`${reconciled.suppressedCount} overlapping recognition block${reconciled.suppressedCount === 1 ? '' : 's'} omitted from the compiled result.`] : []),
      ],
    };
  });
  const compiledText = pages.map(page => `Page ${page.pageNumber}\n${page.plainText}`).join('\n\n').trim();
  if (!compiledText && !pages.some(page=>page.blocks.length)) {
    const error = new Error('No recognizable whiteboard content was found.');
    error.code = 'NO_RECOGNIZABLE_CONTENT';
    throw error;
  }
  return { pages, compiledText, warnings:parsed.warnings.map(value=>clean(value,1000)).filter(Boolean) };
}

module.exports = { normalizeLessonCompilation, normalizeLessonProviderShape };
