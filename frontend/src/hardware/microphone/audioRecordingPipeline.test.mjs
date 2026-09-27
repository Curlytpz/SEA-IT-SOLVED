import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import BrowserMicrophoneAdapter from './BrowserMicrophoneAdapter.js';
import {
  MIN_RECORDING_BYTES,
  buildAudioRecordingFormData,
  validateRecordingBlob,
} from '../../utils/audioRecording.js';

const originalMediaRecorder = globalThis.MediaRecorder;
const originalWindow = globalThis.window;

class FakeMediaRecorder {
  static instances = [];
  static options = {};
  static isTypeSupported = type => type.startsWith('audio/webm');

  constructor(stream, options = {}) {
    this.stream = stream;
    this.mimeType = options.mimeType || 'audio/webm';
    this.state = 'inactive';
    this.options = { requestChunk: null, finalChunk: null, autoFinish: true, ...FakeMediaRecorder.options };
    FakeMediaRecorder.instances.push(this);
  }

  start() { this.state = 'recording'; }
  pause() { this.state = 'paused'; }
  resume() { this.state = 'recording'; }
  requestData() { this.emitData(this.options.requestChunk); }
  stop() {
    this.state = 'inactive';
    if (this.options.autoFinish) this.finish();
  }
  emitData(data) { if (data) this.ondataavailable?.({ data }); }
  finish() {
    this.emitData(this.options.finalChunk);
    this.onstop?.();
  }
}

function chunk(size, type = 'audio/webm') {
  return new Blob([new Uint8Array(size)], { type });
}

function preparedAdapter(durationFixer = async blob => blob) {
  const track = { stopped: false, stop() { this.stopped = true; } };
  const adapter = new BrowserMicrophoneAdapter({ durationFixer });
  adapter.stream = { getTracks: () => [track] };
  adapter.status = 'READY';
  return { adapter, track };
}

afterEach(() => {
  globalThis.MediaRecorder = originalMediaRecorder;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  FakeMediaRecorder.instances = [];
  FakeMediaRecorder.options = {};
});

test('recording chunks accumulate and include requestData plus final dataavailable', async () => {
  globalThis.MediaRecorder = FakeMediaRecorder;
  globalThis.window = { MediaRecorder: FakeMediaRecorder };
  FakeMediaRecorder.options = { requestChunk: chunk(2000), finalChunk: chunk(3000) };
  const { adapter } = preparedAdapter();
  adapter.startRecording();
  adapter.activeDurationMs = 10000;
  FakeMediaRecorder.instances[0].emitData(chunk(5000));

  const result = await adapter.stopRecording();
  assert.equal(result.blob.size, 10000);
  assert.equal(result.blob.type, 'audio/webm;codecs=opus');
});

test('final Blob is not returned until the recorder stop event completes', async () => {
  globalThis.MediaRecorder = FakeMediaRecorder;
  globalThis.window = { MediaRecorder: FakeMediaRecorder };
  FakeMediaRecorder.options = { autoFinish: false, requestChunk: chunk(5000), finalChunk: chunk(2000) };
  const { adapter } = preparedAdapter();
  adapter.startRecording();
  adapter.activeDurationMs = 7000;

  let resolved = false;
  const pending = adapter.stopRecording().then(result => { resolved = true; return result; });
  await Promise.resolve();
  assert.equal(resolved, false);
  FakeMediaRecorder.instances[0].finish();
  const result = await pending;
  assert.equal(resolved, true);
  assert.equal(result.blob.size, 7000);
});

test('WebM duration metadata is repaired with the measured active duration before upload', async () => {
  globalThis.MediaRecorder = FakeMediaRecorder;
  globalThis.window = { MediaRecorder: FakeMediaRecorder };
  FakeMediaRecorder.options = { requestChunk: chunk(3000), finalChunk: chunk(3000) };
  let receivedDuration = 0;
  let receivedOptions;
  const { adapter } = preparedAdapter(async (blob, durationMs, callback, options) => {
    receivedDuration = durationMs;
    receivedOptions = { callback, options };
    return new Blob([blob, new Uint8Array([1])], { type: blob.type });
  });
  adapter.startRecording();
  adapter.activeDurationMs = 27000;

  const result = await adapter.stopRecording();
  assert.equal(receivedDuration, 27000);
  assert.deepEqual(receivedOptions, { callback: undefined, options: { logger: false } });
  assert.equal(result.durationMs, 27000);
  assert.equal(result.blob.size, 6001);
  assert.equal(result.blob.type, 'audio/webm;codecs=opus');
});

test('valid recording is prepared for upload', () => {
  const blob = chunk(MIN_RECORDING_BYTES + 1000);
  const form = buildAudioRecordingFormData({ blob, metadata: { durationMs: 12000, pauses: [] } });
  assert.equal(form.get('audio').size, blob.size);
  assert.equal(form.get('durationMs'), '12000');
  assert.equal(form.get('pauses'), '[]');
});

test('tiny or unsupported recordings are rejected before upload', () => {
  assert.throws(() => validateRecordingBlob(chunk(3003)), error => error.code === 'INVALID_AUDIO_RECORDING');
  assert.throws(
    () => buildAudioRecordingFormData({ blob: chunk(8000, 'application/octet-stream'), metadata: {} }),
    error => error.code === 'INVALID_AUDIO_RECORDING',
  );
});

test('invalid final recording stops microphone stream tracks', async () => {
  globalThis.MediaRecorder = FakeMediaRecorder;
  globalThis.window = { MediaRecorder: FakeMediaRecorder };
  FakeMediaRecorder.options = { requestChunk: chunk(1000), finalChunk: chunk(1000) };
  const { adapter, track } = preparedAdapter();
  adapter.startRecording();

  await assert.rejects(adapter.stopRecording(), error => error.code === 'INVALID_AUDIO_RECORDING');
  assert.equal(track.stopped, true);
  assert.equal(adapter.getStatus(), 'STOPPED');
});

test('successful recording stream is cleaned when the session stops', async () => {
  globalThis.MediaRecorder = FakeMediaRecorder;
  globalThis.window = { MediaRecorder: FakeMediaRecorder };
  FakeMediaRecorder.options = { requestChunk: chunk(3000), finalChunk: chunk(3000) };
  const { adapter, track } = preparedAdapter();
  adapter.startRecording();
  adapter.activeDurationMs = 6000;
  await adapter.stopRecording();
  adapter.stop();
  assert.equal(track.stopped, true);
});
