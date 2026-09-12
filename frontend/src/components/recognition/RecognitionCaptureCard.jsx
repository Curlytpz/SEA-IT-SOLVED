import { useMemo } from 'react';
import ProtectedCaptureImage from '../hardware/ProtectedCaptureImage';
import { Alert, Btn, Card } from '../ui';
import MathExpression from './MathExpression';
import RecognitionStatusBadge from './RecognitionStatusBadge';
import UncertaintyBadge from './UncertaintyBadge';
import GeneratedContent from '../reasoning/GeneratedContent';

function friendlyFailure(recognition) {
  if (recognition?.failureCode === 'NO_RECOGNIZABLE_CONTENT') return 'No recognizable whiteboard content was found.';
  if (recognition?.failureCode === 'IMAGE_NOT_FOUND') return 'The saved whiteboard image is unavailable.';
  if (recognition?.failureCode === 'UNSUPPORTED_INPUT') return 'This image could not be processed.';
  if (recognition?.failureCode === 'PROVIDER_BLOCKED') return 'The recognition provider could not process this image.';
  if (recognition?.failureCode === 'PROVIDER_REQUEST_INVALID') return 'The recognition service could not accept this request. Check the worker configuration and retry.';
  return recognition?.failureMessage || 'Recognition failed. You can try again.';
}

export default function RecognitionCaptureCard({ item, busy, onReprocess }) {
  const { capture, recognition } = item;
  const status = recognition?.status || 'NOT_STARTED';
  const result = recognition?.structuredResult;
  const blocks = result?.blocks || [];
  const uncertainty = useMemo(() => blocks.filter(block => block.uncertain), [blocks]);
  const imageUrl = capture.correctedUrl || capture.originalUrl;

  return (
    <Card className="overflow-hidden">
      <div className="grid lg:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.1fr)]">
        <div className="border-b border-slate-200/80 bg-slate-950 p-3 dark:border-white/10 lg:border-b-0 lg:border-r">
          <ProtectedCaptureImage url={imageUrl} alt={`Whiteboard captured ${new Date(capture.capturedAt).toLocaleString()}`} className="max-h-[420px] w-full rounded-xl object-contain" />
        </div>
        <div className="min-w-0 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Whiteboard capture</p>
              <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
                {new Date(capture.capturedAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            </div>
            <RecognitionStatusBadge status={status} />
          </div>

          {recognition?.hasPreviousResult && <Alert type="warning" label="Recognition status" className="mb-0 mt-4">The previous successful transcription remains visible while this newer attempt is {status === 'FAILED' ? 'unavailable' : 'processing'}.</Alert>}

          {!recognition && <p className="mt-5 text-sm text-slate-500">This capture has not been processed yet.</p>}
          {['PENDING', 'PROCESSING'].includes(status) && !result && <p className="mt-5 text-sm text-slate-500">The whiteboard is being prepared for transcription.</p>}
          {status === 'FAILED' && !result && <Alert type="error" label="Recognition failed" className="mb-0 mt-5">{friendlyFailure(recognition)}</Alert>}

          {result && (
            <div className="mt-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Recognized content</h3>
              {blocks.length ? blocks.map((block, index) => (
                <div key={`${block.order}-${index}`} className="rounded-xl border border-slate-200/80 bg-white/60 p-3 dark:border-white/10 dark:bg-white/[.035]">
                  {block.type === 'math'
                    ? <MathExpression latex={block.latex} />
                    : <GeneratedContent markdown={block.text} className="recognition-math-content text-sm leading-6 text-slate-700 dark:text-slate-200" reviewIndicator mathFallback/>}
                  {block.uncertain && <div className="mt-2"><UncertaintyBadge reason={block.uncertaintyReason} /></div>}
                </div>
              )) : <GeneratedContent markdown={recognition.plainText} className="recognition-math-content text-sm leading-6 text-slate-700 dark:text-slate-200" reviewIndicator mathFallback/>}
              {(uncertainty.length > 0 || result.warnings?.length > 0) && <Alert type="warning" label="Review needed" title="Check highlighted content against the whiteboard image" className="mb-0">{result.warnings?.map((warning, index) => <div key={index}>{warning}</div>)}</Alert>}
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <Btn variant="secondary" size="sm" loading={busy} disabled={busy || ['PENDING', 'PROCESSING'].includes(status)} onClick={() => onReprocess(capture.id)}>
              {recognition ? 'Reprocess' : 'Process Capture'}
            </Btn>
          </div>
        </div>
      </div>
    </Card>
  );
}
