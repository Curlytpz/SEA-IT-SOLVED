import BrowserMicrophoneAdapter from './BrowserMicrophoneAdapter.js';
import MockMicrophoneAdapter from './MockMicrophoneAdapter.js';
import { resolveMicrophoneMode } from './microphoneSources.js';

export default class MicrophoneService {
  constructor(mode='BROWSER', { environment } = {}) {
    this.mode=resolveMicrophoneMode(mode, environment);
    this.adapter=this.mode==='SIMULATED'?new MockMicrophoneAdapter():new BrowserMicrophoneAdapter();
  }
  listDevices(){return this.adapter.listDevices();}
  requestPermission(){return this.adapter.requestPermission();}
  start(options){return this.adapter.start(options);}
  stop(){return this.adapter.stop();}
  getStatus(){return this.adapter.getStatus();}
  getError(){return this.adapter.getError();}
  getRecordingDuration(){return this.adapter.getRecordingDuration();}
  startRecording(){return this.adapter.startRecording();}
  pauseRecording(){return this.adapter.pauseRecording();}
  resumeRecording(){return this.adapter.resumeRecording();}
  stopRecording(){return this.adapter.stopRecording();}
  getAudioLevel(){return this.adapter.getAudioLevel();}
  getNoiseSuppressionState(){return this.adapter.getNoiseSuppressionState();}
  setNoiseSuppression(enabled){return this.adapter.setNoiseSuppression(enabled);}
  getSourceKey(){return this.adapter.getSourceKey();}
}
