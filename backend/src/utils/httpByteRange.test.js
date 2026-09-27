const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { Readable } = require('stream');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { parseHttpByteRange } = require('./httpByteRange');
const LocalStorageAdapter = require('../storage/LocalStorageAdapter');
const audioRoutes = require('../routes/audio-recording.routes');
const audioController = require('../controllers/audio-recording.controller');
const audioService = require('../services/audio-recording.service');

test('parses bounded, open-ended, and suffix byte ranges', () => {
  assert.deepEqual(parseHttpByteRange('bytes=10-19', 100), { start:10, end:19, length:10 });
  assert.deepEqual(parseHttpByteRange('bytes=90-', 100), { start:90, end:99, length:10 });
  assert.deepEqual(parseHttpByteRange('bytes=-10', 100), { start:90, end:99, length:10 });
  assert.deepEqual(parseHttpByteRange('bytes=90-200', 100), { start:90, end:99, length:10 });
});

test('rejects invalid and unsatisfiable byte ranges', () => {
  for (const header of ['bytes=100-101','bytes=20-10','bytes=','bytes=0-1,4-5','items=0-1','bytes=-0']) {
    assert.throws(() => parseHttpByteRange(header, 100), error => error.code === 'RANGE_NOT_SATISFIABLE' && error.size === 100);
  }
});

test('local storage streams only the requested byte range', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sea-audio-range-'));
  t.after(() => fs.rm(root, { recursive:true, force:true }));
  const storage = new LocalStorageAdapter(root);
  await storage.put('owner/recording.webm', Buffer.from('0123456789'));
  const { stream, size } = await storage.open('owner/recording.webm', { start:2, end:5 });
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  assert.equal(size, 10);
  assert.equal(Buffer.concat(chunks).toString(), '2345');
});

test('protected audio route still rejects unauthenticated range requests', async t => {
  const app = express();
  app.use('/api', audioRoutes);
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ error:error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/audio-recordings/example/audio`, { headers:{ Range:'bytes=0-9' } });
  assert.equal(response.status, 401);
});

test('audio controller returns a standards-compliant partial response', async t => {
  const original = audioService.getRecordingFile;
  audioService.getRecordingFile = async (_recordingId, _userId, rangeHeader) => {
    assert.equal(rangeHeader, 'bytes=2-5');
    return {
      stream: Readable.from(Buffer.from('2345')),
      size: 10,
      mime: 'audio/webm',
      durationMs: 27000,
      range: { start:2, end:5, length:4 },
    };
  };
  t.after(() => { audioService.getRecordingFile = original; });
  const app = express();
  app.get('/audio/:recordingId', (req, _res, next) => { req.user={ id:'owner' }; next(); }, audioController.getRecordingAudio);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/audio/example`, { headers:{ Range:'bytes=2-5' } });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('accept-ranges'), 'bytes');
  assert.equal(response.headers.get('content-range'), 'bytes 2-5/10');
  assert.equal(response.headers.get('content-length'), '4');
  assert.equal(response.headers.get('content-type'), 'audio/webm');
  assert.equal(response.headers.get('x-audio-duration-ms'), '27000');
  assert.equal(await response.text(), '2345');
});

test('audio controller returns 416 with the complete size for an invalid range', async t => {
  const original = audioService.getRecordingFile;
  audioService.getRecordingFile = async () => {
    const error = new Error('invalid range');
    error.code = 'RANGE_NOT_SATISFIABLE';
    error.size = 10;
    throw error;
  };
  t.after(() => { audioService.getRecordingFile = original; });
  const app = express();
  app.get('/audio/:recordingId', (req, _res, next) => { req.user={ id:'owner' }; next(); }, audioController.getRecordingAudio);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/audio/example`, { headers:{ Range:'bytes=20-30' } });
  assert.equal(response.status, 416);
  assert.equal(response.headers.get('accept-ranges'), 'bytes');
  assert.equal(response.headers.get('content-range'), 'bytes */10');
});
