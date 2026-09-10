import ProtectedCaptureImage from '../hardware/ProtectedCaptureImage';
import RecognitionStatusBadge from './RecognitionStatusBadge';

function pageStatus(item, lessonRecognition) {
  if (lessonRecognition?.status) return lessonRecognition.status;
  return item.recognition?.status || 'NOT_STARTED';
}

export default function CaptureAlbum({ items, selectedId, onSelect, lessonRecognition }) {
  return <section aria-labelledby="capture-album-title">
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div><h2 id="capture-album-title" className="text-lg font-bold text-slate-900 dark:text-white">Capture Album</h2><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Whiteboard pages remain in capture order.</p></div>
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-white/[.07] dark:text-slate-300">{items.length} {items.length===1?'page':'pages'}</span>
    </div>
    <div className="grid auto-cols-[minmax(145px,68vw)] grid-flow-col gap-3 overflow-x-auto pb-2 snap-x snap-mandatory sm:auto-cols-[190px] lg:auto-cols-auto lg:grid-flow-row lg:grid-cols-3 lg:overflow-visible xl:grid-cols-4">
      {items.map((item,index)=>{
        const selected=item.capture.id===selectedId;
        return <button key={item.capture.id} type="button" onClick={()=>onSelect(item.capture.id)} aria-pressed={selected} className={`group min-w-0 snap-start overflow-hidden rounded-2xl border text-left transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected?'border-primary bg-primary-subtle shadow-glow':'border-border bg-card/55 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md'}`}>
          <div className="aspect-video overflow-hidden bg-slate-950"><ProtectedCaptureImage url={item.capture.correctedUrl||item.capture.originalUrl} alt={`Page ${index+1} whiteboard thumbnail`} className="h-full w-full object-contain transition-transform duration-200 group-hover:scale-[1.02]"/></div>
          <div className="p-2.5"><div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-slate-800 dark:text-white">Page {index+1}</span><RecognitionStatusBadge status={pageStatus(item,lessonRecognition)}/></div><p className="mt-1 truncate text-[10px] text-slate-400">{new Date(item.capture.capturedAt).toLocaleTimeString('en-PH',{hour:'numeric',minute:'2-digit'})}</p></div>
        </button>;
      })}
    </div>
  </section>;
}
