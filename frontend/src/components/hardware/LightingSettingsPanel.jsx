import { useEffect,useState } from 'react';
import useLighting from '../../hooks/useLighting';
import { DEFAULT_LIGHTING_SETTINGS } from '../../hardware/lighting/lessonLightingSession';
import { getHardwareSettings,saveHardwareSettings } from '../../services/hardwareApi';
import { Alert,Btn,Card,FormField,Input,Select } from '../ui';
import { Lightbulb } from '../icons';
import HardwareStatus from './HardwareStatus';
import { ConfiguredSummary,SettingsPanelHeader } from './HardwareSettingsState';

const FIELDS=['lightingHardwareMode','lightingMode','lightingThresholdPercent','lightingHysteresisPercent','lightingBrightnessPercent','simulatedAmbientLightPercent'];
const RANGE_CLASS = `!cursor-pointer !appearance-none !border-0 !bg-transparent !p-0 !shadow-none
  focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary
  [&::-webkit-slider-runnable-track]:h-[.4rem] [&::-webkit-slider-runnable-track]:w-full [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-primary-subtle
  [&::-webkit-slider-thumb]:-mt-[.35rem] [&::-webkit-slider-thumb]:h-[1.1rem] [&::-webkit-slider-thumb]:w-[1.1rem] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-[0_1px_5px_hsl(var(--primary)/.38)]
  [&::-moz-range-track]:h-[.4rem] [&::-moz-range-track]:w-full [&::-moz-range-track]:rounded-full [&::-moz-range-track]:border-0 [&::-moz-range-track]:bg-primary-subtle
  [&::-moz-range-thumb]:h-[.8rem] [&::-moz-range-thumb]:w-[.8rem] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:shadow-[0_1px_5px_hsl(var(--primary)/.38)]
  dark:[&::-webkit-slider-runnable-track]:bg-primary/30 dark:[&::-moz-range-track]:bg-primary/30`;
function lightingSettings(input={}){return FIELDS.reduce((result,key)=>({...result,[key]:input[key]??DEFAULT_LIGHTING_SETTINGS[key]}),{});}

export default function LightingSettingsPanel(){
  const [settings,setSettings]=useState(DEFAULT_LIGHTING_SETTINGS);
  const [savedSettings,setSavedSettings]=useState(DEFAULT_LIGHTING_SETTINGS);
  const [editing,setEditing]=useState(false);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [testing,setTesting]=useState(false);
  const [message,setMessage]=useState({text:'',type:'success'});
  const lighting=useLighting();

  useEffect(()=>{
    let mounted=true;
    getHardwareSettings().then(async stored=>{if(!mounted)return;const next=lightingSettings(stored);setSettings(next);setSavedSettings(next);setEditing(false);await lighting.startPreview(next);}).catch(error=>{if(mounted)setMessage({text:error.response?.data?.error||error.message||'Unable to load lighting settings.',type:'error'});}).finally(()=>{if(mounted)setLoading(false);});
    return()=>{mounted=false;};
  },[lighting.startPreview]);

  async function apply(changes){
    const next={...settings,...changes};
    if(next.lightingThresholdPercent+next.lightingHysteresisPercent>100){if('lightingThresholdPercent' in changes)next.lightingHysteresisPercent=Math.max(0,100-next.lightingThresholdPercent);else next.lightingThresholdPercent=Math.max(0,100-next.lightingHysteresisPercent);}
    setSettings(next);try{await lighting.updateSettings(next);}catch(error){setMessage({text:error.message||'Lighting preview is unavailable.',type:'error'});}
  }

  async function save(){setSaving(true);setMessage({text:'',type:'success'});try{const next=lightingSettings(await saveHardwareSettings(settings));setSettings(next);setSavedSettings(next);await lighting.updateSettings(next);setEditing(false);setMessage({text:'Lighting settings saved.',type:'success'});}catch(error){setMessage({text:error.response?.data?.error||error.message||'Unable to save lighting settings.',type:'error'});}finally{setSaving(false);}}
  async function cancel(){setSettings(savedSettings);try{await lighting.updateSettings(savedSettings);}catch{/* existing warning remains visible */}setEditing(false);setMessage({text:'',type:'success'});}
  async function test(){setTesting(true);setMessage({text:'',type:'success'});try{await lighting.testLight();setMessage({text:'Lighting test completed.',type:'success'});}catch(error){setMessage({text:error.message||'The lighting test could not run.',type:'error'});}finally{setTesting(false);}}

  const ambient=Math.round(100*(lighting.filteredNormalized??lighting.ambientNormalized??settings.simulatedAmbientLightPercent/100));
  return <section id="lighting-settings" className="space-y-4 scroll-mt-24">
    {message.text&&<Alert type={message.type} onClose={()=>setMessage({text:'',type:'success'})}>{message.text}</Alert>}
    {lighting.error&&<Alert type="warning">{lighting.error}</Alert>}
    <Card className="p-5">
      <SettingsPanelHeader icon={<Lightbulb size={17}/>} title="Classroom Lighting" description="Configure simulated ambient sensing and the lesson whiteboard light." editing={editing}/>
      {!editing?<ConfiguredSummary items={[{label:'Mode',value:settings.lightingMode},{label:'Threshold',value:`${settings.lightingThresholdPercent}%`},{label:'Brightness',value:`${settings.lightingBrightnessPercent}%`},{label:'Current Status',value:`${ambient}% ambient • LED ${lighting.ledOn?'ON':'OFF'}`}]}><Btn onClick={()=>setEditing(true)}>Change Settings</Btn><Btn variant="secondary" onClick={test} loading={testing}><Lightbulb size={15}/> Test Light</Btn></ConfiguredSummary>:<>
        <div className="grid gap-4 sm:grid-cols-2"><FormField label="Lighting Hardware"><Select value={settings.lightingHardwareMode} disabled={loading} onChange={event=>apply({lightingHardwareMode:event.target.value})}><option value="SIMULATED">Simulated / Development</option><option value="RASPBERRY_PI" disabled>Raspberry Pi (Future)</option></Select></FormField><FormField label="Lighting Mode"><Select value={settings.lightingMode} disabled={loading} onChange={event=>apply({lightingMode:event.target.value})}><option value="AUTO">AUTO — Ambient sensor</option><option value="ON">ON — Force light on</option><option value="OFF">OFF — Force light off</option></Select></FormField></div>
        <div className="mb-4"><HardwareStatus label="Lighting" status={lighting.status} simulated detail={`${ambient}% ambient • LED ${lighting.ledOn?'ON':'OFF'}`}/></div>
        <div className="grid gap-x-5 sm:grid-cols-2"><FormField label={`Simulated Ambient Light — ${settings.simulatedAmbientLightPercent}%`} hint="Move below and above the AUTO thresholds to test the sensor logic."><Input className={RANGE_CLASS} type="range" min="0" max="100" value={settings.simulatedAmbientLightPercent} onChange={event=>apply({simulatedAmbientLightPercent:Number(event.target.value)})}/></FormField><FormField label={`LED Brightness — ${settings.lightingBrightnessPercent}%`}><Input className={RANGE_CLASS} type="range" min="0" max="100" value={settings.lightingBrightnessPercent} onChange={event=>apply({lightingBrightnessPercent:Number(event.target.value)})}/></FormField><FormField label="AUTO Threshold (%)"><Input type="number" min="0" max="100" value={settings.lightingThresholdPercent} onChange={event=>apply({lightingThresholdPercent:Number(event.target.value)})}/></FormField><FormField label="Hysteresis (%)" hint={`LED turns off at ${settings.lightingThresholdPercent+settings.lightingHysteresisPercent}% or brighter.`}><Input type="number" min="0" max="50" value={settings.lightingHysteresisPercent} onChange={event=>apply({lightingHysteresisPercent:Number(event.target.value)})}/></FormField></div>
        <div className="flex flex-wrap gap-2 border-t border-border/80 pt-4 dark:border-border"><Btn onClick={save} loading={saving} disabled={loading||testing}>Save Lighting Settings</Btn><Btn variant="ghost" onClick={cancel} disabled={saving||testing}>Cancel</Btn><Btn variant="secondary" onClick={test} loading={testing} disabled={loading||saving}><Lightbulb size={15}/> Test Light</Btn></div>
      </>}
    </Card>
  </section>;
}
