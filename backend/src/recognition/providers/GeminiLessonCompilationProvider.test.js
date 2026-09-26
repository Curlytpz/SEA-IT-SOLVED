const test = require('node:test');
const assert = require('node:assert/strict');
const GeminiLessonCompilationProvider = require('./GeminiLessonCompilationProvider');

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
