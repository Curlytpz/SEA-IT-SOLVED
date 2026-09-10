import { useCallback,useEffect,useRef,useState } from 'react';
import { defaultMicrophoneSourceKey } from '../hardware/microphone/microphoneSources';
import lessonAudioSession from '../hardware/microphone/lessonAudioSession';
import { getHardwareSettings,saveHardwareSettings } from '../services/hardwareApi';
import { createAudioRecording,getLessonAudioRecording } from '../services/audioRecordingApi';

export default function useLessonAudioRecording(lesson){
  const [settings,setSettings]=useState({microphoneMode:'SIMULATED',microphoneSourceKey:defaultMicrophoneSourceKey('SIMULATED'),microphoneNoiseSuppression:true});
  const [sessionState,setSessionState]=useState(()=>lessonAudioSession.snapshot());
  const [savedRecording,setSavedRecording]=useState(null);
  const [pendingResult,setPendingResult]=useState(null);
  const [uploading,setUploading]=useState(false);
  const [elapsedMs,setElapsedMs]=useState(0);
  const [message,setMessage]=useState({text:'',type:'success'});
  const [settingsReady,setSettingsReady]=useState(false);
  const [preparing,setPreparing]=useState(false);
  const pendingRef=useRef(null);
  const preparedLessonRef=useRef(null);
  const preparationCleanupRef=useRef(null);

  useEffect(()=>lessonAudioSession.subscribe(setSessionState),[]);
  useEffect(()=>{pendingRef.current=pendingResult;},[pendingResult]);
  useEffect(()=>{
    if(!lesson?.id)return;
    let active=true;
    Promise.all([getHardwareSettings(),getLessonAudioRecording(lesson.id)]).then(([current,recording])=>{
      if(!active)return;
      const mode=current.microphoneMode||'SIMULATED';
      setSettings({...current,microphoneMode:mode,microphoneSourceKey:current.microphoneSourceKey||defaultMicrophoneSourceKey(mode),microphoneNoiseSuppression:current.microphoneNoiseSuppression!==false});
      setSavedRecording(recording);setSettingsReady(true);
    }).catch(err=>{if(active)setMessage({text:err.response?.data?.error||'Unable to initialize lesson audio.',type:'error'});});
    return()=>{active=false;};
  },[lesson?.id]);

  const sessionMatches=sessionState.lessonId===lesson?.id;
  const status=savedRecording?'SAVED':sessionMatches?sessionState.status:settingsReady?'UNAVAILABLE':'LOADING';

  const prepareMicrophone=useCallback(async()=>{
    if(!lesson?.id)return null;
    setPreparing(true);setMessage({text:'',type:'success'});
    try{
      const next=await lessonAudioSession.prepare(lesson.id,settings);
      setSessionState(lessonAudioSession.snapshot());
      setMessage({text:'Microphone connected. Monitoring is active; lesson recording has not started.',type:'success'});
      return next;
    }catch(err){setMessage({text:err.message||'Microphone is unavailable.',type:'error'});throw err;}
    finally{setPreparing(false);}
  },[lesson?.id,settings]);

  useEffect(()=>{
    if(lesson?.status!=='CREATED'||!settingsReady||savedRecording||preparedLessonRef.current===lesson.id)return;
    preparedLessonRef.current=lesson.id;
    prepareMicrophone().catch(()=>{});
  },[lesson?.id,lesson?.status,settingsReady,savedRecording,prepareMicrophone]);

  useEffect(()=>{
    clearTimeout(preparationCleanupRef.current);
    return()=>{
      const departingLessonId=lesson?.id;
      preparationCleanupRef.current=setTimeout(()=>{
        const current=lessonAudioSession.snapshot();
        if(current.lessonId===departingLessonId&&current.status==='READY')lessonAudioSession.abort();
      },0);
    };
  },[lesson?.id]);

  useEffect(()=>{
    if(!['RECORDING','PAUSED'].includes(status)){if(status==='READY'&&!pendingRef.current)setElapsedMs(0);return undefined;}
    const tick=()=>setElapsedMs(lessonAudioSession.getRecordingDuration());tick();
    const timer=setInterval(tick,500);return()=>clearInterval(timer);
  },[status]);
  useEffect(()=>{const warn=event=>{if(['RECORDING','PAUSED'].includes(lessonAudioSession.getStatus())){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[]);

  const retryMicrophone=useCallback(async()=>{
    if(lesson?.status==='CREATED')return prepareMicrophone();
    setMessage({text:'',type:'success'});
    try{await lessonAudioSession.start(lesson.id,settings);setSessionState(lessonAudioSession.snapshot());setMessage({text:'Microphone reconnected. Lesson recording is active.',type:'success'});}
    catch(err){setMessage({text:err.message||'Microphone is unavailable.',type:'error'});throw err;}
  },[lesson?.id,lesson?.status,settings,prepareMicrophone]);
  const startRecordingForLesson=useCallback(async()=>{const next=await lessonAudioSession.start(lesson.id,settings);setSessionState(lessonAudioSession.snapshot());return next;},[lesson?.id,settings]);
  const continueWithoutAudio=useCallback(async()=>{const next=await lessonAudioSession.continueWithoutAudio(lesson.id,settings);setSessionState(lessonAudioSession.snapshot());return next;},[lesson?.id,settings]);
  const rollbackStart=useCallback(async()=>{const next=await lessonAudioSession.rollbackStart();setSessionState(lessonAudioSession.snapshot());return next;},[]);
  const leavePreparation=useCallback(async()=>{await lessonAudioSession.abort();setSessionState(lessonAudioSession.snapshot());},[]);
  const pauseForLesson=useCallback(()=>lessonAudioSession.pause(),[]);
  const resumeForLesson=useCallback(()=>lessonAudioSession.resume(),[]);

  const uploadResult=useCallback(async result=>{
    setUploading(true);
    try{
      const current=lessonAudioSession.snapshot();
      const saved=await createAudioRecording(lesson.id,{blob:result.blob,metadata:{hardwareMode:current.mode||settings.microphoneMode,sourceKey:current.sourceKey||settings.microphoneSourceKey,durationMs:result.durationMs,startedAt:result.startedAt,completedAt:result.completedAt,pauses:result.pauses}});
      setSavedRecording(saved);setPendingResult(null);pendingRef.current=null;await lessonAudioSession.discard();
      setMessage({text:'Lesson audio recording saved.',type:'success'});return saved;
    }catch(err){const friendly=new Error(err.response?.data?.error||'Your lesson recording could not be saved.');friendly.audioSaveFailure=true;setMessage({text:friendly.message,type:'error'});throw friendly;}
    finally{setUploading(false);}
  },[lesson?.id,settings]);

  const finalizeForEnd=useCallback(async()=>{
    if(savedRecording)return savedRecording;
    let result=pendingRef.current;
    try{
      const current=lessonAudioSession.snapshot();
      if(!result&&current.lessonId===lesson?.id&&current.status==='ERROR')throw new Error('The microphone recording could not be finalized.');
      if(!result&&current.lessonId===lesson?.id&&!current.skipped)result=await lessonAudioSession.finalize();
      if(result){pendingRef.current=result;setPendingResult(result);}
      if(!result)return null;
      return await uploadResult(result);
    }catch(err){if(err.audioSaveFailure)throw err;const friendly=new Error('Your lesson recording could not be saved.');friendly.audioSaveFailure=true;setMessage({text:friendly.message,type:'error'});throw friendly;}
  },[savedRecording,lesson?.id,uploadResult]);

  const discardForEnd=useCallback(async()=>{await lessonAudioSession.discard();pendingRef.current=null;setPendingResult(null);setMessage({text:'Lesson ended without saving the audio recording.',type:'warning'});},[]);
  const setNoiseSuppression=useCallback(async enabled=>{
    setSettings(current=>({...current,microphoneNoiseSuppression:enabled}));
    await saveHardwareSettings({microphoneNoiseSuppression:enabled});
    if(sessionMatches&&['RECORDING','PAUSED','READY'].includes(sessionState.status))await lessonAudioSession.setNoiseSuppression(enabled);
    setSessionState(lessonAudioSession.snapshot());
  },[sessionMatches,sessionState.status]);

  return {
    service:lessonAudioSession,mode:sessionMatches?sessionState.mode:settings.microphoneMode,sourceKey:sessionMatches?sessionState.sourceKey:settings.microphoneSourceKey,
    sourceLabel:sessionMatches?sessionState.sourceLabel:null,status,error:sessionMatches?sessionState.error:'',savedRecording,pendingResult,uploading,elapsedMs,message,setMessage,
    noiseSuppression:sessionMatches?sessionState.noiseSuppression:{supported:false,applied:false,simulated:settings.microphoneMode==='SIMULATED'},noiseSuppressionPreferred:settings.microphoneNoiseSuppression,
    retryMicrophone,prepareMicrophone,startRecordingForLesson,continueWithoutAudio,rollbackStart,leavePreparation,pauseForLesson,resumeForLesson,finalizeForEnd,discardForEnd,setNoiseSuppression,
    settingsReady,preparing,
    hasRecording:['RECORDING','PAUSED'].includes(status),hasUnsavedAudio:!!pendingResult,isUnavailable:['ERROR','UNAVAILABLE'].includes(status),skipped:status==='SKIPPED',
  };
}
