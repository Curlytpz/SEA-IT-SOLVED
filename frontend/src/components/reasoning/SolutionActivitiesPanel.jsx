import { useEffect, useMemo, useState } from 'react';
import { BrainCircuit, CalendarDays, CheckCircle2, ClipboardCheck, FileImage, Plus, RotateCcw, Users } from 'lucide-react';
import { Alert, Badge, Btn, Card, ConfirmModal, EmptyState, FormField, Input, LoadingState, Spinner, Textarea } from '../ui';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import ProtectedCaptureImage from '../hardware/ProtectedCaptureImage';
import GeneratedContent from './GeneratedContent';
import {
  analyzeSolutionSubmission, changeSolutionActivityStatus, createSolutionActivity, deleteSolutionActivity,
  getInstructorSolutionActivities, getSolutionSubmissions, gradeSolutionSubmission,
  reopenSolutionSubmission, retrySolutionRecognition, updateSolutionActivity,
} from '../../services/solutionActivityApi';

const emptyForm = { title: '', problemText: '', instructions: '', rubricText: '', maxPoints: '20', dueAt: '' };
const dateText = value => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'No due date';
const localDateValue = value => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
const errorText = (error, fallback) => error.response?.data?.error || fallback;

function ActivityForm({ activity, busy, onClose, onSave }) {
  const [form, setForm] = useState(() => activity ? {
    title: activity.title, problemText: activity.problemText, instructions: activity.instructions,
    rubricText: activity.rubricText, maxPoints: String(activity.maxPoints), dueAt: localDateValue(activity.dueAt),
  } : emptyForm);
  const patch = key => event => setForm(current => ({ ...current, [key]: event.target.value }));
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader><DialogTitle>{activity ? 'Edit Solution Activity' : 'Create Solution Activity'}</DialogTitle><DialogDescription>Create an instructor-reviewed handwritten mathematics activity. The expected solution stays instructor-only.</DialogDescription></DialogHeader>
      <form onSubmit={event => { event.preventDefault(); onSave({ ...form, dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null }); }}>
        <FormField label="Title"><Input value={form.title} onChange={patch('title')} maxLength={200} required/></FormField>
        <FormField label="Problem / Question"><Textarea value={form.problemText} onChange={patch('problemText')} required className="min-h-32"/></FormField>
        <FormField label="Instructions"><Textarea value={form.instructions} onChange={patch('instructions')} placeholder="Show your complete solution and reasoning."/></FormField>
        <FormField label="Expected Solution / Rubric" hint="Instructor-only. Students never receive this field."><Textarea value={form.rubricText} onChange={patch('rubricText')} className="min-h-32"/></FormField>
        <div className="grid gap-4 sm:grid-cols-2"><FormField label="Maximum Points"><Input type="number" min="0.01" max="10000" step="0.01" value={form.maxPoints} onChange={patch('maxPoints')} required/></FormField><FormField label="Due Date (optional)"><Input type="datetime-local" value={form.dueAt} onChange={patch('dueAt')}/></FormField></div>
        <DialogFooter><Btn variant="ghost" disabled={busy} onClick={onClose}>Cancel</Btn><Btn type="submit" loading={busy}>{activity ? 'Save Changes' : 'Create Draft'}</Btn></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

function ReviewProgress() {
  return <Alert type="info" label="Analysis in progress" title="Analyzing submitted solution" className="mb-0" actions={<Spinner/>}>
    <span>Reading the submission, checking mathematical steps, and preparing advisory instructor feedback.</span>
  </Alert>;
}

function recognizedMarkdown(submission) {
  const math = (submission.recognizedMath || []).map(item => item?.latex).filter(Boolean).map(value => `$$\n${value}\n$$`).join('\n\n');
  return [submission.extractedSolutionText, math].filter(Boolean).join('\n\n');
}

function SubmissionReview({ submission, maxPoints, busy, error, analysisFailed, onClose, onAnalyze, onRetryRecognition, onGrade, onReopen }) {
  const [score, setScore] = useState(submission.finalScore == null ? '' : String(submission.finalScore));
  const [feedback, setFeedback] = useState(submission.instructorFeedback || '');
  const markdown = useMemo(() => recognizedMarkdown(submission), [submission]);
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="max-w-[calc(100%-1rem)] sm:max-w-6xl">
    <DialogHeader><DialogTitle>{submission.student?.name || 'Student'} — Submitted Solution</DialogTitle><DialogDescription>{submission.student?.studentNumber || 'Student submission'} • {dateText(submission.submittedAt)}</DialogDescription></DialogHeader>
    {error && <Alert>{error}</Alert>}
    <div className="grid min-w-0 gap-4 lg:grid-cols-3">
      <section className="min-w-0 rounded-xl border border-slate-200 p-3 dark:border-slate-700"><h3 className="mb-3 flex items-center gap-2 font-semibold"><FileImage size={17}/>Original solution image</h3><div className="overflow-hidden rounded-lg bg-slate-950"><ProtectedCaptureImage url={submission.imageUrl} alt={`${submission.student?.name || 'Student'} handwritten solution`} className="max-h-[52vh] w-full object-contain"/></div></section>
      <section className="min-w-0 rounded-xl border border-slate-200 p-3 dark:border-slate-700"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Recognized Mathematical Solution</h3><Badge status={submission.recognitionStatus}/></div>
        {submission.recognitionStatus === 'READY' && markdown ? <div className="max-h-[52vh] overflow-y-auto overflow-x-hidden break-words rounded-lg bg-slate-50 p-3 dark:bg-slate-950"><GeneratedContent markdown={markdown}/></div> : <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300"><p>{submission.recognitionFailure || 'Recognition has not completed.'}</p>{submission.recognitionStatus === 'FAILED' && <Btn variant="secondary" loading={busy === 'recognize'} onClick={onRetryRecognition}><RotateCcw size={15}/>Retry Recognition</Btn>}</div>}
      </section>
      <section className="min-w-0 space-y-4 rounded-xl border border-slate-200 p-3 dark:border-slate-700"><div><h3 className="flex items-center gap-2 font-semibold"><BrainCircuit size={17}/>AI Advisory Review</h3><p className="mt-1 text-xs text-slate-500">AI analysis is advisory. Final assessment and grading remain under instructor control.</p></div>
        {busy === 'analyze' ? <ReviewProgress/> : submission.aiReview ? <div className="space-y-3 text-sm"><Badge status={submission.aiReview.assessment}/><GeneratedContent markdown={submission.aiReview.summary} mathFallback/>{submission.aiReview.strengths.length > 0 && <div><strong>Strengths</strong><ul className="mt-1 list-disc space-y-1 pl-5">{submission.aiReview.strengths.map((item, index) => <li key={index}><GeneratedContent markdown={item} mathFallback/></li>)}</ul></div>}{submission.aiReview.possibleErrors.length > 0 && <div><strong>Possible errors to verify</strong><ul className="mt-1 space-y-2">{submission.aiReview.possibleErrors.map((item, index) => <li key={index} className="rounded-lg bg-amber-50 p-2 dark:bg-amber-500/10"><GeneratedContent markdown={[item.step || `Step ${index + 1}`, item.issue, item.suggestion].filter(Boolean).join('\n\n')} mathFallback/></li>)}</ul></div>}{submission.aiReview.suggestedFeedback && <div><strong>Suggested feedback</strong><GeneratedContent markdown={submission.aiReview.suggestedFeedback} mathFallback/></div>}<Btn variant="secondary" onClick={onAnalyze}>{analysisFailed ? 'Retry Analysis' : 'Analyze Again'}</Btn></div> : <Btn disabled={submission.recognitionStatus !== 'READY'} onClick={onAnalyze}><BrainCircuit size={16}/>{analysisFailed ? 'Retry Analysis' : 'Analyze with AI'}</Btn>}
        <div className="border-t border-slate-200 pt-4 dark:border-slate-700"><h3 className="mb-3 flex items-center gap-2 font-semibold"><ClipboardCheck size={17}/>Instructor Assessment</h3><FormField label={`Score (maximum ${maxPoints})`}><Input type="number" min="0" max={maxPoints} step="0.01" value={score} onChange={event => setScore(event.target.value)}/></FormField><FormField label="Instructor Feedback"><Textarea value={feedback} onChange={event => setFeedback(event.target.value)} placeholder="Feedback released to the student."/></FormField><Btn className="w-full" loading={busy === 'grade'} disabled={score === '' || !Number.isFinite(Number(score))} onClick={() => onGrade({ finalScore: Number(score), instructorFeedback: feedback })}><CheckCircle2 size={16}/>Save Grade / Release Feedback</Btn>{submission.status === 'GRADED' && <Btn className="mt-2 w-full" variant="secondary" loading={busy === 'reopen-submission'} onClick={onReopen}>Allow Student Resubmission</Btn>}</div>
      </section>
    </div>
  </DialogContent></Dialog>;
}

export default function SolutionActivitiesPanel({ lessonId }) {
  const [activities, setActivities] = useState([]), [loading, setLoading] = useState(true);
  const [formActivity, setFormActivity] = useState(undefined), [formOpen, setFormOpen] = useState(false);
  const [activeActivity, setActiveActivity] = useState(null), [submissions, setSubmissions] = useState([]), [review, setReview] = useState(null);
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [analysisFailed, setAnalysisFailed] = useState(false), [deleteTarget, setDeleteTarget] = useState(null);
  const load = async () => { setLoading(true); try { setActivities(await getInstructorSolutionActivities(lessonId)); } catch (requestError) { setError(errorText(requestError, 'Unable to load solution activities.')); } finally { setLoading(false); } };
  useEffect(() => { load(); }, [lessonId]);
  const replaceActivity = activity => setActivities(current => current.map(item => item.id === activity.id ? activity : item));
  async function saveActivity(payload) { setBusy('form'); setError(''); try { const saved = formActivity ? await updateSolutionActivity(formActivity.id, payload) : await createSolutionActivity(lessonId, payload); setActivities(current => formActivity ? current.map(item => item.id === saved.id ? saved : item) : [saved, ...current]); setFormOpen(false); setFormActivity(undefined); } catch (requestError) { setError(errorText(requestError, 'Unable to save the activity.')); } finally { setBusy(''); } }
  async function changeStatus(activity, action) { setBusy(`${action}-${activity.id}`); setError(''); try { replaceActivity(await changeSolutionActivityStatus(activity.id, action)); } catch (requestError) { setError(errorText(requestError, 'Unable to change activity status.')); } finally { setBusy(''); } }
  async function removeActivity() { if (!deleteTarget) return; setBusy('delete'); try { await deleteSolutionActivity(deleteTarget.id); setActivities(current => current.filter(item => item.id !== deleteTarget.id)); setDeleteTarget(null); } catch (requestError) { setError(errorText(requestError, 'Unable to delete the activity.')); } finally { setBusy(''); } }
  async function openSubmissions(activity) { setBusy(`submissions-${activity.id}`); setError(''); try { setSubmissions(await getSolutionSubmissions(activity.id)); setActiveActivity(activity); } catch (requestError) { setError(errorText(requestError, 'Unable to load submissions.')); } finally { setBusy(''); } }
  const replaceSubmission = submission => { setSubmissions(current => current.map(item => item.id === submission.id ? submission : item)); setReview(submission); };
  async function recognize() { setBusy('recognize'); setError(''); try { replaceSubmission(await retrySolutionRecognition(review.id)); } catch (requestError) { setError(errorText(requestError, 'Recognition failed. The original submission is still available.')); } finally { setBusy(''); } }
  async function analyze() { setBusy('analyze'); setError(''); setAnalysisFailed(false); try { replaceSubmission(await analyzeSolutionSubmission(review.id)); } catch (requestError) { setAnalysisFailed(true); setError(errorText(requestError, 'AI is temporarily unavailable. Please try again.')); } finally { setBusy(''); } }
  async function grade(payload) { setBusy('grade'); setError(''); try { replaceSubmission(await gradeSolutionSubmission(review.id, payload)); await load(); } catch (requestError) { setError(errorText(requestError, 'Unable to save and release the grade.')); } finally { setBusy(''); } }
  async function reopenStudentSubmission() { setBusy('reopen-submission'); setError(''); try { replaceSubmission(await reopenSolutionSubmission(review.id)); await load(); } catch (requestError) { setError(errorText(requestError, 'Unable to allow a resubmission.')); } finally { setBusy(''); } }

  return <section className="space-y-4" aria-labelledby="solution-activities-title">
    <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center"><div><h2 id="solution-activities-title" className="text-lg font-bold text-slate-900 dark:text-white">Solution Activities</h2><p className="text-sm text-slate-500">Instructor-reviewed handwritten mathematics submissions.</p></div><Btn onClick={() => { setFormActivity(undefined); setFormOpen(true); }}><Plus size={16}/>Create Solution Activity</Btn></div>
    {error && !review && <Alert onClose={() => setError('')}>{error}</Alert>}
    {loading ? <LoadingState text="Loading solution activities…"/> : activities.length ? <div className="grid gap-4 xl:grid-cols-2">{activities.map(activity => <Card key={activity.id} className="p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><Badge status={activity.status}/><h3 className="mt-2 text-base font-semibold text-slate-900 dark:text-white">{activity.title}</h3></div><span className="shrink-0 text-sm font-bold text-primary-subtle-foreground">{activity.maxPoints} pts</span></div><div className="mt-3 line-clamp-3 text-sm text-slate-600 dark:text-slate-300"><GeneratedContent markdown={activity.problemText}/></div><div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500"><span className="inline-flex items-center gap-1"><Users size={14}/>{activity.submissionCount} submitted</span><span>{activity.awaitingReviewCount} awaiting review</span><span>{activity.gradedCount} graded</span><span className="inline-flex items-center gap-1"><CalendarDays size={14}/>{dateText(activity.dueAt)}</span></div><div className="mt-4 flex flex-wrap gap-2">{activity.status === 'DRAFT' && <><Btn size="sm" variant="secondary" onClick={() => { setFormActivity(activity); setFormOpen(true); }}>Edit</Btn><Btn size="sm" loading={busy === `publish-${activity.id}`} onClick={() => changeStatus(activity, 'publish')}>Publish</Btn><Btn size="sm" variant="danger" onClick={() => setDeleteTarget(activity)}>Delete</Btn></>}{activity.status !== 'DRAFT' && <Btn size="sm" variant="secondary" loading={busy === `submissions-${activity.id}`} onClick={() => openSubmissions(activity)}>View Submissions</Btn>}{activity.status === 'PUBLISHED' && <Btn size="sm" variant="outline" loading={busy === `close-${activity.id}`} onClick={() => changeStatus(activity, 'close')}>Close Activity</Btn>}{activity.status === 'CLOSED' && <Btn size="sm" variant="outline" loading={busy === `reopen-${activity.id}`} onClick={() => changeStatus(activity, 'reopen')}>Reopen</Btn>}</div></Card>)}</div> : <Card><EmptyState icon={<ClipboardCheck/>} title="No solution activities" body="Create a handwritten problem-solving activity for this lesson."/></Card>}
    {formOpen && <ActivityForm activity={formActivity} busy={busy === 'form'} onClose={() => { setFormOpen(false); setFormActivity(undefined); }} onSave={saveActivity}/>} 
    {activeActivity && <Dialog open onOpenChange={open => { if (!open) { setActiveActivity(null); setSubmissions([]); } }}><DialogContent className="sm:max-w-4xl"><DialogHeader><DialogTitle>{activeActivity.title} — Student Submissions</DialogTitle><DialogDescription>{submissions.length} submitted • select a student to inspect, analyze, and grade.</DialogDescription></DialogHeader>{submissions.length ? <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">{submissions.map(submission => <button key={submission.id} type="button" onClick={() => { setError(''); setReview(submission); }} className="flex min-h-16 w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800"><span><strong className="block text-slate-900 dark:text-white">{submission.student?.name}</strong><small className="text-slate-500">{submission.student?.studentNumber} • {dateText(submission.submittedAt)}</small></span><span className="flex flex-wrap justify-end gap-2"><Badge status={submission.recognitionStatus}/><Badge status={submission.status}/></span></button>)}</div> : <EmptyState icon={<Users/>} title="No submissions yet" body="Student submissions will appear here."/>}</DialogContent></Dialog>}
    {review && <SubmissionReview submission={review} maxPoints={activeActivity?.maxPoints || 0} busy={busy} error={error} analysisFailed={analysisFailed} onClose={() => { setReview(null); setError(''); setAnalysisFailed(false); }} onAnalyze={analyze} onRetryRecognition={recognize} onGrade={grade} onReopen={reopenStudentSubmission}/>} 
    {deleteTarget && <ConfirmModal title="Delete solution activity?" body={`Delete “${deleteTarget.title}”? Draft deletion cannot be undone.`} confirmLabel="Delete Activity" loading={busy === 'delete'} onCancel={() => setDeleteTarget(null)} onConfirm={removeActivity}/>} 
  </section>;
}
