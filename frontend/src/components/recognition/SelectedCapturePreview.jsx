import { Btn, Card, Spinner } from '../ui';
import { Scan } from '../icons';
import ProtectedCaptureImage from '../hardware/ProtectedCaptureImage';
import RecognitionStatusBadge from './RecognitionStatusBadge';
import { captureRecognitionStatus, isRecognitionRetryable } from './recognitionStatus';

export default function SelectedCapturePreview({ item, pageNumber, lessonRecognition, onOpen, onRetry, retrying = false, retryError = '' }) {
  if(!item)return null;
  const status=captureRecognitionStatus(item,lessonRecognition);
  const canRetry=isRecognitionRetryable(status);
  return <section className="mt-5" aria-labelledby="selected-capture-title">
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-slate-200/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-white/10">
        <div><h2 id="selected-capture-title" className="text-sm font-bold text-slate-900 dark:text-white">Page {pageNumber} Preview</h2><p className="mt-0.5 text-xs text-slate-500">Captured {new Date(item.capture.capturedAt).toLocaleString('en-PH',{dateStyle:'medium',timeStyle:'short'})}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <RecognitionStatusBadge status={retrying ? 'RETRYING' : status}/>
          {(canRetry || retrying) && <Btn size="sm" variant="secondary" disabled={retrying} onClick={onRetry}>
            {retrying ? <><Spinner/> Processing…</> : <><Scan size={14}/> Retry Recognition</>}
          </Btn>}
        </div>
      </div>
      {retryError && <p role="alert" className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs font-medium text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-300">{retryError}</p>}
      <button type="button" onClick={onOpen} aria-label={`Open page ${pageNumber} in full-size viewer`} key={item.capture.id} className="content-transition group block w-full bg-sidebar p-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:p-3"><ProtectedCaptureImage url={item.capture.correctedUrl||item.capture.originalUrl} alt={`Selected whiteboard page ${pageNumber}`} className="mx-auto max-h-[min(62vh,620px)] w-full rounded-xl object-contain transition-transform duration-200 group-hover:scale-[1.005]"/><span className="mt-2 block text-center text-[11px] font-semibold text-slate-400">Click image to inspect full size</span></button>
    </Card>
  </section>;
}
