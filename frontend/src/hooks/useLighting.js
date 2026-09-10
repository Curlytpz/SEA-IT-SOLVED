import { useCallback,useEffect,useState } from 'react';
import lessonLightingSession from '../hardware/lighting/lessonLightingSession';

export default function useLighting(){
  const [snapshot,setSnapshot]=useState(()=>lessonLightingSession.snapshot());

  useEffect(()=>lessonLightingSession.subscribe(setSnapshot),[]);
  useEffect(()=>()=>{lessonLightingSession.stopPreview().catch(()=>{});},[]);

  return {
    ...snapshot,
    service:lessonLightingSession,
    startPreview:useCallback(settings=>lessonLightingSession.startPreview(settings),[]),
    updateSettings:useCallback(settings=>lessonLightingSession.updateSettings(settings),[]),
    setSimulatedAmbientPercent:useCallback(value=>lessonLightingSession.setSimulatedAmbientPercent(value),[]),
    testLight:useCallback(()=>lessonLightingSession.testLight(),[]),
  };
}
