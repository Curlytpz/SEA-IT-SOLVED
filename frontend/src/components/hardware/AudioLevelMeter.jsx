import { useEffect, useRef } from 'react';

export default function AudioLevelMeter({ getLevel, active=true }) {
  const barRef=useRef(null);
  useEffect(()=>{
    let frame=0,last=0;
    function render(now){
      if(now-last>50){
        const level=active?Math.max(0,Math.min(1,getLevel?.()||0)):0;
        if(barRef.current){barRef.current.style.transform=`scaleX(${level})`;barRef.current.parentElement?.setAttribute('aria-valuenow',String(Math.round(level*100)));}
        last=now;
      }
      frame=requestAnimationFrame(render);
    }
    frame=requestAnimationFrame(render);
    return()=>cancelAnimationFrame(frame);
  },[getLevel,active]);
  return <div role="meter" aria-label="Microphone audio level" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" className="h-3 overflow-hidden rounded-full bg-muted"><div ref={barRef} className="h-full origin-left scale-x-0 rounded-full bg-gradient-to-r from-success via-primary to-warning transition-transform duration-75"/></div>;
}
