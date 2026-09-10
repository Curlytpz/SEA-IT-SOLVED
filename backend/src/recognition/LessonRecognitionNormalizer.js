const { lessonCompilationSchema } = require('./lessonGeminiSchema');
const { reconcileRecognitionBlocks, plainTextFromBlocks } = require('./RecognitionReconciler');

function clean(value, maxLength) {
  if (value === null || value === undefined) return null;
  return String(value).normalize('NFC').replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maxLength);
}

function normalizeLessonCompilation(input, captures) {
  const parsed = lessonCompilationSchema.parse(input);
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
      text:block.type==='text' ? clean(block.text,10000) : null,
      latex:block.type==='math' ? clean(block.latex,10000)?.replace(/^\$+|\$+$/g,'').trim() : null,
      confidence:null, uncertain:block.uncertain,
      uncertaintyReason:block.uncertain ? clean(block.uncertaintyReason,1000) : null,
      bounds:block.bounds,
    }));
    const reconciled = reconcileRecognitionBlocks(providerBlocks, { scope: captures[index].id });
    const blocks = reconciled.blocks;
    return {
      pageNumber:index+1, captureId:captures[index].id, capturedAt:captures[index].captured_at,
      plainText:plainTextFromBlocks(blocks) || (blocks.length ? '' : clean(page.plainText,50000)||''), blocks,
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

module.exports = { normalizeLessonCompilation };
