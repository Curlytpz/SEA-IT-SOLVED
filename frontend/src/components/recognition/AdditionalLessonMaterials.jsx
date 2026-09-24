import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Image as ImageIcon, RotateCcw, Upload } from 'lucide-react';
import { Btn, Card, ConfirmModal } from '../ui';
import { Trash } from '../icons';
import ProtectedCaptureImage from '../hardware/ProtectedCaptureImage';
import ImageLightbox from './ImageLightbox';
import PdfViewer from './PdfViewer';
import { deleteLessonMaterial, listLessonMaterials, reprocessLessonMaterial, uploadLessonMaterial } from '../../services/lessonMaterialApi';

const ACCEPTED_FILES = '.jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf';
const READY_STATUSES = new Set(['APPROVED', 'REVIEW_REQUIRED']);

function supportedFile(file) {
  const type = String(file?.type || '').toLowerCase();
  const name = String(file?.name || '').toLowerCase();
  return ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(type)
    || /\.(?:jpe?g|png|webp|pdf)$/.test(name);
}

function pageHasContent(page) {
  return hasUsableRecognizedText(page?.text)
    || (Array.isArray(page?.mathExpressions) && page.mathExpressions.length > 0);
}

function hasUsableRecognizedText(value) {
  const characters = Array.from(String(value || '')).filter(character => !/\s/u.test(character));
  if (characters.length < 2) return false;
  const suspicious = characters.filter(character => {
    const codePoint = character.codePointAt(0);
    return codePoint === 0xfffd
      || (codePoint >= 0xe000 && codePoint <= 0xf8ff)
      || (codePoint >= 0xf0000 && codePoint <= 0xffffd)
      || (codePoint >= 0x100000 && codePoint <= 0x10fffd)
      || codePoint < 0x20;
  }).length;
  return suspicious / characters.length <= 0.15;
}

function hasRecognizedContent(item) {
  if (hasUsableRecognizedText(item?.result?.plainText)) return true;
  if (Array.isArray(item?.result?.mathExpressions) && item.result.mathExpressions.length > 0) return true;
  return Array.isArray(item?.result?.pages) && item.result.pages.some(pageHasContent);
}

function statusPresentation(item) {
  const expectedPages = item.materialType === 'PDF' ? Math.max(0, Number(item.pageCount) || 0) : 1;
  const recognizedPageNumbers = new Set(
    (Array.isArray(item.result?.pages) ? item.result.pages : [])
      .filter(pageHasContent)
      .map(page => Number(page?.pageNumber))
      .filter(number => Number.isInteger(number) && number > 0 && number <= expectedPages)
  );
  const recognizedPages = item.materialType === 'PDF'
    ? recognizedPageNumbers.size
    : (hasRecognizedContent(item) ? 1 : 0);
  const completedByBackend = READY_STATUSES.has(item.status);
  const complete = completedByBackend && expectedPages > 0 && recognizedPages === expectedPages;
  const pageLabel = `${expectedPages} ${expectedPages === 1 ? 'page' : 'pages'}`;

  if (item.status === 'UPLOADED') return {
    label: 'Queued for recognition',
    message: `Waiting to scan and recognize ${pageLabel}.`,
    tone: 'text-warning-subtle-foreground dark:text-warning-subtle-foreground',
    canRetry: false,
  };
  if (item.status === 'PROCESSING') return {
    label: 'Processing',
    message: `Scanning and recognizing ${pageLabel}…`,
    tone: 'text-warning-subtle-foreground dark:text-warning-subtle-foreground',
    canRetry: false,
  };
  if (complete) return {
    label: 'Recognized successfully',
    message: item.materialType === 'PDF'
      ? `${recognizedPages} ${recognizedPages === 1 ? 'page' : 'pages'} recognized and ready for review.`
      : 'Image content recognized and ready for review.',
    tone: 'text-success-subtle-foreground dark:text-success-subtle-foreground',
    canRetry: false,
  };
  if (item.status === 'FAILED') return {
    label: 'Recognition needs attention',
    message: `Recognition failed. ${item.failureMessage || 'The protected original is still available to reprocess.'}`,
    tone: 'text-destructive-subtle-foreground dark:text-destructive-subtle-foreground',
    canRetry: true,
  };
  if (completedByBackend) return {
    label: 'Recognition needs attention',
    message: item.materialType === 'PDF'
      ? `${recognizedPages} of ${expectedPages} pages produced usable content. Reprocess this PDF to scan the missing pages.`
      : 'Recognition completed without usable content. Reprocess this image.',
    tone: 'text-destructive-subtle-foreground dark:text-destructive-subtle-foreground',
    canRetry: true,
  };
  return {
    label: 'Recognition failed',
    message: item.failureMessage || 'The file could not be recognized.',
    tone: 'text-destructive-subtle-foreground dark:text-destructive-subtle-foreground',
    canRetry: true,
  };
}

export default function AdditionalLessonMaterials({ lessonId, onMessage, onStatusChange }) {
  const imageInput = useRef(null);
  const pdfInput = useRef(null);
  const mixedInput = useRef(null);
  const dragDepth = useRef(0);
  const requestRef = useRef(null);
  const activeRef = useRef(false);
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [viewer, setViewer] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const refresh = useCallback(async () => {
    if (requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const next = await listLessonMaterials(lessonId, { signal: controller.signal });
      if (activeRef.current) {
        setItems(next);
        onStatusChange?.(next);
      }
    } catch (error) {
      if (activeRef.current && error.code !== 'ERR_CANCELED') onMessage?.({ type: 'error', text: error.response?.data?.error || 'Unable to load lesson materials.' });
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }, [lessonId, onMessage, onStatusChange]);

  useEffect(() => {
    activeRef.current = true;
    refresh();
    return () => { activeRef.current = false; requestRef.current?.abort(); requestRef.current = null; };
  }, [refresh]);

  useEffect(() => {
    if (!items.some(item => ['UPLOADED', 'PROCESSING'].includes(item.status))) return undefined;
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [items, refresh]);

  async function uploadFiles(fileList) {
    if (busy) return;
    const selected = Array.from(fileList || []);
    const files = selected.filter(supportedFile);
    const rejected = selected.filter(file => !supportedFile(file));
    if (!files.length) {
      onMessage?.({ type: 'error', text: 'Choose JPG, PNG, WebP, or PDF files.' });
      return;
    }

    setBusy(true);
    const uploaded = [];
    const failed = [];
    try {
      for (const file of files) {
        try {
          await uploadLessonMaterial(lessonId, file);
          uploaded.push(file.name);
        } catch (error) {
          failed.push(`${file.name}: ${error.response?.data?.error || 'upload failed'}`);
        }
      }
      await refresh();
      if (failed.length || rejected.length) {
        const ignored = rejected.length ? ` ${rejected.length} unsupported ${rejected.length === 1 ? 'file was' : 'files were'} ignored.` : '';
        onMessage?.({ type: 'error', text: `${uploaded.length ? `${uploaded.length} ${uploaded.length === 1 ? 'file was' : 'files were'} uploaded. ` : ''}${failed.join(' ')}${ignored}`.trim() });
      } else {
        onMessage?.({ type: 'success', text: `${uploaded.length} ${uploaded.length === 1 ? 'file was' : 'files were'} uploaded and queued for recognition.` });
      }
    } finally {
      setBusy(false);
      if (imageInput.current) imageInput.current.value = '';
      if (pdfInput.current) pdfInput.current.value = '';
      if (mixedInput.current) mixedInput.current.value = '';
    }
  }

  async function remove() {
    if (!deleting || busy) return;
    setBusy(true);
    try {
      await deleteLessonMaterial(deleting.id);
      setDeleting(null);
      setViewer(null);
      await refresh();
      onMessage?.({ type: 'success', text: 'Lesson material deleted.' });
    } catch (error) {
      onMessage?.({ type: 'error', text: error.response?.data?.error || 'Unable to delete this material.' });
    } finally { setBusy(false); }
  }

  async function retry(item) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await reprocessLessonMaterial(item.id);
      setItems(current => current.map(currentItem => currentItem.id === item.id
        ? { ...currentItem, ...(result.material || {}), result: null, failureCode: null, failureMessage: null }
        : currentItem));
      await refresh();
      onMessage?.({ type: 'success', text: result.queued === false ? `${item.originalFilename} is already being processed.` : `${item.originalFilename} was queued for recognition again.` });
    } catch (error) {
      onMessage?.({ type: 'error', text: error.response?.data?.error || 'Unable to reprocess this material.' });
    } finally { setBusy(false); }
  }

  function beginDrag(event) {
    event.preventDefault();
    event.stopPropagation();
    if (busy || !event.dataTransfer?.types?.includes('Files')) return;
    dragDepth.current += 1;
    setDragActive(true);
  }

  function continueDrag(event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = busy ? 'none' : 'copy';
  }

  function endDrag(event) {
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (!dragDepth.current) setDragActive(false);
  }

  function dropFiles(event) {
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current = 0;
    setDragActive(false);
    if (!busy) uploadFiles(event.dataTransfer?.files);
  }

  return <Card className="mt-5 p-4 sm:p-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
      <div><h2 className="font-black text-foreground dark:text-foreground">Additional Lesson Materials</h2><p className="mt-1 text-xs text-muted-foreground dark:text-muted-foreground">Add supporting images or PDF materials. Their recognized content will be included in lesson review.</p></div>
      <div className="flex flex-wrap gap-2">
        <input ref={imageInput} hidden multiple type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={event => uploadFiles(event.target.files)}/>
        <input ref={pdfInput} hidden multiple type="file" accept=".pdf,application/pdf" onChange={event => uploadFiles(event.target.files)}/>
        <Btn size="sm" disabled={busy} onClick={() => imageInput.current?.click()}><ImageIcon size={15}/> Upload Images</Btn>
        <Btn size="sm" variant="secondary" disabled={busy} onClick={() => pdfInput.current?.click()}><FileText size={15}/> Upload PDFs</Btn>
      </div>
    </div>

    <div
      role="button"
      tabIndex={busy ? -1 : 0}
      aria-disabled={busy}
      aria-label="Upload lesson PDF or image files"
      onClick={() => { if (!busy) mixedInput.current?.click(); }}
      onKeyDown={event => { if (!busy && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); mixedInput.current?.click(); } }}
      onDragEnter={beginDrag}
      onDragOver={continueDrag}
      onDragLeave={endDrag}
      onDrop={dropFiles}
      className={`mt-4 flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 text-center outline-none transition-[border-color,background-color,box-shadow,transform] duration-200 focus-visible:ring-2 focus-visible:ring-ring ${dragActive ? 'scale-[1.005] border-primary bg-primary-subtle shadow-sm' : 'border-border bg-surface-subtle/45 hover:border-primary/45 hover:bg-primary-subtle/35'} ${busy ? 'pointer-events-none opacity-60' : ''}`}
    >
      <input ref={mixedInput} hidden multiple type="file" accept={ACCEPTED_FILES} onChange={event => uploadFiles(event.target.files)}/>
      <span className="grid h-10 w-10 place-items-center rounded-full bg-primary-subtle text-primary-subtle-foreground"><Upload size={19}/></span>
      <div><p className="text-sm font-bold text-foreground">{busy ? 'Uploading lesson materials…' : dragActive ? 'Drop files to upload' : 'Drag and drop PDFs or images here'}</p><p className="mt-1 text-xs text-muted-foreground">or click to choose multiple JPG, PNG, WebP, and PDF files</p></div>
    </div>

    {!items.length ? <p className="mt-4 text-center text-sm text-muted-foreground">Optional — no supporting materials uploaded.</p> :
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {items.map(item => {
          const status = statusPresentation(item);
          return <div key={item.id} className="flex min-w-0 gap-3 rounded-xl border border-border/80 bg-card/55 p-3 dark:border-border dark:bg-card/[.035]">
            <button type="button" onClick={() => setViewer(item)} className="grid h-20 w-24 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-950 text-xs font-black text-white">
              {item.materialType === 'IMAGE' ? <ProtectedCaptureImage url={item.fileUrl} alt={item.originalFilename} className="h-full w-full object-cover"/> : <span>PDF<br/>{item.pageCount} {item.pageCount === 1 ? 'page' : 'pages'}</span>}
            </button>
            <div className="min-w-0 flex-1">
              <button type="button" onClick={() => setViewer(item)} className="block max-w-full truncate text-left text-sm font-bold text-foreground hover:text-primary">{item.originalFilename}</button>
              <p className="mt-1 text-xs text-muted-foreground">{item.materialType === 'PDF' ? `PDF • ${item.pageCount} ${item.pageCount === 1 ? 'page' : 'pages'}` : 'Image'}</p>
              <p className={`mt-1 text-xs font-bold ${status.tone}`}>{status.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{status.message}</p>
              {status.canRetry && <Btn type="button" size="sm" variant="secondary" className="mt-2" disabled={busy} onClick={() => retry(item)}><RotateCcw size={14}/> Reprocess</Btn>}
            </div>
            <button type="button" aria-label={`Delete ${item.originalFilename}`} onClick={() => setDeleting(item)} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-destructive-subtle hover:text-destructive-subtle-foreground dark:hover:bg-destructive-subtle"><Trash size={16}/></button>
          </div>;
        })}
      </div>}
    <ImageLightbox open={viewer?.materialType === 'IMAGE'} onClose={() => setViewer(null)} title="Uploaded Image" subtitle={viewer?.originalFilename} protectedUrl={viewer?.fileUrl} alt={viewer?.originalFilename}/>
    <PdfViewer open={viewer?.materialType === 'PDF'} onClose={() => setViewer(null)} material={viewer}/>
    {deleting && <ConfirmModal title="Delete lesson material?" body={`Delete ${deleting.originalFilename}? Its protected file and derived extraction will be removed.`} confirmLabel="Delete Material" loading={busy} onCancel={() => setDeleting(null)} onConfirm={remove}/>}
  </Card>;
}
