import { useEffect,useState } from 'react';
import { getHardwareSettings,saveHardwareSettings } from '../../services/hardwareApi';
import { DEFAULT_AUTO_CAPTURE_SETTINGS } from '../../utils/smartAutoCapture';
import { Alert,Btn,Card,FormField,Select } from '../ui';
import { Camera } from '../icons';
import { ConfiguredSummary,SettingsPanelHeader } from './HardwareSettingsState';

export const SENSITIVITY_PROFILES={
  LOW:{minimumContentChangePercent:30,stabilitySeconds:5,cooldownSeconds:60,intervalMinutes:8},
  MEDIUM:{minimumContentChangePercent:20,stabilitySeconds:3,cooldownSeconds:30,intervalMinutes:5},
  HIGH:{minimumContentChangePercent:12,stabilitySeconds:2,cooldownSeconds:15,intervalMinutes:3},
};

function Toggle({enabled,onChange,disabled=false}){
  return <button type="button" aria-pressed={enabled} disabled={disabled} onClick={()=>onChange(!enabled)} className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-xs font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${enabled?'bg-primary text-primary-foreground':'bg-secondary text-muted-foreground'}`}><span className={`h-2 w-2 rounded-full ${enabled?'bg-primary-foreground':'bg-muted-foreground'}`}/>{enabled?'ON':'OFF'}</button>;
}

function withProfile(input){
  const merged={...DEFAULT_AUTO_CAPTURE_SETTINGS,...input};
  const sensitivity=SENSITIVITY_PROFILES[merged.boardFillSensitivity]?merged.boardFillSensitivity:'MEDIUM';
  const mode=merged.autoCaptureMode==='MANUAL'?'MANUAL':'SMART_AUTO';
  return {
    autoCaptureEnabled:merged.autoCaptureEnabled,
    autoCaptureMode:mode,
    boardFillSensitivity:sensitivity,
    captureWhilePaused:merged.captureWhilePaused,
    ...SENSITIVITY_PROFILES[sensitivity],
  };
}

export default function AutoCaptureSettingsPanel(){
  const [settings,setSettings]=useState(DEFAULT_AUTO_CAPTURE_SETTINGS);
  const [savedSettings,setSavedSettings]=useState(DEFAULT_AUTO_CAPTURE_SETTINGS);
  const [editing,setEditing]=useState(false);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState({text:'',type:'success'});

  useEffect(()=>{getHardwareSettings().then(current=>{const next=withProfile(current);setSettings(next);setSavedSettings(next);setEditing(false);}).catch(err=>setMessage({text:err.response?.data?.error||'Unable to load auto capture settings.',type:'error'})).finally(()=>setLoading(false));},[]);
  const update=(key,value)=>setSettings(current=>withProfile({...current,[key]:value}));

  async function save(){setSaving(true);setMessage({text:'',type:'success'});try{const saved=withProfile(await saveHardwareSettings(withProfile(settings)));setSettings(saved);setSavedSettings(saved);setEditing(false);setMessage({text:'Auto capture settings saved.',type:'success'});}catch(err){setMessage({text:err.response?.data?.error||'Unable to save auto capture settings.',type:'error'});}finally{setSaving(false);}}
  function cancel(){setSettings(savedSettings);setEditing(false);setMessage({text:'',type:'success'});}

  const modeLabel=settings.autoCaptureMode==='MANUAL'?'Manual':'Smart Auto';
  return <section className="mt-5">
    {message.text&&<Alert type={message.type} onClose={()=>setMessage({text:'',type:'success'})}>{message.text}</Alert>}
    <Card className="p-5">
      <SettingsPanelHeader icon={<Camera size={17}/>} title="Smart Auto Capture" description="Automatically save meaningful, stable whiteboard updates during a lesson." editing={editing}/>
      {!editing?<ConfiguredSummary items={[{label:'Status',value:settings.autoCaptureEnabled?'ON':'OFF'},{label:'Mode',value:modeLabel},{label:'Sensitivity',value:settings.boardFillSensitivity[0]+settings.boardFillSensitivity.slice(1).toLowerCase()},{label:'Capture While Paused',value:settings.captureWhilePaused?'ON':'OFF'}]}><Btn onClick={()=>setEditing(true)}>Change Settings</Btn></ConfiguredSummary>:<>
        <div className="grid gap-x-5 sm:grid-cols-2">
          <FormField label="Auto Capture"><Toggle enabled={settings.autoCaptureEnabled} disabled={loading} onChange={value=>update('autoCaptureEnabled',value)}/></FormField>
          <FormField label="Mode"><Select value={settings.autoCaptureMode} disabled={loading||!settings.autoCaptureEnabled} onChange={event=>update('autoCaptureMode',event.target.value)}><option value="SMART_AUTO">Smart Auto</option><option value="MANUAL">Manual</option></Select></FormField>
          <FormField label="Sensitivity" hint="Low is conservative, Medium is balanced, and High responds faster."><Select value={settings.boardFillSensitivity} disabled={loading||!settings.autoCaptureEnabled||settings.autoCaptureMode!=='SMART_AUTO'} onChange={event=>update('boardFillSensitivity',event.target.value)}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></Select></FormField>
          <FormField label="Capture While Paused" hint="Off by default to avoid unexpected paused captures."><Toggle enabled={settings.captureWhilePaused} disabled={loading||!settings.autoCaptureEnabled} onChange={value=>update('captureWhilePaused',value)}/></FormField>
        </div>
        <div className="mt-1 flex flex-wrap gap-2 border-t border-slate-200/80 pt-4 dark:border-white/10"><Btn loading={saving} disabled={loading} onClick={save}>Save Auto Capture Settings</Btn><Btn variant="ghost" disabled={saving} onClick={cancel}>Cancel</Btn></div>
      </>}
    </Card>
  </section>;
}
