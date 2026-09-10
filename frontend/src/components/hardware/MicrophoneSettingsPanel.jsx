import { useCallback,useEffect,useRef,useState } from 'react';
import useMicrophone from '../../hooks/useMicrophone';
import { defaultMicrophoneSourceKey } from '../../hardware/microphone/microphoneSources';
import { getHardwareSettings,saveHardwareSettings } from '../../services/hardwareApi';
import { Alert,Btn,Card,FormField,Select } from '../ui';
import { Mic } from '../icons';
import AudioLevelMeter from './AudioLevelMeter';
import HardwareStatus from './HardwareStatus';
import { ConfiguredSummary,SettingsPanelHeader } from './HardwareSettingsState';

export default function MicrophoneSettingsPanel(){
  const [mode,setMode]=useState('SIMULATED');
  const [sourceKey,setSourceKey]=useState(defaultMicrophoneSourceKey('SIMULATED'));
  const [noisePreferred,setNoisePreferred]=useState(true);
  const [savedSettings,setSavedSettings]=useState({mode:'SIMULATED',sourceKey:defaultMicrophoneSourceKey('SIMULATED'),noisePreferred:true});
  const [editing,setEditing]=useState(false);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);const [testing,setTesting]=useState(false);const [testUrl,setTestUrl]=useState('');
  const [message,setMessage]=useState({text:'',type:'success'});const testUrlRef=useRef('');
  const microphone=useMicrophone(mode);const getLevel=useCallback(()=>microphone.service.getAudioLevel(),[microphone.service]);
  const active=['READY','RECORDING','PAUSED'].includes(microphone.status);
  const selectedDevice=microphone.devices.find(device=>device.id===sourceKey)?.label||(mode==='SIMULATED'?'Simulated Lapel Microphone':'Selected microphone');

  useEffect(()=>{getHardwareSettings().then(settings=>{const nextMode=settings.microphoneMode||'SIMULATED';const nextSource=settings.microphoneSourceKey||defaultMicrophoneSourceKey(nextMode);const nextNoise=settings.microphoneNoiseSuppression!==false;setMode(nextMode);setSourceKey(nextSource);setNoisePreferred(nextNoise);setSavedSettings({mode:nextMode,sourceKey:nextSource,noisePreferred:nextNoise});setEditing(false);}).catch(err=>setMessage({text:err.response?.data?.error||'Unable to load microphone settings.',type:'error'})).finally(()=>setLoading(false));},[]);
  useEffect(()=>{if(!sourceKey&&microphone.devices.length)setSourceKey(microphone.devices[0].id);},[sourceKey,microphone.devices]);
  useEffect(()=>()=>{if(testUrlRef.current)URL.revokeObjectURL(testUrlRef.current);},[]);

  async function save(){setSaving(true);setMessage({text:'',type:'success'});try{await saveHardwareSettings({microphoneMode:mode,microphoneSourceKey:sourceKey,microphoneNoiseSuppression:noisePreferred});setSavedSettings({mode,sourceKey,noisePreferred});setEditing(false);setMessage({text:'Microphone settings saved.',type:'success'});}catch(err){setMessage({text:err.response?.data?.error||'Unable to save microphone settings.',type:'error'});}finally{setSaving(false);}}
  async function start(){try{await microphone.start(sourceKey||undefined,{noiseSuppression:noisePreferred});}catch{/* friendly hook error */}}
  async function toggleNoise(){const next=!noisePreferred;setNoisePreferred(next);if(active){try{await microphone.setNoiseSuppression(next);}catch(err){setMessage({text:err.message||'Noise cancellation is unavailable for this microphone.',type:'error'});}}}
  async function startTest(){try{if(!active)await microphone.start(sourceKey||undefined,{noiseSuppression:noisePreferred});microphone.startRecording();setTesting(true);setMessage({text:'Microphone test is recording locally. Speak normally, then stop the test.',type:'success'});}catch(err){setMessage({text:err.message||'Unable to start microphone test.',type:'error'});}}
  async function stopTest(){try{const result=await microphone.stopRecording();const next=URL.createObjectURL(result.blob);if(testUrlRef.current)URL.revokeObjectURL(testUrlRef.current);testUrlRef.current=next;setTestUrl(next);setMessage({text:'Microphone test completed. This sample remains local and is not saved.',type:'success'});}catch(err){setMessage({text:err.message||'The microphone test could not be finalized.',type:'error'});}finally{setTesting(false);}}
  function cancel(){if(active)microphone.stop();setMode(savedSettings.mode);setSourceKey(savedSettings.sourceKey);setNoisePreferred(savedSettings.noisePreferred);setEditing(false);setMessage({text:'',type:'success'});}

  const noiseApplied=active?microphone.noiseSuppression.applied:noisePreferred;
  const noiseDescription=active?(microphone.noiseSuppression.simulated?'Simulated processing':microphone.noiseSuppression.supported?(microphone.noiseSuppression.applied?'Applied by the active microphone':'Not applied by the active microphone'):'Unsupported by this browser or device'):'Preference will be applied when the microphone starts.';

  return <section id="microphone-settings" className="space-y-4 scroll-mt-24">
    {message.text&&<Alert type={message.type} onClose={()=>setMessage({text:'',type:'success'})}>{message.text}</Alert>}
    {microphone.error&&<Alert type="error">{microphone.error}</Alert>}
    <Card className="p-5">
      <SettingsPanelHeader icon={<Mic size={17}/>} title="Microphone" description="Configure the microphone used automatically when a lesson starts." editing={editing}/>
      {!editing?<ConfiguredSummary items={[{label:'Mode',value:mode==='SIMULATED'?'Simulated / Development':'Browser / PC Microphone'},{label:'Device',value:selectedDevice},{label:'Noise Cancellation',value:noisePreferred?'ON':'OFF'}]}><Btn onClick={()=>setEditing(true)} disabled={testing}>Change Settings</Btn>{!testing?<Btn variant="secondary" onClick={startTest}><Mic size={15}/> Test Microphone</Btn>:<Btn variant="warning" onClick={stopTest}>Stop Test</Btn>}</ConfiguredSummary>:<>
        <div className="grid gap-4 sm:grid-cols-2"><FormField label="Microphone Mode"><Select value={mode} disabled={active||loading} onChange={event=>{const next=event.target.value;setMode(next);setSourceKey(defaultMicrophoneSourceKey(next));setTestUrl('')}}><option value="SIMULATED">Simulated / Development</option><option value="BROWSER">Browser / PC Microphone</option></Select></FormField><FormField label="Microphone Device"><Select value={sourceKey} disabled={active||loading} onChange={event=>setSourceKey(event.target.value)}>{!microphone.devices.length&&<option value="">No microphone detected</option>}{microphone.devices.map(device=><option key={device.id} value={device.id}>{device.label}</option>)}</Select></FormField></div>
        <div className="mb-4"><HardwareStatus label="Microphone" status={microphone.status} simulated={mode==='SIMULATED'} detail={selectedDevice}/></div>
        <div className="mb-4 flex flex-col justify-between gap-3 rounded-xl bg-surface-subtle p-3 sm:flex-row sm:items-center"><div><p className="text-sm font-semibold text-foreground">Noise Cancellation</p><p className="text-xs text-muted-foreground">{noiseDescription}</p></div><button type="button" aria-pressed={noiseApplied} onClick={toggleNoise} disabled={active&&!microphone.noiseSuppression.supported} className={`min-h-11 rounded-lg px-3 text-xs font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${noiseApplied?'bg-primary text-primary-foreground':'bg-secondary text-muted-foreground'}`}>{active&&!microphone.noiseSuppression.supported?'UNSUPPORTED':noiseApplied?'ON':'OFF'}</button></div>
        <div className="mb-4"><div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300"><span>Audio Level</span><span>{microphone.status==='READY'||testing?'LIVE':'IDLE'}</span></div><AudioLevelMeter getLevel={getLevel} active={active}/></div>
        <div className="flex flex-wrap gap-2 border-t border-slate-200/80 pt-4 dark:border-white/10"><Btn loading={saving} disabled={testing||loading} onClick={save}>Save Microphone Settings</Btn><Btn variant="ghost" disabled={saving||testing} onClick={cancel}>Cancel</Btn>{mode==='BROWSER'&&<Btn variant="secondary" loading={microphone.status==='REQUESTING_PERMISSION'} onClick={()=>microphone.requestPermission().catch(()=>{})}>Request Permission</Btn>}{microphone.status==='STOPPED'||microphone.status==='ERROR'?<Btn variant="secondary" onClick={start}><Mic size={15}/> Start Microphone</Btn>:<Btn variant="secondary" disabled={testing} onClick={microphone.stop}>Stop Microphone</Btn>}</div>
      </>}
      {testing&&<div className="mt-4"><div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300"><span>Test Audio Level</span><span>RECORDING</span></div><AudioLevelMeter getLevel={getLevel} active/></div>}
      {testUrl&&<div className="mt-4 rounded-xl border border-slate-200 p-3 dark:border-white/10"><p className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">Local Test Playback</p><audio controls src={testUrl} className="w-full"/></div>}
    </Card>
  </section>;
}
