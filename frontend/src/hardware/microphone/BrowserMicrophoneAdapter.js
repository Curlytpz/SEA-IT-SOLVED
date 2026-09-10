const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
];

function friendlyMicrophoneError(error) {
  const name = error?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Microphone permission was denied. Allow access in your browser and try again.';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'No microphone is available.';
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'The microphone is unavailable or already being used by another application.';
  if (name === 'OverconstrainedError') return 'The selected microphone is no longer available.';
  if (name === 'AbortError') return 'Microphone startup was interrupted. Please try again.';
  return error?.message || 'Unable to access the microphone.';
}

export default class BrowserMicrophoneAdapter {
  constructor() {
    this.stream=null;this.audioContext=null;this.analyser=null;this.samples=null;this.recorder=null;this.chunks=[];
    this.status='STOPPED';this.manualStop=false;this.startedAt=null;this.activeStartedAt=0;this.activeDurationMs=0;
    this.pauses=[];this.openPause=null;this.lastError='';this.noisePreference=true;
    this.noiseState={supported:false,applied:false,simulated:false};
  }

  async listDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) throw new Error('Microphone APIs are not supported by this browser.');
    const devices=await navigator.mediaDevices.enumerateDevices();
    return devices.filter(device=>device.kind==='audioinput').map((device,index)=>({id:device.deviceId,label:device.label||`Microphone ${index+1}`}));
  }

  async requestPermission() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone access requires localhost or HTTPS.');
    let permissionStream;
    try { permissionStream=await navigator.mediaDevices.getUserMedia({audio:true}); }
    catch (error) { throw new Error(friendlyMicrophoneError(error)); }
    permissionStream.getTracks().forEach(track=>track.stop());
    return this.listDevices();
  }

  processingConstraints(enabled) {
    const supported=navigator.mediaDevices?.getSupportedConstraints?.()||{};
    return {
      ...(supported.noiseSuppression?{noiseSuppression:!!enabled}:{}),
      ...(supported.echoCancellation?{echoCancellation:!!enabled}:{}),
      ...(supported.autoGainControl?{autoGainControl:!!enabled}:{}),
    };
  }

  async start({deviceId,noiseSuppression=true}={}) {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone access requires localhost or HTTPS.');
    this.stop();this.status='STARTING';this.noisePreference=!!noiseSuppression;
    try {
      const stream=await navigator.mediaDevices.getUserMedia({audio:{...(deviceId?{deviceId:{exact:deviceId}}:{}),...this.processingConstraints(noiseSuppression)}});
      await this.attachStream(stream);this.updateNoiseState();return stream;
    } catch (error) { this.status='ERROR';throw new Error(friendlyMicrophoneError(error)); }
  }

  async attachStream(stream) {
    this.stream=stream;this.manualStop=false;this.lastError='';
    const AudioContextClass=window.AudioContext||window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('Live microphone levels are not supported by this browser.');
    this.audioContext=new AudioContextClass();if(this.audioContext.state==='suspended')await this.audioContext.resume();
    const source=this.audioContext.createMediaStreamSource(stream);
    this.analyser=this.audioContext.createAnalyser();this.analyser.fftSize=256;this.analyser.smoothingTimeConstant=.75;
    source.connect(this.analyser);this.samples=new Uint8Array(this.analyser.fftSize);
    stream.getAudioTracks().forEach(track=>{track.onended=()=>{if(!this.manualStop){this.lastError='The microphone was disconnected. Reconnect it before recording again.';this.status='ERROR';}};});
    this.status='READY';this.updateNoiseState();
  }

  updateNoiseState(){
    const track=this.stream?.getAudioTracks?.()[0];
    const supported=!!navigator.mediaDevices?.getSupportedConstraints?.().noiseSuppression;
    const settings=track?.getSettings?.()||{};
    const reportsSetting=Object.prototype.hasOwnProperty.call(settings,'noiseSuppression');
    this.noiseState={supported:supported&&reportsSetting,applied:supported&&reportsSetting&&settings.noiseSuppression===true,simulated:false};
    return this.getNoiseSuppressionState();
  }

  getNoiseSuppressionState(){return {...this.noiseState};}

  async setNoiseSuppression(enabled){
    this.noisePreference=!!enabled;
    const track=this.stream?.getAudioTracks?.()[0];
    const constraints=this.processingConstraints(enabled);
    if(!track||!Object.prototype.hasOwnProperty.call(constraints,'noiseSuppression')){this.noiseState={supported:false,applied:false,simulated:false};return this.getNoiseSuppressionState();}
    try{await track.applyConstraints(constraints);return this.updateNoiseState();}
    catch{this.updateNoiseState();throw new Error('Noise cancellation is not available for this microphone.');}
  }

  getStatus(){return this.status;}
  getError(){return this.lastError;}
  getRecordingDuration(){return Math.max(0,Math.round(this.activeDurationMs+(this.status==='RECORDING'?performance.now()-this.activeStartedAt:0)));}

  getAudioLevel(){
    if(!this.analyser||!this.samples)return 0;
    this.analyser.getByteTimeDomainData(this.samples);let sum=0;
    for(const sample of this.samples){const value=(sample-128)/128;sum+=value*value;}
    return Math.min(1,Math.sqrt(sum/this.samples.length)*4);
  }

  supportedMimeType(){if(!window.MediaRecorder)throw new Error('Audio recording is not supported by this browser.');return MIME_CANDIDATES.find(type=>MediaRecorder.isTypeSupported(type))||'';}

  startRecording(){
    if(!this.stream||this.status!=='READY')throw new Error('Start the microphone before recording.');
    const mimeType=this.supportedMimeType();
    try{
      this.chunks=[];this.recorder=new MediaRecorder(this.stream,mimeType?{mimeType}:undefined);
      this.recorder.ondataavailable=event=>{if(event.data?.size)this.chunks.push(event.data);};
      this.startedAt=new Date();this.activeStartedAt=performance.now();this.activeDurationMs=0;this.pauses=[];this.openPause=null;this.lastError='';
      this.recorder.start(1000);this.status='RECORDING';
    }catch{throw new Error('Audio recording could not be started in this browser.');}
  }

  pauseRecording(){if(this.recorder?.state!=='recording')return;this.recorder.pause();this.activeDurationMs+=performance.now()-this.activeStartedAt;this.openPause={pausedAt:new Date().toISOString(),resumedAt:null};this.status='PAUSED';}
  resumeRecording(){if(this.recorder?.state!=='paused')return;this.recorder.resume();if(this.openPause){this.openPause.resumedAt=new Date().toISOString();this.pauses.push(this.openPause);this.openPause=null;}this.activeStartedAt=performance.now();this.status='RECORDING';}

  stopRecording(){
    if(!this.recorder||this.recorder.state==='inactive')throw new Error('There is no active recording to finalize.');
    return new Promise((resolve,reject)=>{
      const recorder=this.recorder;const completedAt=new Date();
      if(recorder.state==='recording')this.activeDurationMs+=performance.now()-this.activeStartedAt;
      if(this.openPause){this.openPause.resumedAt=completedAt.toISOString();this.pauses.push(this.openPause);this.openPause=null;}
      recorder.onerror=()=>reject(new Error('The recording could not be finalized.'));
      recorder.onstop=()=>{const blob=new Blob(this.chunks,{type:recorder.mimeType||this.supportedMimeType()||'audio/webm'});if(!blob.size)return reject(new Error('The recording could not be finalized.'));this.recorder=null;this.chunks=[];this.status='READY';resolve({blob,mimeType:blob.type,durationMs:Math.max(0,Math.round(this.activeDurationMs)),startedAt:this.startedAt.toISOString(),completedAt:completedAt.toISOString(),pauses:[...this.pauses]});};
      try{recorder.stop();}catch{reject(new Error('The recording could not be finalized.'));}
    });
  }

  stop(){
    this.manualStop=true;if(this.recorder&&this.recorder.state!=='inactive'){try{this.recorder.stop();}catch{/* best-effort cleanup */}}
    this.recorder=null;this.chunks=[];this.stream?.getTracks().forEach(track=>track.stop());this.stream=null;this.analyser=null;this.samples=null;
    this.audioContext?.close().catch(()=>{});this.audioContext=null;this.lastError='';this.status='STOPPED';this.noiseState={supported:false,applied:false,simulated:false};
  }
}

export { friendlyMicrophoneError };