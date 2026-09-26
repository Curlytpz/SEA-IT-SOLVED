const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const solutionUpload = require('./solutionSubmissionUpload');

test('malformed multipart array indexes produce a controlled 400 and server remains available', async () => {
  const app = express();
  app.post('/upload', solutionUpload, (_req, res) => res.sendStatus(204));
  app.get('/health', (_req, res) => res.sendStatus(204));
  app.use((error, _req, res, _next) => res.status(400).json({ error: error.code || 'INVALID_MULTIPART' }));
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const boundary = 'sea-it-solved-boundary';
    const body = [
      `--${boundary}\r\nContent-Disposition: form-data; name="items[4294967294]"\r\n\r\none\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="items[4294967295]"\r\n\r\ntwo\r\n`,
      `--${boundary}--\r\n`,
    ].join('');
    const base = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${base}/upload`, {
      method: 'POST', headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` }, body,
    });
    assert.equal(response.status, 400);
    assert.equal((await fetch(`${base}/health`)).status, 204);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
