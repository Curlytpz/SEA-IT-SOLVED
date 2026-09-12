import { useEffect, useState } from 'react';
import { CalendarDays, FileImage, Upload } from 'lucide-react';
import { Alert, Badge, Btn, Card, EmptyState, LoadingState } from '../ui';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import ProtectedCaptureImage from '../hardware/ProtectedCaptureImage';
import GeneratedContent from './GeneratedContent';
import { getStudentSolutionActivities, submitSolutionImage } from '../../services/solutionActivityApi';

const dateText = value => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'No due date';

export default function StudentSolutionActivities({ lessonId }) {
  const [activities, setActivities] = useState([]), [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null), [file, setFile] = useState(null), [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState('');
  useEffect(() => {
    let active = true;
    getStudentSolutionActivities(lessonId).then(value => active && setActivities(value)).catch(requestError => active && setError(requestError.response?.data?.error || 'Unable to load solution activities.')).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [lessonId]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  function chooseFile(next) {
    if (preview) URL.revokeObjectURL(preview);
    setFile(next || null); setPreview(next ? URL.createObjectURL(next) : ''); setError('');
  }
  function close() { if (!busy) { chooseFile(null); setSelected(null); } }
  async function submit() {
    if (!file || !selected) { setError('Choose a JPEG, PNG, or WebP image of your solution.'); return; }
    setBusy(true); setError('');
    try {
      const submission = await submitSolutionImage(selected.id, file);
      setActivities(current => current.map(activity => activity.id === selected.id ? { ...activity, submission } : activity));
      setSuccess('Submitted successfully. Awaiting instructor review.');
      close();
    } catch (requestError) { setError(requestError.response?.data?.error || 'Unable to submit this solution image.'); }
    finally { setBusy(false); }
  }
  if (loading) return <section className="mt-7"><LoadingState text="Loading solution activities…"/></section>;
  return <section className="mt-7 space-y-4" aria-labelledby="student-solution-activities-title">
    <div><h2 id="student-solution-activities-title" className="text-lg font-bold text-slate-900 dark:text-white">Solution Activities</h2><p className="text-sm text-slate-500">Upload your handwritten work for instructor review.</p></div>
    {error && !selected && <Alert onClose={() => setError('')}>{error}</Alert>}{success && <Alert type="success" onClose={() => setSuccess('')}>{success}</Alert>}
    {activities.length ? <div className="grid gap-4 lg:grid-cols-2">{activities.map(activity => {
      const submission = activity.submission;
      return <Card key={activity.id} className="min-w-0 p-5"><div className="flex items-start justify-between gap-3"><div><Badge status={activity.status}/><h3 className="mt-2 font-semibold text-slate-900 dark:text-white">{activity.title}</h3></div><span className="shrink-0 text-sm font-bold text-primary-subtle-foreground">{activity.maxPoints} pts</span></div><div className="mt-3 break-words text-sm text-slate-700 dark:text-slate-200"><GeneratedContent markdown={activity.problemText}/></div>{activity.instructions && <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300"><strong className="block text-xs uppercase tracking-wide">Instructions</strong><GeneratedContent markdown={activity.instructions} audience="student" mathFallback/></div>}<p className="mt-3 inline-flex items-center gap-1 text-xs text-slate-500"><CalendarDays size={14}/>{dateText(activity.dueAt)}</p>
        {submission ? <div className="mt-4 space-y-3 border-t border-slate-200 pt-4 dark:border-slate-700"><div className="flex flex-wrap items-center gap-2"><Badge status={submission.status}/><span className="text-sm font-medium text-slate-600 dark:text-slate-300">{submission.status === 'GRADED' ? 'Instructor feedback released' : 'Submitted • Awaiting Instructor Review'}</span></div><div className="overflow-hidden rounded-lg bg-slate-950"><ProtectedCaptureImage url={submission.imageUrl} alt="Your submitted handwritten solution" className="max-h-48 w-full object-contain"/></div>{submission.feedbackReleasedAt && <Alert type="success" label="Grade released" title={`Score: ${submission.finalScore} / ${activity.maxPoints}`} className="mb-0"><strong>Instructor feedback:</strong><GeneratedContent markdown={submission.instructorFeedback || 'No written feedback provided.'} audience="student" mathFallback/></Alert>}{activity.acceptingSubmissions && submission.status !== 'GRADED' && <Btn variant="secondary" className="w-full" onClick={() => { setSelected(activity); setError(''); }}><FileImage size={16}/>Replace Solution Image</Btn>}</div> : <Btn className="mt-4 w-full" disabled={!activity.acceptingSubmissions} onClick={() => { setSelected(activity); setError(''); }}><Upload size={16}/>{activity.acceptingSubmissions ? 'Submit Solution' : 'Submissions Closed'}</Btn>}
      </Card>;
    })}</div> : <Card><EmptyState icon={<FileImage/>} title="No solution activities" body="Your instructor has not published a solution activity for this lesson."/></Card>}
    {selected && <Dialog open onOpenChange={open => { if (!open) close(); }}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>Submit Solution</DialogTitle><DialogDescription>{selected.title} • Upload one clear image of your handwritten work.</DialogDescription></DialogHeader>{error && <Alert>{error}</Alert>}<label className="flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-5 text-center hover:border-primary/40 dark:border-slate-700"><Upload size={24} className="text-primary-subtle-foreground"/><strong>{file ? 'Replace Image' : 'Choose Solution Image'}</strong><span className="text-xs text-slate-500">JPEG, PNG, or WebP • maximum 8 MB</span><input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy} onChange={event => chooseFile(event.target.files?.[0])}/></label>{preview && <img src={preview} alt="Selected solution preview" className="max-h-[45vh] w-full rounded-xl bg-slate-950 object-contain"/>}<DialogFooter><Btn variant="ghost" disabled={busy} onClick={close}>Cancel</Btn><Btn loading={busy} loadingText="Submitting and recognizing…" disabled={!file} onClick={submit}>Submit Solution</Btn></DialogFooter></DialogContent></Dialog>}
  </section>;
}
