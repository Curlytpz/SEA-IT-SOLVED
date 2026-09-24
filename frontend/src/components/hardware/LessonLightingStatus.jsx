import { useEffect,useState } from 'react';
import { useLocation,useNavigate } from 'react-router-dom';
import lessonLightingSession from '../../hardware/lighting/lessonLightingSession';
import { getHardwareSettings } from '../../services/hardwareApi';
import { Lightbulb } from '../icons';

export default function LessonLightingStatus({lesson,onStatusChange}){
  const [lighting,setLighting]=useState(()=>lessonLightingSession.snapshot());
  const navigate=useNavigate();const location=useLocation();

  useEffect(()=>lessonLightingSession.subscribe(setLighting),[]);
  useEffect(()=>{
    if(!lesson?.id)return;
    let cancelled=false;
    const current=lessonLightingSession.snapshot();
    if(['ACTIVE','PAUSED'].includes(lesson.status)&&current.lessonId===lesson.id)return;
    getHardwareSettings().then(settings=>lesson.status==='CREATED'
      ? lessonLightingSession.startPreview(settings)
      : ['ACTIVE','PAUSED'].includes(lesson.status)
        ? lessonLightingSession.startLesson(lesson.id,settings)
        : null
    ).then(()=>{if(cancelled&&lesson.status==='CREATED')lessonLightingSession.stopPreview().catch(()=>{});}).catch(()=>{});
    return()=>{cancelled=true;if(lesson.status==='CREATED')lessonLightingSession.stopPreview().catch(()=>{});};
  },[lesson?.id,lesson?.status]);
  useEffect(()=>{onStatusChange?.(lighting);},[lighting,onStatusChange]);

  const ambient=Math.round(100*(lighting.filteredNormalized??lighting.ambientNormalized??0));
  if(lighting.status==='ERROR')return <button type="button" onClick={()=>navigate('/instructor/settings#lighting-settings',{state:{fromLesson:true,returnTo:location.pathname}})} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-warning-subtle-foreground hover:bg-warning-subtle dark:text-warning-subtle-foreground dark:hover:bg-warning-subtle"><Lightbulb size={14}/> Lighting unavailable</button>;
  return <span className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-muted-foreground dark:text-muted-foreground"><Lightbulb size={14} className={lighting.ledOn?'text-warning':'text-muted-foreground'}/> Lighting {lighting.mode} • {ambient}% ambient • LED {lighting.ledOn?'ON':'OFF'}</span>;
}
