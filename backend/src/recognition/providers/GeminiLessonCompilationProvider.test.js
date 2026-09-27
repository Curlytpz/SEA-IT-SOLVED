const test = require('node:test');
const assert = require('node:assert/strict');
const GeminiLessonCompilationProvider = require('./GeminiLessonCompilationProvider');
const { normalizeLessonCompilation } = require('../LessonRecognitionNormalizer');
const { geminiLessonJsonSchema } = require('../lessonGeminiSchema');
const { assertGeminiJsonSchema } = require('../geminiSchemaSupport');

const png = Buffer.from('89504e470d0a1a0a00000000', 'hex');

const validLesson = {
  pages: [{
    pageNumber: 1,
    plainText: 'A fraction was written.',
    blocks: [{
      type: 'math', order: 0, text: null, latex: '\\frac{1}{x}',
      uncertain: false, uncertaintyReason: null, bounds: null,
    }],
    warnings: [],
  }],
  warnings: [],
};

test('structured lesson JSON accepts plain, fenced, and safely surrounded objects', () => {
  const serialized = JSON.stringify(validLesson);
  assert.deepEqual(GeminiLessonCompilationProvider.parseStructuredJson(serialized), validLesson);
  assert.deepEqual(GeminiLessonCompilationProvider.parseStructuredJson(`\`\`\`json\n${serialized}\n\`\`\``), validLesson);
  assert.deepEqual(GeminiLessonCompilationProvider.parseStructuredJson(`Structured result follows:\n${serialized}\nEnd result.`), validLesson);
});

test('malformed structured output is rejected without retaining response content in diagnostics', () => {
  const privateText = 'private-whiteboard-content';
  assert.throws(
    () => GeminiLessonCompilationProvider.parseStructuredJson(`{ "pages": [ ${privateText}`),
    error => error.code === 'JSON_PARSE_FAILED' && error.recognitionStage === 'JSON_PARSE_FAILED',
  );
  const diagnostic = GeminiLessonCompilationProvider.structuredOutputDiagnostic(
    Object.assign(new SyntaxError('invalid'), { code: 'JSON_PARSE_FAILED', recognitionStage: 'JSON_PARSE_FAILED' }),
    privateText,
  );
  assert.equal(diagnostic.responseBytes, Buffer.byteLength(privateText));
  assert.equal(JSON.stringify(diagnostic).includes(privateText), false);
});

test('Zod diagnostics expose only paths and issue categories, never recognized content', () => {
  const privateText='private-recognized-whiteboard-value';
  let error;
  try{normalizeLessonCompilation({pages:[{pageNumber:'wrong',plainText:privateText,blocks:[],warnings:[]}],warnings:[]},[{}]);}
  catch(caught){error=caught;}
  const diagnostic=GeminiLessonCompilationProvider.structuredOutputDiagnostic(error,privateText);
  assert.equal(diagnostic.stage,'ZOD_VALIDATION_FAILED');
  assert.equal(diagnostic.issues[0].path,'pages.0.pageNumber');
  assert.equal(JSON.stringify(diagnostic).includes(privateText),false);
});

test('schema validation rejects missing fields and preserves valid LaTeX', () => {
  assert.throws(() => normalizeLessonCompilation({ pages: [{}], warnings: [] }, [{}]));
  const normalized = normalizeLessonCompilation(validLesson, [{ id: 'capture-1', captured_at: '2026-01-01T00:00:00.000Z' }]);
  assert.equal(normalized.pages[0].blocks[0].latex, '\\frac{1}{x}');
});

test('provider keeps Gemini structured JSON configuration and normalizes fenced JSON', async () => {
  let receivedConfig;
  const provider = new GeminiLessonCompilationProvider({ apiKey: 'test', model: 'test-model', timeoutMs: 1000 });
  provider.client = {
    files: {
      upload: async () => ({ name: 'lesson-file', uri: 'gemini://lesson', state: 'ACTIVE', mimeType: 'image/png' }),
      delete: async () => {},
    },
    models: {
      generateContent: async request => {
        receivedConfig = request.config;
        return { text: `\`\`\`json\n${JSON.stringify(validLesson)}\n\`\`\`` };
      },
    },
  };
  const result = await provider.compile({
    images: [{ mimeType: 'image/png', buffer: png }],
    captures: [{ id: 'capture-1', captured_at: '2026-01-01T00:00:00.000Z' }],
  });
  assert.equal(receivedConfig.responseMimeType, 'application/json');
  assert.equal(receivedConfig.maxOutputTokens, 32768);
  assert.equal(receivedConfig.responseJsonSchema.type, 'object');
  assert.equal(result.normalized.pages[0].blocks[0].latex, '\\frac{1}{x}');
});

test('provider contract safely fills optional metadata but still requires semantic fields', () => {
  const minimal={
    pages:[{pageNumber:1,plainText:'Visible note',blocks:[{
      type:'text',order:0,text:'Visible note',latex:null,uncertain:false,
    }]}],
  };
  const normalized=normalizeLessonCompilation(minimal,[{id:'capture-1',captured_at:'2026-01-01T00:00:00.000Z'}]);
  assert.deepEqual(normalized.warnings,[]);
  assert.deepEqual(normalized.pages[0].warnings,[]);
  assert.equal(normalized.pages[0].blocks[0].bounds,null);
  assert.throws(()=>normalizeLessonCompilation({pages:[{pageNumber:1,plainText:'',blocks:[{type:'math',order:0,text:null,uncertain:false}]}]},[{}]));
});

test('slightly out-of-range provider bounds are deterministically normalized before strict Zod validation', () => {
  const input={pages:[{pageNumber:1,plainText:'x',warnings:[],blocks:[{
    type:'text',order:0,text:'x',latex:null,uncertain:false,uncertaintyReason:null,
    bounds:{x:0.99,y:-0.01,width:0.05,height:1.2},
  }]}],warnings:[]};
  const normalized=normalizeLessonCompilation(input,[{id:'capture-1',captured_at:'2026-01-01T00:00:00.000Z'}]);
  assert.deepEqual(normalized.pages[0].blocks[0].bounds,{x:0.99,y:0,width:0.010000000000000009,height:1});
});

test('provider response schema uses only the documented Gemini JSON Schema subset', () => {
  assert.doesNotThrow(() => assertGeminiJsonSchema(geminiLessonJsonSchema));
  assert.equal(JSON.stringify(geminiLessonJsonSchema).includes('maxLength'), false);
  assert.equal(JSON.stringify(geminiLessonJsonSchema).includes('exclusiveMinimum'), false);
  assert.throws(() => assertGeminiJsonSchema({ type:'string', maxLength:10 }), /Unsupported Gemini response schema keyword/);
});

test('uploaded Gemini lesson files are cleaned if a later upload fails', async () => {
  const deleted = [];
  let uploads = 0;
  const provider = new GeminiLessonCompilationProvider({ apiKey: 'test', model: 'test', timeoutMs: 1000 });
  provider.client = {
    files: {
      upload: async () => {
        uploads += 1;
        if (uploads === 2) throw Object.assign(new Error('upload failed'), { status: 500 });
        return { name: 'first-file', uri: 'gemini://first', state: 'ACTIVE', mimeType: 'image/png' };
      },
      delete: async ({ name }) => { deleted.push(name); },
    },
  };
  await assert.rejects(() => provider.compile({
    images: [
      { mimeType: 'image/png', load: async () => png },
      { mimeType: 'image/png', load: async () => png },
    ], captures: [{}, {}],
  }));
  assert.deepEqual(deleted, ['first-file']);
});
