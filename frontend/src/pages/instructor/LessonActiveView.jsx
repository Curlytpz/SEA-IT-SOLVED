import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '../../layouts/DashboardLayout';
import { LoadingState, Alert, Btn, Badge, ConfirmModal, Card } from '../../components/ui';
import LessonEditModal from '../../components/LessonEditModal';
import LessonCapturePanel from '../../components/hardware/LessonCapturePanel';
import LessonAudioPanel from '../../components/hardware/LessonAudioPanel';
import AudioUploadFailureModal from '../../components/hardware/AudioUploadFailureModal';
import MicrophoneStartFailureModal from '../../components/hardware/MicrophoneStartFailureModal';
import useLessonAudioRecording from '../../hooks/useLessonAudioRecording';
import lessonLightingSession from '../../hardware/lighting/lessonLightingSession';
import api from '../../services/api';
import { ArrowLeft, Camera, Check, Lightbulb, Mic, Pause, Pencil, Play, Square } from '../../components/icons';
import { computeLessonTimers } from '../../utils/lessonTimer';

function fmtDuration(ms) {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0
    ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

export default function LessonActiveView() {
  const { lessonId } = useParams();
  const navigate = useNavigate();

  const [lesson, setLesson]       = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [elapsed, setElapsed]     = useState(0);
  const [pausedElapsed, setPausedElapsed] = useState(0);
  const [actionL, setActionL]     = useState('');
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [editing, setEditing]     = useState(false);
  const [audioEndFailure, setAudioEndFailure] = useState(false);
  const [microphoneFailure, setMicrophoneFailure] = useState('');
  const [captureReadiness, setCaptureReadiness] = useState({
    cameraStatus: 'STOPPED',
    cameraMode: 'SIMULATED',
    calibrationStatus: 'LOADING',
    lighting: { status: 'STOPPED', simulated: true },
  });

  const lessonAudio = useLessonAudioRecording(lesson);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/lessons/${lessonId}`);
      setLesson(data.data.lesson);
    } catch(err) { setError(err.response?.data?.error||'Failed to load lesson.'); }
    finally { setLoading(false); }
  }, [lessonId]);

  useEffect(() => { load(); }, [load]);

  async function leaveSession() {
    if (lesson?.status === 'CREATED') {
      await Promise.allSettled([
        lessonAudio.leavePreparation(),
        lessonLightingSession.stopPreview(),
      ]);
    }
    navigate(`/instructor/sections/${lesson?.sectionId}`);
  }

  async function startRecordingSession({ withoutAudio = false } = {}) {
    if (actionL || lesson?.status !== 'CREATED') return;
    setActionL('start');
    setError('');

    try {
      if (withoutAudio) {
        await lessonAudio.continueWithoutAudio();
      } else {
        await lessonAudio.startRecordingForLesson();
      }
    } catch (err) {
      if (withoutAudio) {
        setError(err.message || 'The recording session could not start. Your lesson is still ready to start.');
      } else {
        setMicrophoneFailure(err.message || 'The microphone could not start.');
      }
      setActionL('');
      return;
    }

    try {
      const { data } = await api.patch(`/lessons/${lessonId}/start`);
      setLesson(current=>({...current,...data.data.lesson}));
      setMicrophoneFailure('');
    } catch (err) {
      if (withoutAudio) await lessonAudio.leavePreparation().catch(()=>{});
      else await lessonAudio.rollbackStart().catch(()=>{});
      setError(err.response?.data?.error || 'The recording session could not start. Your lesson is still ready to start.');
    } finally {
      setActionL('');
    }
  }

  // Timer — re-calculates from server timestamps every second
  useEffect(() => {
    if (!lesson) return;
    const tick = () => {
        const timers = computeLessonTimers(lesson);
        setElapsed(timers.elapsedMs);
        setPausedElapsed(timers.pausedMs);
    };
    tick();
    if (!['ACTIVE', 'PAUSED'].includes(lesson.status)) return undefined;
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [lesson]);

  async function doAction(action) {
    setActionL(action);
    let recorderPaused = false;
    try {
      if (action === 'pause') recorderPaused = lessonAudio.pauseForLesson();
      const { data } = await api.patch(`/lessons/${lessonId}/${action}`);
      setLesson(data.data.lesson);
      if (action === 'resume') lessonAudio.resumeForLesson();
    } catch(err) {
      if (action === 'pause' && recorderPaused) lessonAudio.resumeForLesson();
      const fallback = {
        pause: 'Unable to pause this lesson. Please try again.',
        resume: 'Unable to resume this lesson. Please try again.',
      };
      setError(err.response?.data?.error || fallback[action] || 'Unable to update this lesson. Please try again.');
    } finally {
      setActionL('');
    }
  }

  async function finishLesson({ withoutAudio = false } = {}) {
    setActionL('end');
    setAudioEndFailure(false);
    if (withoutAudio) {
      await lessonAudio.discardForEnd();
    } else {
      try {
        await lessonAudio.finalizeForEnd();
      } catch (err) {
        if (err.audioSaveFailure) {
          setAudioEndFailure(true);
          setActionL('');
          return;
        }
        setError(err.message || 'Unable to finalize the lesson recording.');
        setActionL('');
        return;
      }
    }

    try {
      const { data } = await api.patch(`/lessons/${lessonId}/end`);
      await lessonLightingSession.endLesson().catch(()=>{});
      setLesson(data.data.lesson);
      navigate(`/instructor/sections/${lesson.sectionId}`, {
        replace:true,
        state:withoutAudio ? { warning:'Lesson completed without saving its audio recording.' } : undefined,
      });
    } catch(err) {
      setError(err.response?.data?.error || 'Unable to end this lesson. Please try again.');
    } finally {
      setActionL('');
    }
  }

  if (loading) return <DashboardLayout><LoadingState /></DashboardLayout>;

  const preparingSession = lesson?.status === 'CREATED';
  const microphoneState = lessonAudio.status === 'READY'
    ? { label: `Connected${lessonAudio.mode === 'SIMULATED' ? ' · SIMULATED' : ''}`, ready: true }
    : ['LOADING', 'STARTING'].includes(lessonAudio.status)
      ? { label: 'Checking…', ready: false }
      : lessonAudio.status === 'SKIPPED'
        ? { label: 'Audio will be skipped', ready: false }
        : { label: 'Needs attention', ready: false };
  const cameraState = captureReadiness.cameraStatus === 'READY'
    ? { label: `Preview ready${captureReadiness.cameraMode === 'SIMULATED' ? ' · SIMULATED' : ''}`, ready: true }
    : captureReadiness.cameraStatus === 'ERROR'
      ? { label: 'Needs attention', ready: false }
      : { label: 'Start preview below', ready: false };
  const calibrationState = captureReadiness.calibrationStatus === 'CALIBRATED'
    ? { label: 'Saved calibration ready', ready: true }
    : captureReadiness.calibrationStatus === 'LOADING'
      ? { label: 'Checking…', ready: false }
      : { label: 'Needs attention', ready: false };
  const lightingState = captureReadiness.lighting?.status === 'READY'
    ? { label: `Monitoring${captureReadiness.lighting.simulated ? ' · SIMULATED' : ''}`, ready: true }
    : captureReadiness.lighting?.status === 'ERROR'
      ? { label: 'Needs attention', ready: false }
      : { label: 'Checking…', ready: false };
  const readinessItems = [
    { label: 'Microphone', icon: Mic, state: microphoneState },
    { label: 'Camera', icon: Camera, state: cameraState },
    { label: 'Calibration', icon: Check, state: calibrationState },
    { label: 'Lighting', icon: Lightbulb, state: lightingState },
  ];

  return (
    <DashboardLayout>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Btn variant="ghost" size="sm" onClick={leaveSession}>
          <ArrowLeft size={15}/> Back to Section
        </Btn>
        <Btn variant="secondary" size="sm" onClick={()=>setEditing(true)}>
          <Pencil size={14}/> Edit Lesson
        </Btn>
      </div>
      {error && <Alert type="error" onClose={()=>setError('')}>{error}</Alert>}

      <div className="max-w-5xl">
        <Card className="mb-6 p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2.5">
                {preparingSession
                  ? <span className="rounded-full bg-primary-subtle px-2.5 py-1 text-xs font-bold text-primary-subtle-foreground">READY TO START</span>
                  : <Badge status={lesson?.status} />}
                {lesson?.status==='ACTIVE' && <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-300"><span className="pulse-dot inline-block h-2 w-2 rounded-full bg-emerald-500"/>LIVE</span>}
                {lesson?.status==='PAUSED' && <span className="text-xs font-semibold text-amber-600 dark:text-amber-300">Timer paused</span>}
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">{lesson?.title}</h1>
              <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-300">{lesson?.subjectCode} — {lesson?.subjectName} <span className="mx-1.5 text-slate-300 dark:text-slate-600">•</span> {lesson?.sectionName}</p>
              {lesson?.topic&&<p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{lesson.topic}</p>}
            </div>
            <div className="shrink-0 sm:text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{preparingSession?'Session Time':lesson?.status==='COMPLETED'?'Net Duration':'Elapsed'}</p>
              <p className={`mt-1 font-mono text-3xl font-bold ${lesson?.status==='PAUSED'?'text-amber-600 dark:text-amber-300':lesson?.status==='ACTIVE'?'text-emerald-600 dark:text-emerald-300':'text-slate-700 dark:text-slate-200'}`}>{fmtDuration(elapsed)}</p>
              <p className="mt-1 text-xs text-slate-400">{preparingSession?'Recording has not started.':<>Started {lesson?.startedAt?new Date(lesson.startedAt).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'}):'—'}{pausedElapsed>0?` • Paused ${fmtDuration(pausedElapsed)}`:''}</>}</p>
            </div>
          </div>
          {preparingSession&&<div className="mt-5 border-t border-slate-200/80 pt-4 dark:border-white/10">
            <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">Verify the classroom hardware below. Monitoring and previews are available, but no lesson audio, timer, or whiteboard capture starts until you confirm.</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Session readiness">
              {readinessItems.map(({label,icon:Icon,state})=><div key={label} className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3 dark:border-white/10 dark:bg-white/[.04]"><div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-white"><Icon size={15}/>{label}</div><p className={`mt-1.5 text-xs font-medium ${state.ready?'text-emerald-600 dark:text-emerald-300':'text-slate-500 dark:text-slate-400'}`}>{state.label}</p></div>)}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Btn variant="success" loading={actionL==='start'} loadingText="Starting recording session" onClick={()=>startRecordingSession()}><Play size={15}/> Start Recording Session</Btn>
              <span className="text-xs text-slate-500 dark:text-slate-400">This action starts the authoritative lesson timer and audio recording together.</span>
            </div>
          </div>}
          {['ACTIVE','PAUSED'].includes(lesson?.status)&&<div className="mt-5 flex flex-wrap gap-3 border-t border-slate-200/80 pt-4 dark:border-white/10">
            {lesson.status==='ACTIVE'?<Btn variant="warning" loading={actionL==='pause'} onClick={()=>doAction('pause')}><Pause size={15}/> Pause Lesson</Btn>:<Btn variant="success" loading={actionL==='resume'} onClick={()=>doAction('resume')}><Play size={15}/> Resume Lesson</Btn>}
            <Btn variant="danger" onClick={()=>setConfirmEnd(true)}><Square size={14}/> End Lesson</Btn>
          </div>}
        </Card>
      </div>
      {lesson && <LessonAudioPanel lesson={lesson} audio={lessonAudio}/>}

      {lesson && <LessonCapturePanel lesson={lesson} onReadinessChange={setCaptureReadiness}/>} 

      {confirmEnd && (
        <ConfirmModal
          title="End this lesson?"
          body="Once ended, this lesson will be marked as completed and cannot be restarted."
          confirmLabel="End Lesson" confirmVariant="danger"
          loading={actionL==='end'}
          onConfirm={()=>{ setConfirmEnd(false); finishLesson(); }}
          onCancel={()=>setConfirmEnd(false)}
        />
      )}
      {audioEndFailure && (
        <AudioUploadFailureModal
          loading={actionL==='end'}
          onRetry={()=>finishLesson()}
          onEndWithoutAudio={()=>finishLesson({withoutAudio:true})}
          onCancel={()=>setAudioEndFailure(false)}
        />
      )}
      {microphoneFailure && (
        <MicrophoneStartFailureModal
          message={microphoneFailure}
          loading={actionL==='start'}
          onRetry={()=>startRecordingSession()}
          onContinue={()=>startRecordingSession({withoutAudio:true})}
          onCancel={()=>setMicrophoneFailure('')}
        />
      )}
      {editing && (
        <LessonEditModal
          lesson={lesson}
          onClose={()=>setEditing(false)}
          onSaved={updated=>{ setLesson(current=>({...current,...updated})); setEditing(false); }}
        />
      )}
    </DashboardLayout>
  );
}
