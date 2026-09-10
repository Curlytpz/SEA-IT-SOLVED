import BrowserMicrophoneAdapter from './BrowserMicrophoneAdapter';
import MockMicrophoneAdapter from './MockMicrophoneAdapter';

export default class MicrophoneService {
  constructor(mode='SIMULATED') {
    this.mode=mode;
    this.adapter=mode==='BROWSER'?new BrowserMicrophoneAdapter():new MockMicrophoneAdapter();
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
}