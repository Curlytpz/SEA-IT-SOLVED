import BrowserMicrophoneAdapter from './BrowserMicrophoneAdapter';
import { SIMULATED_MICROPHONE_SOURCE_KEY } from './microphoneSources';

export default class MockMicrophoneAdapter extends BrowserMicrophoneAdapter {
  constructor() { super(); this.generatorContext=null; this.oscillator=null; this.noisePreference=true; }

  async listDevices() { return [{ id:SIMULATED_MICROPHONE_SOURCE_KEY, label:'Simulated Lapel Microphone' }]; }
  async requestPermission() { return this.listDevices(); }

  async start({ noiseSuppression=true } = {}) {
    this.noisePreference=!!noiseSuppression;
    this.stop();
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass || !window.MediaRecorder) throw new Error('Simulated recording is not supported by this browser.');
    this.generatorContext = new AudioContextClass();
    if (this.generatorContext.state==='suspended') await this.generatorContext.resume();
    const destination = this.generatorContext.createMediaStreamDestination();
    const gain = this.generatorContext.createGain();
    gain.gain.value = 0;
    this.oscillator = this.generatorContext.createOscillator();
    this.oscillator.connect(gain).connect(destination);
    this.oscillator.start();
    await this.attachStream(destination.stream);
    return destination.stream;
  }

  getAudioLevel() {
    if (!['READY','RECORDING','PAUSED'].includes(this.status)) return 0;
    if (this.status==='PAUSED') return .04;
    return .18 + Math.abs(Math.sin(performance.now()/310))*.55;
  }

  getNoiseSuppressionState() { return { supported:true, applied:this.noisePreference, simulated:true }; }
  async setNoiseSuppression(enabled) { this.noisePreference=!!enabled; return this.getNoiseSuppressionState(); }
  stop() {
    super.stop();
    try { this.oscillator?.stop(); } catch { /* already stopped */ }
    this.oscillator = null;
    this.generatorContext?.close().catch(()=>{});
    this.generatorContext = null;
  }
}
