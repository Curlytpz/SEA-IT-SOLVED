import { useCallback, useEffect, useRef, useState } from 'react';
import { Btn, Card, ConfirmModal } from '../ui';
import { Plus, Trash } from '../icons';
import ProtectedCaptureImage from '../hardware/ProtectedCaptureImage';
import ImageLightbox from './ImageLightbox';
import PdfViewer from './PdfViewer';
import { deleteLessonMaterial, listLessonMaterials, reprocessLessonMaterial, uploadLessonMaterial } from '../../services/lessonMaterialApi';

function statusStyle(status) {
  if (status === 'APPROVED' || status === 'REVIEW_REQUIRED') return 'text-emerald-600 dark:text-emerald-300';
  if (status === 'FAILED') return 'text-red-600 dark:text-red-300';
  return 'text-amber-600 dark:text-amber-300';
}

export default function AdditionalLessonMaterials({ lessonId, onMessage, onStatusChange }) {
  const imageInput = useRef(null);
  const pdfInput = useRef(null);
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const next = await listLessonMaterials(lessonId);
      setItems(next);
      onStatusChange?.(next);
    } catch (error) { onMessage?.({ type: 'error', text: error.response?.data?.error || 'Unable to load lesson materials.' }); }
  }, [lessonId, onMessage, onStatusChange]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!items.some(item => ['UPLOADED', 'PROCESSING'].includes(item.status))) return undefined;
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [items, refresh]);

  async function upload(file) {
    if (!file || busy) return;
    setBusy(true);
    try {
      await uploadLessonMaterial(lessonId, file);
      onMessage?.({ type: 'success', text: `${file.name} was uploaded and queued for protected processing.` });
      await refresh();
    } catch (error) { onMessage?.({ type: 'error', text: error.response?.data?.error || 'Unable to upload this lesson material.' }); }
    finally { setBusy(false); if (imageInput.current) imageInput.current.value = ''; if (pdfInput.current) pdfInput.current.value = ''; }
  }

  async function remove() {
    if (!deleting || busy) return;
    setBusy(true);
    try { await deleteLessonMaterial(deleting.id); setDeleting(null); setViewer(null); await refresh(); onMessage?.({ type: 'success', text: 'Lesson material deleted.' }); }
    catch (error) { onMessage?.({ type: 'error', text: error.response?.data?.error || 'Unable to delete this material.' }); }
    finally { setBusy(false); }
  }

  async function retry(item) {
    setBusy(true);
    try { await reprocessLessonMaterial(item.id); await refresh(); }
    catch (error) { onMessage?.({ type: 'error', text: error.response?.data?.error || 'Unable to reprocess this material.' }); }
    finally { setBusy(false); }
  }

  return <Card className="mt-5 p-4 sm:p-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
      <div><h2 className="font-black text-slate-900 dark:text-white">Additional Lesson Materials</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Add supporting images or PDF materials that should be included in this lesson.</p></div>
      <div className="flex flex-wrap gap-2">
        <input ref={imageInput} hidden type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={event => upload(event.target.files?.[0])}/>
        <input ref={pdfInput} hidden type="file" accept=".pdf,application/pdf" onChange={event => upload(event.target.files?.[0])}/>
        <Btn size="sm" disabled={busy} onClick={() => imageInput.current?.click()}><Plus size={15}/> Upload Image</Btn>
        <Btn size="sm" variant="secondary" disabled={busy} onClick={() => pdfInput.current?.click()}><Plus size={15}/> Upload PDF</Btn>
      </div>
    </div>
    {!items.length ? <p className="mt-5 rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">Optional — no supporting materials uploaded.</p> :
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {items.map(item => <div key={item.id} className="flex min-w-0 gap-3 rounded-xl border border-slate-200/80 bg-white/55 p-3 dark:border-white/10 dark:bg-white/[.035]">
          <button type="button" onClick={() => setViewer(item)} className="grid h-20 w-24 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-950 text-xs font-black text-white">
            {item.materialType === 'IMAGE' ? <ProtectedCaptureImage url={item.fileUrl} alt={item.originalFilename} className="h-full w-full object-cover"/> : <span>PDF<br/>{item.pageCount} pages</span>}
          </button>
          <div className="min-w-0 flex-1"><button type="button" onClick={() => setViewer(item)} className="block max-w-full truncate text-left text-sm font-bold text-foreground hover:text-primary">{item.originalFilename}</button><p className="mt-1 text-xs text-muted-foreground">{item.materialType === 'PDF' ? `PDF • ${item.pageCount} pages` : 'Image'}</p><p className={`mt-1 text-xs font-bold ${statusStyle(item.status)}`}>{item.status.replaceAll('_', ' ')}</p>{item.status === 'FAILED' && <button type="button" disabled={busy} onClick={() => retry(item)} className="mt-1 text-xs font-bold text-primary">Retry</button>}</div>
          <button type="button" aria-label={`Delete ${item.originalFilename}`} onClick={() => setDeleting(item)} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"><Trash size={16}/></button>
        </div>)}
      </div>}
    <ImageLightbox open={viewer?.materialType === 'IMAGE'} onClose={() => setViewer(null)} title="Uploaded Image" subtitle={viewer?.originalFilename} protectedUrl={viewer?.fileUrl} alt={viewer?.originalFilename}/>
    <PdfViewer open={viewer?.materialType === 'PDF'} onClose={() => setViewer(null)} material={viewer}/>
    {deleting && <ConfirmModal title="Delete lesson material?" body={`Delete ${deleting.originalFilename}? Its protected file and derived extraction will be removed.`} confirmLabel="Delete Material" loading={busy} onCancel={() => setDeleting(null)} onConfirm={remove}/>}
  </Card>;
}
