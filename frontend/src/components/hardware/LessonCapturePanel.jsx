import { useEffect,useRef,useState } from 'react';
import { useLocation,useNavigate } from 'react-router-dom';
import useCamera from '../../hooks/useCamera';
import { getCalibration,getHardwareSettings,saveHardwareSettings } from '../../services/hardwareApi';
import { createCapture,deleteCapture,fetchCaptureBlob,getCaptures } from '../../services/captureApi';
import { combineCorrectedPlanes,correctCalibration } from '../../utils/perspectiveCorrection';
import { calibrationValidation,isValidCalibration } from '../../utils/calibrationPlanes';
import { analyzeBoardCanvas,boardHasEnoughContent,compareBoardDescriptors,DEFAULT_AUTO_CAPTURE_SETTINGS,descriptorFromImageBlob,isBoardStable } from '../../utils/smartAutoCapture';
import { Alert,Btn,Card,Select } from '../ui';
import CameraPreview from './CameraPreview';
import ProtectedCaptureImage from './ProtectedCaptureImage';
import LessonLightingStatus from './LessonLightingStatus';
import { Camera,Check,Trash } from '../icons';
import { defaultCameraSourceKey } from '../../hardware/camera/cameraSources';
import lessonLightingSession from '../../hardware/lighting/lessonLightingSession';

function newestFirst(items){return [...items].sort((a,b)=>new Date(b.capturedAt)-new Date(a.capturedAt));}
function versionedImageUrl(capture){const url=capture?.correctedUrl||capture?.originalUrl;return url?`${url}?v=${encodeURIComponent(capture.id)}`:'';}

export default function LessonCapturePanel({lesson,onReadinessChange}){
  const navigate=useNavigate();const location=useLocation();
  const [mode,setMode]=useState('SIMULATED');const [sourceKey,setSourceKey]=useState(defaultCameraSourceKey('SIMULATED'));
  const [calibration,setCalibration]=useState(null);const [calibrationStatus,setCalibrationStatus]=useState('LOADING');const [settings,setSettings]=useState(DEFAULT_AUTO_CAPTURE_SETTINGS);const [settingsReady,setSettingsReady]=useState(false);
  const [captures,setCaptures]=useState([]);const [loadingCapture,setLoadingCapture]=useState(false);const [message,setMessage]=useState({text:'',type:'success'});
  const [latestCapture,setLatestCapture]=useState(null);const [latestLocalPreview,setLatestLocalPreview]=useState(null);const [previewMode,setPreviewMode]=useState('LATEST');
  const [correctedReady,setCorrectedReady]=useState(false);const [previewError,setPreviewError]=useState('');const [autoStatus,setAutoStatus]=useState('Initializing…');const [autoToast,setAutoToast]=useState(null);
  const [lightingReadiness,setLightingReadiness]=useState(()=>lessonLightingSession.snapshot());
  const videoRef=useRef(null),canvasRef=useRef(null),correctedCanvasRef=useRef(null),panelRef=useRef(null);
  const previewBusyRef=useRef(false),captureInFlightRef=useRef(false),latestObjectUrlRef=useRef(''),baselineRef=useRef(null),previousSampleRef=useRef(null),stableSinceRef=useRef(null),lastCaptureAtRef=useRef(0),undoTimerRef=useRef(null);
  const camera=useCamera(mode);

  useEffect(()=>{onReadinessChange?.({cameraStatus:camera.status,cameraMode:mode,calibrationStatus,lighting:lightingReadiness});},[camera.status,mode,calibrationStatus,lightingReadiness,onReadinessChange]);

  const canCapture=lesson.status==='ACTIVE'&&camera.status==='READY'&&calibrationStatus==='CALIBRATED'&&!loadingCapture;
  const autoAllowed=lesson.status==='ACTIVE'||(lesson.status==='PAUSED'&&settings.captureWhilePaused);
  const autoMonitoring=settings.autoCaptureEnabled&&settings.autoCaptureMode!=='MANUAL'&&autoAllowed&&calibrationStatus==='CALIBRATED';
  const visiblePreviewMode=previewMode==='LATEST'&&!latestCapture?'LIVE':previewMode;

  async function seedBaseline(capture,sensitivity=settings.boardFillSensitivity){
    if(!capture){baselineRef.current=null;previousSampleRef.current=null;return;}
    try{const blob=await fetchCaptureBlob(capture.correctedUrl||capture.originalUrl);const descriptor=await descriptorFromImageBlob(blob,sensitivity);baselineRef.current=descriptor;previousSampleRef.current=descriptor;}
    catch{baselineRef.current=null;previousSampleRef.current=null;}
  }

  useEffect(()=>{
    let cancelled=false;
    async function initialize(){
      try{
        const [settingsResult,capturesResult]=await Promise.allSettled([getHardwareSettings(),getCaptures(lesson.id)]);
        if(cancelled)return;
        if(settingsResult.status==='rejected')throw settingsResult.reason;
        const savedSettings=settingsResult.value;
        const nextMode=savedSettings.hardwareMode||'SIMULATED';const nextSourceKey=savedSettings.cameraSourceKey||defaultCameraSourceKey(nextMode);const merged={...DEFAULT_AUTO_CAPTURE_SETTINGS,...savedSettings};
        const ordered=capturesResult.status==='fulfilled'?newestFirst(capturesResult.value):[];const latest=ordered[0]||null;
        setMode(nextMode);setSourceKey(nextSourceKey);setSettings(merged);setCaptures(ordered);setLatestCapture(latest);setSettingsReady(true);
        if(capturesResult.status==='rejected')setMessage({text:capturesResult.reason?.response?.data?.error||'Capture history could not be loaded, but camera calibration can still initialize.',type:'error'});
        lastCaptureAtRef.current=latest?new Date(latest.capturedAt).getTime():Date.now();
        await seedBaseline(latest,merged.boardFillSensitivity);
      }catch(err){if(!cancelled)setMessage({text:err.response?.data?.error||'Unable to initialize the capture session.',type:'error'});}
    }
    initialize();return()=>{cancelled=true;};
  },[lesson.id]);

  useEffect(()=>{
    if(!settingsReady)return undefined;
    if(!sourceKey){setCalibration(null);setCalibrationStatus('NOT_CALIBRATED');return undefined;}
    let cancelled=false;setCalibration(null);setCalibrationStatus('LOADING');
    getCalibration(sourceKey).then(current=>{
      if(cancelled)return;
      if(!current){setCalibrationStatus('NOT_CALIBRATED');return;}
      const validation=calibrationValidation(current);
      if(!validation.valid){setCalibrationStatus('INVALID');setMessage({text:validation.error||'The saved calibration is invalid.',type:'error'});return;}
      setCalibration(current);setCalibrationStatus('CALIBRATED');
    }).catch(err=>{if(!cancelled){setCalibrationStatus('INVALID');setMessage({text:err.response?.data?.error||'Unable to load calibration for this camera.',type:'error'});}});
    return()=>{cancelled=true;};
  },[settingsReady,sourceKey]);
  useEffect(()=>{if(!sourceKey&&camera.devices.length)setSourceKey(camera.devices[0].id);},[camera.devices,sourceKey]);
  useEffect(()=>()=>{if(latestObjectUrlRef.current)URL.revokeObjectURL(latestObjectUrlRef.current);clearTimeout(undoTimerRef.current);},[]);

  function sourceElement(){return mode==='BROWSER'?videoRef.current:canvasRef.current;}

  async function openCalibration(){
    try{await saveHardwareSettings({hardwareMode:mode,cameraSourceKey:sourceKey});navigate('/instructor/settings#camera-calibration',{state:{returnTo:location.pathname+location.search,fromLesson:true}});}
    catch(err){setMessage({text:err.response?.data?.error||'Unable to open calibration for this camera.',type:'error'});}
  }
  async function start(){try{await camera.start(sourceKey||undefined);}catch{/* camera hook exposes error */}}

  async function captureWhiteboard(trigger='MANUAL'){
    const allowed=trigger==='AUTO'?autoAllowed:lesson.status==='ACTIVE';
    if(!allowed||camera.status!=='READY'||calibrationStatus!=='CALIBRATED'||!calibration||captureInFlightRef.current)return null;
    captureInFlightRef.current=true;setLoadingCapture(true);if(trigger==='MANUAL')setMessage({text:'',type:'success'});
    try{
      const authoritativeCalibration=await getCalibration(sourceKey);if(!authoritativeCalibration)throw new Error('Calibration required for this camera.');if(!isValidCalibration(authoritativeCalibration))throw new Error('The saved camera calibration is invalid.');setCalibration(authoritativeCalibration);setCalibrationStatus('CALIBRATED');
      const original=await camera.service.captureFrame(sourceElement());const correctedPlanes=await correctCalibration(original.canvas,authoritativeCalibration);const corrected=await combineCorrectedPlanes(correctedPlanes);
      const saved=await createCapture(lesson.id,{originalBlob:original.blob,correctedBlob:corrected.blob,metadata:{calibrationId:authoritativeCalibration.id,capturedAt:original.capturedAt,originalWidth:original.width,originalHeight:original.height,correctedWidth:corrected.width,correctedHeight:corrected.height}});
      const descriptor=analyzeBoardCanvas(corrected.canvas,settings.boardFillSensitivity);baselineRef.current=descriptor;previousSampleRef.current=descriptor;stableSinceRef.current=null;lastCaptureAtRef.current=Date.now();
      const newObjectUrl=URL.createObjectURL(corrected.blob);const previousObjectUrl=latestObjectUrlRef.current;latestObjectUrlRef.current=newObjectUrl;
      setLatestLocalPreview({captureId:saved.id,url:newObjectUrl});setLatestCapture(saved);setPreviewMode('LATEST');setCaptures(current=>newestFirst([saved,...current.filter(capture=>capture.id!==saved.id)]));
      if(previousObjectUrl)requestAnimationFrame(()=>URL.revokeObjectURL(previousObjectUrl));
      if(trigger==='AUTO'){
        setAutoStatus(`Cooldown ${settings.cooldownSeconds}s`);setAutoToast({capture:saved,time:new Date()});clearTimeout(undoTimerRef.current);undoTimerRef.current=setTimeout(()=>setAutoToast(null),8000);
      }else setMessage({text:'Whiteboard capture saved and linked to this lesson.',type:'success'});
      return saved;
    }catch(err){setMessage({text:err.response?.data?.error||err.message||'Capture failed.',type:'error'});return null;}
    finally{captureInFlightRef.current=false;setLoadingCapture(false);}
  }

  async function evaluateAutoCapture(correctedCanvas){
    if(!autoMonitoring||captureInFlightRef.current)return;
    const now=Date.now();const descriptor=analyzeBoardCanvas(correctedCanvas,settings.boardFillSensitivity);
    if(settings.autoCaptureMode==='INTERVAL'){
      const waitMs=Math.max(settings.intervalMinutes*60000,settings.cooldownSeconds*1000);const remaining=waitMs-(now-lastCaptureAtRef.current);
      if(remaining<=0){setAutoStatus('Capturing interval update…');await captureWhiteboard('AUTO');}
      else setAutoStatus(`Next interval in ${Math.max(1,Math.ceil(remaining/60000))}m`);
      previousSampleRef.current=descriptor;return;
    }
    if(!baselineRef.current){baselineRef.current=descriptor;previousSampleRef.current=descriptor;setAutoStatus('Monitoring board…');return;}
    const cooldownRemaining=settings.cooldownSeconds*1000-(now-lastCaptureAtRef.current);
    if(cooldownRemaining>0){previousSampleRef.current=descriptor;stableSinceRef.current=null;setAutoStatus(`Cooldown ${Math.ceil(cooldownRemaining/1000)}s`);return;}
    const comparison=compareBoardDescriptors(descriptor,baselineRef.current);const meaningful=comparison.changePercent>=settings.minimumContentChangePercent&&boardHasEnoughContent(descriptor,settings.boardFillSensitivity);
    if(!meaningful){previousSampleRef.current=descriptor;stableSinceRef.current=null;setAutoStatus('Monitoring board…');return;}
    if(!isBoardStable(descriptor,previousSampleRef.current)){previousSampleRef.current=descriptor;stableSinceRef.current=null;setAutoStatus('Candidate detected • waiting for board to settle');return;}
    previousSampleRef.current=descriptor;if(!stableSinceRef.current)stableSinceRef.current=now;
    const stableElapsed=now-stableSinceRef.current;const remaining=Math.max(0,Math.ceil(settings.stabilitySeconds-stableElapsed/1000));
    if(stableElapsed>=settings.stabilitySeconds*1000){setAutoStatus('Board stable • capturing…');await captureWhiteboard('AUTO');}
    else setAutoStatus(`Waiting for stability… ${remaining}s`);
  }

  useEffect(()=>{
    setCorrectedReady(false);setPreviewError('');
    const shouldProcess=camera.status==='READY'&&calibrationStatus==='CALIBRATED'&&!!calibration&&(visiblePreviewMode==='LIVE'||autoMonitoring);
    if(!shouldProcess){setAutoStatus(!settings.autoCaptureEnabled||settings.autoCaptureMode==='MANUAL'?'Auto Capture OFF':lesson.status==='PAUSED'&&!settings.captureWhilePaused?'Paused':calibrationStatus==='LOADING'?'Loading calibration…':calibrationStatus==='INVALID'?'Calibration invalid':calibrationStatus==='NOT_CALIBRATED'?'Calibration required':'Start camera to monitor');return undefined;}
    let cancelled=false;
    async function refresh(){
      if(previewBusyRef.current)return;previewBusyRef.current=true;
      try{
        const raw=await camera.service.captureFrame(sourceElement(),{encode:false,maxWidth:960});const correctedPlanes=await correctCalibration(raw.canvas,calibration);const corrected=await combineCorrectedPlanes(correctedPlanes);
        if(cancelled)return;
        if(visiblePreviewMode==='LIVE'&&correctedCanvasRef.current){const target=correctedCanvasRef.current;target.width=corrected.width;target.height=corrected.height;target.getContext('2d').drawImage(corrected.canvas,0,0);setCorrectedReady(true);setPreviewError('');}
        if(autoMonitoring)await evaluateAutoCapture(corrected.canvas);
      }catch(err){if(!cancelled&&!/not ready/i.test(err.message||''))setPreviewError(err.message||'Unable to render corrected whiteboard preview.');}
      finally{previewBusyRef.current=false;}
    }
    const warmup=setTimeout(refresh,mode==='BROWSER'?350:0);const timer=setInterval(refresh,1000);
    return()=>{cancelled=true;clearTimeout(warmup);clearInterval(timer);};
  },[camera.status,camera.service,calibration,mode,visiblePreviewMode,autoMonitoring,settings.autoCaptureMode,settings.boardFillSensitivity,settings.minimumContentChangePercent,settings.stabilitySeconds,settings.cooldownSeconds,settings.intervalMinutes,lesson.status]);

  async function undoAutoCapture(){
    const capture=autoToast?.capture;if(!capture)return;
    try{
      await deleteCapture(capture.id);const remaining=captures.filter(item=>item.id!==capture.id);const next=newestFirst(remaining)[0]||null;setCaptures(remaining);setLatestCapture(next);if(latestObjectUrlRef.current){URL.revokeObjectURL(latestObjectUrlRef.current);latestObjectUrlRef.current='';}setLatestLocalPreview(null);setAutoToast(null);clearTimeout(undoTimerRef.current);lastCaptureAtRef.current=next?new Date(next.capturedAt).getTime():Date.now();await seedBaseline(next);setMessage({text:'Automatic whiteboard capture undone.',type:'success'});
    }catch(err){setMessage({text:err.response?.data?.error||'Unable to undo the automatic capture.',type:'error'});}
  }

  const autoModeLabel=settings.autoCaptureMode==='SMART_AUTO'?'Smart':settings.autoCaptureMode==='INTERVAL'?'Interval':'Manual';
  const calibrationLabel=calibrationStatus==='LOADING'?'Calibration Loading':calibrationStatus==='CALIBRATED'?'Calibration Saved':calibrationStatus==='INVALID'?'Calibration Invalid':'Calibration Required';
  const calibrationClass=calibrationStatus==='CALIBRATED'?'text-emerald-600 dark:text-emerald-300':calibrationStatus==='INVALID'?'text-red-600 dark:text-red-300':calibrationStatus==='LOADING'?'text-slate-500 dark:text-slate-400':'text-amber-600 dark:text-amber-300';

  return <div ref={panelRef} className="mt-7 border-t border-slate-200 pt-6 dark:border-white/10">
    <div className="mb-3 flex flex-col justify-between gap-2 sm:flex-row sm:items-end"><div><h2 className="text-lg font-bold text-foreground">Classroom Capture</h2><p className="mt-0.5 text-sm text-muted-foreground">{lesson.status==='CREATED'?'Preview the camera and verify calibration. Captures remain disabled until the session starts.':'Capture the calibrated whiteboard for this lesson.'}</p></div><span className="self-start rounded-full bg-info-subtle px-3 py-1 text-[11px] font-bold text-info">{mode==='SIMULATED'?'Demo Whiteboard • SIMULATED':'Browser Camera'}</span></div>
    {message.text&&<Alert type={message.type} onClose={()=>setMessage({text:'',type:'success'})}>{message.text}</Alert>}{camera.error&&<Alert type="error">{camera.error}</Alert>}
    <Card className="p-4">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><label className="block flex-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Camera Device<Select className="mt-1.5" value={sourceKey} disabled={camera.status==='READY'} onChange={event=>setSourceKey(event.target.value)}>{!camera.devices.length&&<option value="">No camera detected</option>}{camera.devices.map(device=><option key={device.id} value={device.id}>{device.label}</option>)}</Select></label><div className="flex flex-wrap gap-2">{camera.status==='READY'?<Btn variant="secondary" onClick={camera.stop}>Stop Camera</Btn>:<Btn onClick={start}>Start Camera</Btn>}<Btn disabled={!canCapture} loading={loadingCapture} onClick={()=>captureWhiteboard('MANUAL')}>{loadingCapture?'Processing Capture…':<><Camera size={15}/> Capture Whiteboard</>}</Btn></div></div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-slate-50/90 px-3 py-2.5 text-xs font-semibold dark:bg-white/[.04]"><span className={`flex items-center gap-1.5 ${camera.status==='READY'?'text-emerald-600 dark:text-emerald-300':camera.status==='ERROR'?'text-red-600 dark:text-red-300':'text-slate-500 dark:text-slate-400'}`}><Camera size={14}/><span className="h-1.5 w-1.5 rounded-full bg-current"/>Camera {camera.status==='READY'?'Ready':camera.status}</span><span className={`flex items-center gap-1.5 ${calibrationClass}`}><Check size={14}/>{calibrationLabel}</span><LessonLightingStatus lesson={lesson} onStatusChange={setLightingReadiness}/></div>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs"><span className={`rounded-full px-2.5 py-1 font-bold ${autoMonitoring?'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200':'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300'}`}>Auto Capture: {calibrationStatus==='LOADING'?'WAITING':autoMonitoring?'ON':'OFF'} • {autoModeLabel}</span><span className="text-slate-400">{autoStatus}</span></div>
      <div className={visiblePreviewMode==='RAW'?'mt-1':'pointer-events-none fixed -left-[10000px] top-0 h-[360px] w-[640px] overflow-hidden opacity-0'} aria-hidden={visiblePreviewMode!=='RAW'}><CameraPreview {...camera} mode={mode} videoRef={videoRef} canvasRef={canvasRef}/></div>
      {visiblePreviewMode==='LATEST'&&latestCapture&&<div className="calibration-surface relative aspect-video w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 shadow-inner dark:border-white/10">{latestLocalPreview?.captureId===latestCapture.id?<img src={latestLocalPreview.url} alt="Latest corrected whiteboard capture" className="h-full w-full object-contain"/>:<ProtectedCaptureImage url={versionedImageUrl(latestCapture)} alt="Latest corrected whiteboard capture" className="h-full w-full object-contain"/>}<span className="absolute left-3 top-3 rounded-full bg-slate-950/75 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">Latest Corrected Capture</span><span className="absolute right-3 top-3 rounded-full bg-slate-950/75 px-2.5 py-1 text-[10px] font-semibold text-white">{new Date(latestCapture.capturedAt).toLocaleString('en-PH')}</span></div>}
      {visiblePreviewMode==='LIVE'&&<div className="calibration-surface relative aspect-video w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 shadow-inner dark:border-white/10"><canvas ref={correctedCanvasRef} className={`h-full w-full object-contain ${correctedReady?'opacity-100':'opacity-0'}`} aria-label={mode==='SIMULATED'?'Perspective-corrected demo whiteboard preview':'Live perspective-corrected whiteboard preview'}/><span className="absolute left-3 top-3 rounded-full bg-slate-950/75 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">{mode==='SIMULATED'?'Demo Corrected Whiteboard':'Live Corrected Whiteboard'}</span>{camera.status!=='READY'&&<div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-slate-300">{mode==='SIMULATED'?'Start the demo whiteboard preview.':'Start the camera to display the corrected whiteboard.'}</div>}{camera.status==='READY'&&calibrationStatus==='LOADING'&&<div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-slate-300">Loading camera calibration…</div>}{camera.status==='READY'&&calibrationStatus==='NOT_CALIBRATED'&&<div className="absolute inset-0 grid place-items-center px-6 text-center text-sm font-medium text-amber-200">Calibration required for this camera.</div>}{camera.status==='READY'&&calibrationStatus==='INVALID'&&<div className="absolute inset-0 grid place-items-center px-6 text-center text-sm font-medium text-red-200">The saved calibration is invalid.</div>}{camera.status==='READY'&&calibrationStatus==='CALIBRATED'&&calibration&&!correctedReady&&<div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-slate-300">Preparing corrected whiteboard view…</div>}</div>}
      {camera.status==='READY'&&<div className="mt-3 flex flex-wrap justify-end gap-2">{latestCapture&&visiblePreviewMode!=='RAW'&&<Btn variant="ghost" size="sm" onClick={()=>setPreviewMode(visiblePreviewMode==='LATEST'?'LIVE':'LATEST')}>{visiblePreviewMode==='LATEST'?(mode==='SIMULATED'?'Show Demo Whiteboard':'Show Live Corrected Camera'):'Show Latest Capture'}</Btn>}<Btn variant="ghost" size="sm" onClick={()=>{setCorrectedReady(false);setPreviewMode(visiblePreviewMode==='RAW'?(latestCapture?'LATEST':'LIVE'):'RAW')}}>{visiblePreviewMode==='RAW'?(latestCapture?'Show Latest Capture':'Show Corrected Whiteboard'):(mode==='SIMULATED'?'Show Demo Source':'Show Raw Camera')}</Btn></div>}
      {previewError&&<Alert type="error" className="mt-3">{previewError}</Alert>}{lesson.status==='PAUSED'&&!settings.captureWhilePaused&&<Alert type="warning" label="Capture paused" className="mb-0 mt-3">Capture is disabled while the lesson is paused. The camera session remains available for resume.</Alert>}{calibrationStatus==='LOADING'&&<p className="mt-3 text-xs font-medium text-slate-500 dark:text-slate-400">Loading camera calibration…</p>}{['NOT_CALIBRATED','INVALID'].includes(calibrationStatus)&&<Alert type="warning" label="Calibration required" className="mb-0 mt-3" actions={<Btn variant="secondary" size="sm" onClick={openCalibration}>Open Hardware Settings</Btn>}>{calibrationStatus==='INVALID'?'The saved camera calibration is invalid.':'Camera calibration is required.'}</Alert>}<p className="mt-3 text-xs text-slate-500">Last capture: {latestCapture?new Date(latestCapture.capturedAt).toLocaleString('en-PH'):'No captures yet'}</p>
    </Card>
    {captures.length>0&&<div className="mt-5"><h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Recent Lesson Captures</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{captures.slice(0,4).map(capture=><Card key={capture.id} className="overflow-hidden"><ProtectedCaptureImage url={capture.correctedUrl||capture.originalUrl} alt={`Whiteboard captured ${new Date(capture.capturedAt).toLocaleString()}`} className="aspect-video w-full bg-slate-950 object-contain"/><div className="px-3 py-2 text-xs text-slate-500">{new Date(capture.capturedAt).toLocaleString('en-PH')}</div></Card>)}</div></div>}
    {autoToast&&<Alert type="success" label="Capture saved" title="Whiteboard automatically captured" className="!mb-0 fixed bottom-5 right-5 z-40 w-[min(92vw,420px)] shadow-xl" actions={<><Btn variant="ghost" size="sm" onClick={()=>{setPreviewMode('LATEST');panelRef.current?.scrollIntoView({behavior:'smooth',block:'start'});}}>View</Btn><Btn variant="danger" size="sm" onClick={undoAutoCapture}><Trash size={13}/> Undo</Btn></>}>Saved at {autoToast.time.toLocaleTimeString('en-PH')}.</Alert>}
  </div>;
}

