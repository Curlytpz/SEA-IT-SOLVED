import MicrophoneService from './MicrophoneService';
import { defaultMicrophoneSourceKey } from './microphoneSources';

class LessonAudioSession {
  constructor(){
    this.service=new MicrophoneService('SIMULATED');
    this.listeners=new Set();
    this.poller=null;
    this.state={lessonId:null,mode:'SIMULATED',sourceKey:defaultMicrophoneSourceKey('SIMULATED'),sourceLabel:'Simulated Lapel Microphone',status:'STOPPED',error:'',skipped:false,noiseSuppressionPreferred:true,noiseSuppression:{supported:true,applied:true,simulated:true}};
  }

  subscribe(listener){this.listeners.add(listener);return()=>this.listeners.delete(listener);}
  snapshot(){return {...this.state,noiseSuppression:{...this.state.noiseSuppression}};}
  emit(){const serviceStatus=this.service.getStatus();const status=this.state.skipped?'SKIPPED':(['STARTING','ERROR'].includes(this.state.status)&&serviceStatus==='STOPPED'?this.state.status:serviceStatus);this.state={...this.state,status,error:this.service.getError()||this.state.error,noiseSuppression:this.service.getNoiseSuppressionState()};this.listeners.forEach(listener=>listener(this.snapshot()));}
  startPolling(){clearInterval(this.poller);this.poller=setInterval(()=>this.emit(),500);}
  stopPolling(){clearInterval(this.poller);this.poller=null;}

  async prepare(lessonId,settings={}){
    if(this.state.lessonId===lessonId&&['READY','RECORDING','PAUSED'].includes(this.service.getStatus()))return this.snapshot();
    await this.abort();
    const mode=settings.microphoneMode||'SIMULATED';
    const sourceKey=settings.microphoneSourceKey||defaultMicrophoneSourceKey(mode);
    const preferred=settings.microphoneNoiseSuppression!==false;
    this.service=new MicrophoneService(mode);
    this.state={lessonId,mode,sourceKey,sourceLabel:sourceKey,status:'STARTING',error:'',skipped:false,noiseSuppressionPreferred:preferred,noiseSuppression:{supported:false,applied:false,simulated:mode==='SIMULATED'}};
    this.emit();
    try{
      await this.service.start({deviceId:sourceKey||undefined,noiseSuppression:preferred});
      const devices=await this.service.listDevices().catch(()=>[]);
      this.state={...this.state,sourceLabel:devices.find(device=>device.id===sourceKey)?.label||sourceKey||'Default microphone'};
      this.startPolling();this.emit();return this.snapshot();
    }catch(error){
      this.service.stop();
      this.state={...this.state,status:'ERROR',error:error.message||'Microphone is unavailable.'};
      this.emit();throw error;
    }
  }

  async start(lessonId,settings={}){
    if(this.state.lessonId===lessonId&&['RECORDING','PAUSED'].includes(this.service.getStatus()))return this.snapshot();
    await this.prepare(lessonId,settings);
    this.service.startRecording();this.startPolling();this.emit();return this.snapshot();
  }

  async rollbackStart(){
    if(!['RECORDING','PAUSED'].includes(this.service.getStatus()))return this.snapshot();
    try{await this.service.stopRecording();this.startPolling();this.emit();return this.snapshot();}
    catch{await this.abort();return this.snapshot();}
  }

  async retry(settings={}){if(!this.state.lessonId)throw new Error('No lesson is available for microphone retry.');return this.start(this.state.lessonId,{...settings,microphoneMode:settings.microphoneMode||this.state.mode,microphoneSourceKey:settings.microphoneSourceKey||this.state.sourceKey,microphoneNoiseSuppression:settings.microphoneNoiseSuppression??this.state.noiseSuppressionPreferred});}

  async continueWithoutAudio(lessonId,settings={}){
    await this.abort();
    const mode=settings.microphoneMode||'SIMULATED';
    this.service=new MicrophoneService(mode);
    this.state={lessonId,mode,sourceKey:settings.microphoneSourceKey||defaultMicrophoneSourceKey(mode),sourceLabel:settings.microphoneSourceKey||'Configured microphone',status:'SKIPPED',error:'',skipped:true,noiseSuppressionPreferred:settings.microphoneNoiseSuppression!==false,noiseSuppression:{supported:false,applied:false,simulated:mode==='SIMULATED'}};
    this.emit();return this.snapshot();
  }

  pause(){if(this.service.getStatus()!=='RECORDING')return false;this.service.pauseRecording();this.emit();return true;}
  resume(){if(this.service.getStatus()!=='PAUSED')return false;this.service.resumeRecording();this.emit();return true;}
  getRecordingDuration(){return this.service.getRecordingDuration();}
  getAudioLevel(){return this.service.getAudioLevel();}
  getStatus(){return this.state.skipped?'SKIPPED':this.service.getStatus();}
  getError(){return this.state.error||this.service.getError();}
  getNoiseSuppressionState(){return this.service.getNoiseSuppressionState();}

  async setNoiseSuppression(enabled){
    this.state={...this.state,noiseSuppressionPreferred:!!enabled};
    const result=await this.service.setNoiseSuppression(!!enabled);
    this.emit();return result;
  }

  async finalize(){
    if(!['RECORDING','PAUSED'].includes(this.service.getStatus()))return null;
    const result=await this.service.stopRecording();this.emit();return result;
  }

  async discard(){
    if(['RECORDING','PAUSED'].includes(this.service.getStatus())){try{await this.service.stopRecording();}catch{/* explicitly discarding */}}
    this.stopPolling();this.service.stop();this.state={...this.state,status:'STOPPED'};this.emit();
  }

  async abort(){
    await this.discard();
    this.state={...this.state,lessonId:null,error:'',skipped:false,status:'STOPPED'};this.emit();
  }
}

export default new LessonAudioSession();
