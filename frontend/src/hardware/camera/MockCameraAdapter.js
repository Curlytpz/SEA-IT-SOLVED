import { SIMULATED_CAMERA_SOURCE_KEY } from './cameraSources';
import demoWhiteboardUrl from '../../assets/landing-whiteboard.png';

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Unable to encode simulated frame.')), 'image/jpeg', .92));
}

export default class MockCameraAdapter {
  constructor() {
    this.previewImage = null;
    this.previewPromise = null;
  }

  loadPreviewImage() {
    if (this.previewImage) return Promise.resolve(this.previewImage);
    if (!this.previewPromise) {
      this.previewPromise = new Promise((resolve, reject) => {
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => {
          this.previewImage = image;
          resolve(image);
        };
        image.onerror = () => {
          this.previewPromise = null;
          reject(new Error('Unable to load the demo whiteboard image.'));
        };
        image.src = demoWhiteboardUrl;
      });
    }
    return this.previewPromise;
  }

  async listDevices() { return [{ id: SIMULATED_CAMERA_SOURCE_KEY, label: 'Demo Whiteboard' }]; }
  async start() { await this.loadPreviewImage(); return null; }
  stop() {}

  renderPreview(canvas) {
    if (!canvas) return;
    canvas.width = 1280; canvas.height = 720;
    const ctx = canvas.getContext('2d');
    const drawImage = image => {
      const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      const x = (canvas.width - width) / 2;
      const y = (canvas.height - height) / 2;
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, x, y, width, height);
    };

    if (this.previewImage) drawImage(this.previewImage);
    else this.loadPreviewImage().then(drawImage).catch(() => {});
  }

  async captureFrame(canvas, { encode = true, maxWidth = null } = {}) {
    if (!canvas?.width) throw new Error('Simulated preview is not ready.');
    const copy = document.createElement('canvas');
    const scale = maxWidth ? Math.min(1, maxWidth / canvas.width) : 1;
    copy.width = Math.round(canvas.width * scale); copy.height = Math.round(canvas.height * scale);
    copy.getContext('2d').drawImage(canvas, 0, 0);
    return { canvas: copy, blob: encode ? await canvasBlob(copy) : null, width: copy.width, height: copy.height, capturedAt: new Date().toISOString() };
  }
}