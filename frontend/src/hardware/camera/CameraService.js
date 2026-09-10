import BrowserCameraAdapter from './BrowserCameraAdapter';
import MockCameraAdapter from './MockCameraAdapter';

export default class CameraService {
  constructor(mode = 'SIMULATED') {
    this.mode = mode;
    this.adapter = mode === 'BROWSER' ? new BrowserCameraAdapter() : new MockCameraAdapter();
  }

  listDevices() { return this.adapter.listDevices(); }
  start(options) { return this.adapter.start(options); }
  stop() { return this.adapter.stop(); }
  captureFrame(sourceElement, options) { return this.adapter.captureFrame(sourceElement, options); }
  renderMockPreview(canvas) { return this.adapter.renderPreview?.(canvas); }
}
