import { useCallback, useRef, useState } from 'react';
import { Alert, Btn, Card, LoadingState } from '../ui';
import { Mic } from '../icons';
import ProtectedAudioPlayer from '../hardware/ProtectedAudioPlayer';
import TranscriptStatusBadge from './TranscriptStatusBadge';
import TranscriptTimeline from './TranscriptTimeline';
import { processLessonTranscription, reprocessLessonTranscription } from '../../services/transcriptionApi';

function failureText(transcription) {
  if (transcription?.failureCode === 'NO_RECOGNIZABLE_SPEECH') return 'No recognizable speech was found in this recording.';
  return 'Audio transcription is unavailable. The recording could not be processed. Retry transcription or continue reviewing the available lesson sources.';
}

export default function TranscriptPanel({ lessonId, data, loading, error, onRefresh }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ text: '', type: 'success' });
  const playerRef = useRef(null);
  const { recording, transcription } = data || {};
  const status = transcription?.status || 'NOT_STARTED';
  const result = transcription?.structuredResult;
  const playerReady = useCallback(element => { playerRef.current = element; }, []);

  async function process() {
    if (busy) return;
    setBusy(true); setMessage({ text: '', type: 'success' });
    try {
      if (transcription) await reprocessLessonTranscription(lessonId); else await processLessonTranscription(lessonId);
      setMessage({ text: transcription ? 'The transcript was queued for reprocessing.' : 'The lesson recording was queued for transcription.', type: 'success' });
      await onRefresh({ quiet: true });
    } catch (requestError) { setMessage({ text: requestError.response?.data?.error || 'Unable to queue audio transcription.', type: 'error' }); }
    finally { setBusy(false); }
  }

  function seek(milliseconds) {
    if (!playerRef.current) return;
    playerRef.current.currentTime = milliseconds / 1000;
    playerRef.current.play().catch(() => {});
  }

  return <section aria-labelledby="audio-transcript-heading">
    <Card className="overflow-hidden">
      <div className="border-b border-slate-200/80 p-4 dark:border-white/10 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between xl:flex-col"><div><p className="text-[11px] font-bold uppercase tracking-[.18em] text-info">Spoken context</p><h2 id="audio-transcript-heading" className="mt-1 text-lg font-bold text-foreground">Audio Transcript</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Protected, timestamped lesson speech.</p></div>{recording&&<Btn variant="secondary" size="sm" className="w-full sm:w-auto xl:w-full" loading={busy} disabled={busy||['PENDING','PROCESSING'].includes(status)} onClick={process}>{status==='FAILED'?'Retry Transcription':transcription?'Reprocess Transcript':'Process Transcript'}</Btn>}</div>
      </div>
      <div className="p-4 sm:p-5">
        {message.text&&<Alert type={message.type} onClose={()=>setMessage({text:''})}>{message.text}</Alert>}
        {error&&<Alert type="error">{error}</Alert>}
        {loading&&!data?<LoadingState text="Loading lesson audio…"/>:!recording?<div className="py-8 text-center"><div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-info-subtle text-info"><Mic size={21}/></div><p className="font-semibold text-foreground">No lesson audio was saved</p><p className="mt-1 text-sm text-muted-foreground">Whiteboard compilation remains available.</p></div>:<>
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold text-slate-500">{Math.round(recording.durationMs/1000)} sec • {(recording.fileSize/1024/1024).toFixed(1)} MB</p><TranscriptStatusBadge status={status}/></div>
          <ProtectedAudioPlayer url={recording.audioUrl} className="mt-4 max-w-full" onPlayerReady={playerReady}/>
          {transcription?.hasPreviousResult&&<Alert type="warning" className="mt-4 mb-0">The previous transcript remains visible while the latest attempt is {status==='FAILED'?'unavailable':'processing'}.</Alert>}
          {['PENDING','PROCESSING'].includes(status)&&!result&&<p className="mt-5 text-sm text-slate-500">Waiting for the transcription worker…</p>}
          {status==='FAILED'&&!result&&<p className="mt-5 text-sm text-red-600 dark:text-red-300">{failureText(transcription)}</p>}
          {result&&<div className="mt-5"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold text-slate-900 dark:text-white">Transcript timeline</h3>{transcription.language&&<span className="text-[11px] text-slate-500">{transcription.language}</span>}</div>{result.timeline?.timingWarning&&<Alert type="warning">{result.timeline.timingWarning}</Alert>}<div className="max-h-[min(62vh,720px)] overflow-y-auto overscroll-contain pr-1"><TranscriptTimeline segments={transcription.segments||result.segments} onSeek={seek}/></div></div>}
        </>}
      </div>
    </Card>
  </section>;
}
