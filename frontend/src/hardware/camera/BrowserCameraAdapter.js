function canvasBlob(canvas, type = 'image/jpeg', quality = .92) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Unable to encode camera frame.')), type, quality));
}

export default class BrowserCameraAdapter {
  constructor() { this.stream = null; }

  async listDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) throw new Error('Camera APIs are not supported by this browser.');
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(device => device.kind === 'videoinput').map((device, index) => ({
      id: device.deviceId,
      label: device.label || `Camera ${index + 1}`,
    }));
  }

  async start({ deviceId } = {}) {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access requires a supported browser on localhost or HTTPS.');
    this.stop();
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: 'environment',
      },
      audio: false,
    });
    return this.stream;
  }

  stop() {
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
  }

  async captureFrame(video, { encode = true, maxWidth = null } = {}) {
    if (!video?.videoWidth || !video?.videoHeight) throw new Error('Camera preview is not ready yet.');
    const canvas = document.createElement('canvas');
    const scale = maxWidth ? Math.min(1, maxWidth / video.videoWidth) : 1;
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    return { canvas, blob: encode ? await canvasBlob(canvas) : null, width: canvas.width, height: canvas.height, capturedAt: new Date().toISOString() };
  }
}
