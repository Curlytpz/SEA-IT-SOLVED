import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import BrowserMicrophoneAdapter from './BrowserMicrophoneAdapter.js';
import MockMicrophoneAdapter from './MockMicrophoneAdapter.js';
import MicrophoneService from './MicrophoneService.js';
import {
  BROWSER_DEFAULT_MICROPHONE_SOURCE_KEY,
  microphoneRecordingMetadata,
  resolveMicrophoneMode,
} from './microphoneSources.js';

const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const originalWindow = globalThis.window;
const originalMediaRecorder = globalThis.MediaRecorder;

function setNavigator(value) {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    writable: true,
    value,
  });
}

afterEach(() => {
  if (originalNavigatorDescriptor) Object.defineProperty(globalThis, 'navigator', originalNavigatorDescriptor);
  else delete globalThis.navigator;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  if (originalMediaRecorder === undefined) delete globalThis.MediaRecorder;
  else globalThis.MediaRecorder = originalMediaRecorder;
});

test('real browser microphone is selected by default in production', () => {
  const environment = { MODE: 'production', DEV: false };
  const service = new MicrophoneService(undefined, { environment });
  assert.equal(resolveMicrophoneMode(undefined, environment), 'BROWSER');
  assert.equal(service.mode, 'BROWSER');
  assert.ok(service.adapter instanceof BrowserMicrophoneAdapter);
});

test('mock microphone requires development/test mode or an explicit simulator feature', () => {
  const production = { MODE: 'production', DEV: false };
  const explicitSimulator = {
    ...production,
    VITE_ENABLE_MICROPHONE_SIMULATION: 'true',
  };
  const development = { MODE: 'development', DEV: true };

  const blocked = new MicrophoneService('SIMULATED', { environment: production });
  assert.equal(blocked.mode, 'BROWSER');
  assert.ok(blocked.adapter instanceof BrowserMicrophoneAdapter);

  const explicitlyEnabled = new MicrophoneService('SIMULATED', { environment: explicitSimulator });
  assert.equal(explicitlyEnabled.mode, 'SIMULATED');
  assert.ok(explicitlyEnabled.adapter instanceof MockMicrophoneAdapter);

  const developmentMock = new MicrophoneService('SIMULATED', { environment: development });
  assert.equal(developmentMock.mode, 'SIMULATED');
  assert.ok(developmentMock.adapter instanceof MockMicrophoneAdapter);
});

test('production permission denial is reported and never falls back to mock audio', async () => {
  let requests = 0;
  setNavigator({
    mediaDevices: {
      getUserMedia: async () => {
        requests += 1;
        const error = new Error('denied');
        error.name = 'NotAllowedError';
        throw error;
      },
      getSupportedConstraints: () => ({}),
    },
  });
  const service = new MicrophoneService('SIMULATED', {
    environment: { MODE: 'production', DEV: false },
  });

  await assert.rejects(
    () => service.start(),
    /Microphone permission was denied/,
  );
  assert.equal(requests, 1);
  assert.equal(service.mode, 'BROWSER');
  assert.ok(service.adapter instanceof BrowserMicrophoneAdapter);
});

test('selected browser device stream is passed directly to MediaRecorder', async () => {
  const track = {
    onended: null,
    stopped: false,
    getSettings: () => ({ deviceId: 'selected-device' }),
    stop() { this.stopped = true; },
  };
  const stream = {
    getAudioTracks: () => [track],
    getTracks: () => [track],
  };
  let constraints;
  setNavigator({
    mediaDevices: {
      getUserMedia: async value => {
        constraints = value;
        return stream;
      },
      getSupportedConstraints: () => ({}),
      enumerateDevices: async () => [{
        kind: 'audioinput',
        deviceId: 'selected-device',
        label: 'External microphone',
      }],
    },
  });

  class FakeAudioContext {
    constructor() { this.state = 'running'; }
    createMediaStreamSource(value) {
      assert.equal(value, stream);
      return { connect() {} };
    }
    createAnalyser() {
      return { fftSize: 0, smoothingTimeConstant: 0 };
    }
    close() { return Promise.resolve(); }
  }
  class FakeMediaRecorder {
    static stream;
    static isTypeSupported = () => true;
    constructor(value, options) {
      FakeMediaRecorder.stream = value;
      this.mimeType = options?.mimeType || 'audio/webm';
      this.state = 'inactive';
    }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; }
  }
  globalThis.window = { AudioContext: FakeAudioContext, MediaRecorder: FakeMediaRecorder };
  globalThis.MediaRecorder = FakeMediaRecorder;

  const service = new MicrophoneService('BROWSER', {
    environment: { MODE: 'production', DEV: false },
  });
  await service.start({ deviceId: 'selected-device' });
  service.startRecording();

  assert.deepEqual(constraints, {
    audio: { deviceId: { exact: 'selected-device' } },
    video: false,
  });
  assert.equal(FakeMediaRecorder.stream, stream);
  assert.equal(service.getSourceKey(), 'selected-device');
  service.stop();
  assert.equal(track.stopped, true);
});

test('real recording metadata cannot be stored as SIMULATED', () => {
  const production = { MODE: 'production', DEV: false };
  assert.deepEqual(
    microphoneRecordingMetadata(
      { mode: 'BROWSER', sourceKey: 'selected-device' },
      {},
      production,
    ),
    { hardwareMode: 'BROWSER', sourceKey: 'selected-device' },
  );
  assert.deepEqual(
    microphoneRecordingMetadata(
      { mode: 'SIMULATED', sourceKey: 'mock-lapel-microphone' },
      {},
      production,
    ),
    { hardwareMode: 'BROWSER', sourceKey: BROWSER_DEFAULT_MICROPHONE_SOURCE_KEY },
  );
});
