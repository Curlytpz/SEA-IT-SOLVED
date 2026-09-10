import { useCallback } from 'react';
import { useLocation,useNavigate } from 'react-router-dom';
import { Alert,Btn,Card } from '../ui';
import { Mic,Settings } from '../icons';
import AudioLevelMeter from './AudioLevelMeter';
import ProtectedAudioPlayer from './ProtectedAudioPlayer';

function formatDuration(ms){const total=Math.floor((ms||0)/1000);const h=Math.floor(total/3600),m=Math.floor((total%3600)/60),s=total%60;return h?`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;}

export default function LessonAudioPanel({lesson,audio}){
  const navigate=useNavigate();const location=useLocation();
  const getLevel=useCallback(()=>audio.service.getAudioLevel(),[audio.service]);
  const connected=['RECORDING','PAUSED','READY','SAVED'].includes(audio.status);
  const statusTone=audio.isUnavailable?'bg-red-500':audio.skipped?'bg-amber-500':connected?'bg-emerald-500':'bg-slate-400';
  const preparing=lesson.status==='CREATED';
  const recordingLabel=audio.status==='RECORDING'?'● REC':audio.status==='PAUSED'?'PAUSED':audio.status==='READY'?'READY':audio.status==='LOADING'?'CHECKING':audio.savedRecording?'SAVED':audio.skipped?'NOT RECORDING':'IDLE';
  const openSettings=()=>navigate('/instructor/settings#microphone-settings',{state:{returnTo:location.pathname+location.search,fromLesson:true}});

  async function toggleNoise(){
    try{await audio.setNoiseSuppression(!audio.noiseSuppressionPreferred);audio.setMessage({text:'Noise cancellation preference updated.',type:'success'});}
    catch(err){audio.setMessage({text:err.message||'Noise cancellation could not be changed for this microphone.',type:'error'});}
  }

  return <section className="mt-8">
    <div className="mb-3"><h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white"><Mic size={18}/> Audio Capture</h2><p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{preparing?'Monitor the microphone now. Recording begins only when the session starts.':'Recording follows the active lesson lifecycle.'}</p></div>
    {audio.message.text&&<Alert type={audio.message.type} onClose={()=>audio.setMessage({text:'',type:'success'})}>{audio.message.text}</Alert>}
    <Card className="p-4 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(190px,.9fr)_minmax(160px,.7fr)_minmax(240px,1.4fr)] lg:items-center">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Microphone</p>
          <div className="mt-1.5 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200"><span className={`h-2.5 w-2.5 rounded-full ${statusTone}`}/>{audio.isUnavailable?'Unavailable':audio.skipped?'Audio skipped':connected?'Connected':audio.status}</div>
          <p className="mt-1 truncate text-xs text-slate-400">{audio.sourceLabel||audio.sourceKey||'Configured microphone'}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Recording</p>
          <p className={`mt-1 font-mono text-xl font-bold ${audio.status==='RECORDING'?'text-red-600 dark:text-red-300':audio.status==='PAUSED'?'text-amber-600 dark:text-amber-300':'text-slate-700 dark:text-slate-200'}`}>{recordingLabel} <span className="ml-1">{formatDuration(audio.savedRecording?.durationMs??audio.elapsedMs)}</span></p>
        </div>
        <div><div className="mb-2 flex justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400"><span>Audio Level</span><span>{audio.status==='RECORDING'?'Live':audio.status}</span></div><AudioLevelMeter getLevel={getLevel} active={['READY','RECORDING','PAUSED'].includes(audio.status)}/></div>
      </div>

      <div className="mt-4 flex flex-col justify-between gap-3 border-t border-slate-200/80 pt-4 sm:flex-row sm:items-center dark:border-white/10">
        <div><p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Noise Cancellation</p><p className="text-xs text-slate-400">{audio.noiseSuppression.simulated?'Simulated processing':audio.noiseSuppression.supported?(audio.noiseSuppression.applied?'Applied by this microphone':'Currently off'):'Unsupported by this browser or device'}</p></div>
        <button type="button" aria-pressed={audio.noiseSuppression.applied} disabled={!audio.noiseSuppression.supported||audio.isUnavailable||audio.savedRecording} onClick={toggleNoise} className={`min-h-11 rounded-lg px-3 text-xs font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${audio.noiseSuppression.applied?'bg-primary text-primary-foreground':'bg-secondary text-muted-foreground'}`}>{audio.noiseSuppression.supported?(audio.noiseSuppression.applied?'ON':'OFF'):'UNSUPPORTED'}</button>
      </div>

      {(audio.isUnavailable||audio.skipped)&&!audio.savedRecording&&<Alert
        type="warning"
        label={audio.skipped?'Audio skipped':'Audio warning'}
        className="mb-0 mt-4"
        actions={<>{audio.isUnavailable&&<Btn size="sm" loading={audio.preparing} onClick={()=>audio.retryMicrophone().catch(()=>{})}>{preparing?'Check Microphone':'Retry'}</Btn>}<Btn variant="secondary" size="sm" onClick={openSettings}><Settings size={14}/> Open Hardware Settings</Btn></>}
      >{audio.skipped?'This lesson is continuing without audio.':preparing?'Microphone unavailable. Check the device before starting the recording session.':'Microphone unavailable. Camera and lesson controls remain available.'}</Alert>}
      {preparing&&audio.status==='READY'&&<p className="mt-3 text-xs font-medium text-emerald-700 dark:text-emerald-300">Monitoring only. No lesson audio is being recorded.</p>}
      {audio.hasRecording&&<p className="mt-3 text-xs text-slate-400">Pause and resume are controlled by the lesson lifecycle.</p>}
      {audio.hasUnsavedAudio&&<Btn className="mt-3" loading={audio.uploading} onClick={()=>audio.finalizeForEnd().catch(()=>{})}>Retry Saving Audio</Btn>}
      {audio.savedRecording&&<div className="mt-4 border-t border-slate-200/80 pt-4 dark:border-white/10"><div className="mb-2 flex flex-wrap justify-between gap-2 text-xs text-slate-500"><span>Saved lesson recording</span><span>{new Date(audio.savedRecording.recordedAt).toLocaleString('en-PH')}</span></div><ProtectedAudioPlayer url={audio.savedRecording.audioUrl}/></div>}
    </Card>
  </section>;
}
