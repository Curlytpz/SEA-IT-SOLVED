import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Camera, Upload, Lightbulb, Sigma, Check } from 'lucide-react';
import { Alert, Btn } from '../ui';
import ProtectedCaptureImage from '../hardware/ProtectedCaptureImage';
import GeneratedContent from './GeneratedContent';
import SolutionCamera from './SolutionCamera';
import WorkspaceToast from './WorkspaceToast';
import { uploadQuizSolution } from '../../services/phase6Api';

export default function QuizSolutionUpload({ attemptId, question, submitted, onUploaded, onBusy, file, onFile }) {
  const [preview, setPreview] = useState(''), [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [toast, setToast] = useState(null);
  const pending = useRef(false), input = useRef(null);
  useEffect(() => { const url = file ? URL.createObjectURL(file) : ''; setPreview(url); return () => { if (url) URL.revokeObjectURL(url); }; }, [file]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 3000); return () => clearTimeout(timer); }, [toast]);
  function choose(next) {
    if (!next) return;
    if (!['image/jpeg','image/png','image/webp'].includes(next.type) || next.size > 8*1024*1024) { setError('Choose a JPEG, PNG, or WebP image up to 8 MB.'); return; }
    setError(''); onFile(next);
  }
  async function upload() {
    if (!file || pending.current) return;
    pending.current = true; setBusy(true); onBusy(true); setError('');
    try {
      const solution = await uploadQuizSolution(attemptId, question.id, file);
      onUploaded(question.id, solution); onFile(null); setToast({ id: Date.now(), text: 'Solution saved', description: 'Your handwritten work is safely saved.' });
    } catch (requestError) { setError(requestError.response?.data?.error || 'Upload failed. Your previously saved work is unchanged. Try again.'); }
    finally { pending.current = false; setBusy(false); onBusy(false); }
  }
  return <div className="mt-6 min-w-0 space-y-5">
    {question.instructions && <GeneratedContent markdown={question.instructions} audience="student"/>}
    {(question.tip || question.formula) && <section aria-label="Stored assistance"><p className="mb-2 text-sm font-medium text-slate-500">Need a little help?</p><div className="grid gap-3 sm:grid-cols-2">
      {[[question.tip,'View Tip',Lightbulb],[question.formula,'View Formula',Sigma]].filter(([text]) => text).map(([text,label,Icon]) => <StoredHelp key={label} text={text} label={label} Icon={Icon}/>)}
    </div></section>}
    <section className="min-w-0 rounded-xl border border-border bg-surface-subtle p-4 sm:p-5">
      <h3 className="font-semibold">Your handwritten solution</h3><p className="mt-1 text-sm leading-6 text-slate-500">Take a photo or upload an image of your handwritten work.</p>
      {error && <Alert>{error}</Alert>}
      {question.solution && <div className="mt-4"><ProtectedCaptureImage url={question.solution.imageUrl} alt="Your saved handwritten solution" className="max-h-72 w-full rounded-lg object-contain"/><p className="mt-2 flex items-center gap-2 text-sm font-medium text-emerald-700"><Check size={16}/>Solution saved</p></div>}
      {!submitted && <>
        <input ref={input} hidden type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => { choose(event.target.files?.[0]); event.target.value = ''; }}/>
        <div className="mt-4 flex flex-wrap gap-3"><Btn variant="secondary" disabled={busy} onClick={() => setCamera(true)}><Camera size={17}/>Open Camera</Btn><Btn variant="secondary" disabled={busy} onClick={() => input.current?.click()}><Upload size={17}/>{file || question.solution ? 'Replace Image' : 'Choose Image'}</Btn></div>
        {preview && <div className="mt-4"><img src={preview} alt="Selected solution, not yet saved" className="max-h-72 w-full rounded-lg object-contain"/><p className="mt-2 text-xs text-amber-700">Unsaved image — choose Save Solution to keep this work.</p><Btn variant="ghost" disabled={busy} onClick={() => onFile(null)}>Remove selected image</Btn></div>}
        <Btn className="mt-4" disabled={!file || busy} loading={busy} onClick={upload}>Save Solution</Btn>
        <p className="mt-3 text-xs leading-5 text-slate-500">JPEG / PNG / WebP · up to 8 MB. Saving does not submit or grade your quiz.</p>
      </>}
    </section>
    {camera && <SolutionCamera onClose={() => setCamera(false)} onUse={choose}/>}
    <WorkspaceToast notification={toast} onDismiss={() => setToast(null)}/>
  </div>;
}

function StoredHelp({text,label,Icon}){
  const [open,setOpen]=useState(false);
  const reduced=useReducedMotion();
  return <details onToggle={event=>setOpen(event.currentTarget.open)} className="rounded-xl border border-primary/20 bg-primary-subtle p-4">
    <summary className="cursor-pointer text-sm font-semibold text-primary-subtle-foreground dark:text-primary"><Icon size={16} className="mr-2 inline" aria-hidden="true"/>{label}</summary>
    {open&&<motion.div initial={{opacity:reduced?1:0,y:reduced?0:3}} animate={{opacity:1,y:0}} transition={{duration:reduced?0:.18}} className="mt-3"><GeneratedContent markdown={text} audience="student"/></motion.div>}
  </details>;
}
