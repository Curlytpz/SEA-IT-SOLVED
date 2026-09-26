const test = require('node:test');
const assert = require('node:assert/strict');
const GeminiLessonCompilationProvider = require('./GeminiLessonCompilationProvider');
const { normalizeLessonCompilation } = require('../LessonRecognitionNormalizer');

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
    error => error.code === 'INVALID_PROVIDER_OUTPUT' && error.recognitionStage === 'json_parse',
  );
  const diagnostic = GeminiLessonCompilationProvider.structuredOutputDiagnostic(
    Object.assign(new SyntaxError('invalid'), { code: 'INVALID_PROVIDER_OUTPUT', recognitionStage: 'json_parse' }),
    privateText,
  );
  assert.equal(diagnostic.responseBytes, Buffer.byteLength(privateText));
  assert.equal(JSON.stringify(diagnostic).includes(privateText), false);
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
    images: [{ mimeType: 'image/png', buffer: Buffer.from('image') }],
    captures: [{ id: 'capture-1', captured_at: '2026-01-01T00:00:00.000Z' }],
  });
  assert.equal(receivedConfig.responseMimeType, 'application/json');
  assert.equal(receivedConfig.responseJsonSchema.type, 'object');
  assert.equal(result.normalized.pages[0].blocks[0].latex, '\\frac{1}{x}');
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
      { mimeType: 'image/png', load: async () => Buffer.from('first') },
      { mimeType: 'image/png', load: async () => Buffer.from('second') },
    ], captures: [{}, {}],
  }));
  assert.deepEqual(deleted, ['first-file']);
});
