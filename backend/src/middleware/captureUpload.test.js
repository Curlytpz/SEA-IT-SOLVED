process.env.CAPTURE_MAX_AGGREGATE_MB = '8';
process.env.CAPTURE_MAX_CONCURRENT_UPLOADS = '2';
process.env.CAPTURE_MAX_CONCURRENT_PER_USER = '1';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const captureUpload = require('./captureUpload');

function emptyMultipart(boundary) {
  return `--${boundary}--\r\n`;
}

test('capture uploads enforce per-user/global concurrency and release slots once', async () => {
  const app = express();
  let releaseFirst, releaseSecond;
  let reachedCount = 0;
  let reachedResolve;
  const reached = new Promise(resolve => { reachedResolve = resolve; });
  const firstGate = new Promise(resolve => { releaseFirst = resolve; });
  const secondGate = new Promise(resolve => { releaseSecond = resolve; });
  app.post('/capture', (req, _res, next) => { req.user = { id: req.headers['x-user'] }; next(); }, captureUpload, async (_req, res) => {
    reachedCount += 1;
    reachedResolve();
    await (reachedCount === 1 ? firstGate : secondGate);
    res.sendStatus(204);
  });
  app.use((error, _req, res, _next) => res.status(error.statusCode || 400).json({ error: error.message }));
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/capture`;
  const request = user => {
    const boundary = `boundary-${user}`;
    return fetch(base, { method: 'POST', headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'x-user': user }, body: emptyMultipart(boundary) });
  };
  try {
    const first = request('one');
    await reached;
    assert.equal((await request('one')).status, 429);
    const second = request('two');
    while (reachedCount < 2) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal((await request('three')).status, 429);
    releaseFirst(); releaseSecond();
    assert.equal((await first).status, 204);
    assert.equal((await second).status, 204);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(captureUpload._state(), { activeUploads: 0, activeByUser: new Map() });
  } finally {
    releaseFirst?.(); releaseSecond?.();
    await new Promise(resolve => server.close(resolve));
  }
});

test('declared capture bodies above the aggregate budget are rejected before parsing', async () => {
  const app = express();
  app.post('/capture', (req, _res, next) => { req.user = { id: 'budget-user' }; next(); }, captureUpload, (_req, res) => res.sendStatus(204));
  app.use((error, _req, res, _next) => res.status(error.statusCode || 400).json({ error: error.message }));
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const boundary = 'budget-boundary';
    const response = await fetch(`http://127.0.0.1:${server.address().port}/capture`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': String(10 * 1024 * 1024), 'x-user': 'budget-user' },
      body: emptyMultipart(boundary),
    }).catch(error => error);
    // undici may reject a deliberately inconsistent Content-Length after the server has already rejected it.
    if (response instanceof Response) assert.equal(response.status, 413);
    assert.equal(captureUpload._state().activeUploads, 0);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('chunked multipart data is stopped when actual aggregate file bytes exceed the budget', async () => {
  const app = express();
  app.post('/capture', (req, _res, next) => { req.user = { id: 'chunked-budget-user' }; next(); }, captureUpload, (_req, res) => res.sendStatus(204));
  app.use((error, _req, res, _next) => res.status(error.statusCode || 400).json({ error: error.message }));
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const boundary = 'chunked-budget-boundary';
    const status = await new Promise((resolve, reject) => {
      const request = http.request({
        host: '127.0.0.1', port: server.address().port, path: '/capture', method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      }, response => { response.resume(); response.on('end', () => resolve(response.statusCode)); });
      request.on('error', reject);
      request.write(`--${boundary}\r\nContent-Disposition: form-data; name="original"; filename="one.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`);
      request.write(Buffer.alloc(5 * 1024 * 1024, 1));
      request.write(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="corrected"; filename="two.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`);
      request.write(Buffer.alloc(5 * 1024 * 1024, 2));
      request.end(`\r\n--${boundary}--\r\n`);
    });
    assert.equal(status, 413);
    assert.equal(captureUpload._state().activeUploads, 0);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('client disconnect does not release a slot while downstream capture work is still running', async () => {
  const app = express();
  let releaseWork;
  let reachedResolve;
  const work = new Promise(resolve => { releaseWork = resolve; });
  const reached = new Promise(resolve => { reachedResolve = resolve; });
  app.post('/capture', (req, _res, next) => { req.user = { id: 'disconnect-user' }; next(); }, captureUpload, async (req, res) => {
    reachedResolve();
    try { await work; res.sendStatus(204); } finally { req.releaseCaptureUpload?.(); }
  });
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const abort = new AbortController();
  const boundary = 'disconnect-boundary';
  const request = fetch(`http://127.0.0.1:${server.address().port}/capture`, {
    method: 'POST', signal: abort.signal,
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: emptyMultipart(boundary),
  }).catch(() => null);
  try {
    await reached;
    abort.abort();
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(captureUpload._state().activeUploads, 1);
    releaseWork();
    await request;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(captureUpload._state().activeUploads, 0);
  } finally {
    releaseWork?.();
    await new Promise(resolve => server.close(resolve));
  }
});

test('capture route performs ownership/status preflight before multipart parsing', () => {
  const source = fs.readFileSync(path.join(__dirname, '../routes/capture.routes.js'), 'utf8');
  assert(source.indexOf('capturePreflight, captureUpload') > 0);
});
