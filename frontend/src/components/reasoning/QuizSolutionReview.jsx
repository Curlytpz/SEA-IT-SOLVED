import { useEffect, useRef, useState } from 'react';
import { Alert, Btn, Input, Select, Textarea } from '../ui';
import ProtectedCaptureImage from '../hardware/ProtectedCaptureImage';
import WorkspaceToast from './WorkspaceToast';
import ImageLightbox from '../recognition/ImageLightbox';
import GeneratedContent from './GeneratedContent';
import { getQuizSolutions, recognizeQuizSolution, analyzeQuizSolution, gradeQuizSolution } from '../../services/phase6Api';

export function AnswerReview({ row, onUpdate, refresh, onGrade }) {
  const [score, setScore] = useState(row.pointsAwarded ?? ''), [feedback, setFeedback] = useState(row.instructorFeedback || '');
  const [busy, setBusy] = useState(''), [error, setError] = useState('');
  const pending = useRef(false);
  const [toast,setToast]=useState(null),[viewImage,setViewImage]=useState(false);
  useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(null),3000);return()=>clearTimeout(timer);},[toast]);
  async function run(action, request) {
    if (pending.current) return;
    pending.current = true; setBusy(action); setError('');
    try { onUpdate(await request()); if(action==='grade'){setToast({id:Date.now(),text:'Grade saved'});onGrade?.();} }
    catch (requestError) { setError(requestError.response?.data?.error || 'Unable to complete this action. Try again.'); await refresh(); }
    finally { pending.current = false; setBusy(''); }
  }
  return <div className="mt-4 min-w-0 space-y-4">
    <WorkspaceToast notification={toast} onDismiss={()=>setToast(null)}/>
    <ImageLightbox open={viewImage} onClose={()=>setViewImage(false)} title="Handwritten solution" protectedUrl={row.solution?.imageUrl} alt="Student handwritten solution"/>
    {error && <Alert>{error}</Alert>}
    <GeneratedContent markdown={row.prompt}/>
    {row.problemSettings?.rubric && <details><summary className="cursor-pointer text-sm font-semibold">Instructor-only rubric</summary><GeneratedContent markdown={row.problemSettings.rubric}/></details>}
    {row.solution ? <button type="button" className="block w-full" aria-label="Enlarge handwritten solution" onClick={()=>setViewImage(true)}><ProtectedCaptureImage url={row.solution.imageUrl} alt="Student handwritten solution" className="max-h-96 w-full rounded-lg object-contain"/></button> : <GeneratedContent markdown={row.answer || 'No written answer provided.'}/>}
    {row.solution && <>
      <p className="text-xs text-slate-500">Recognition: {row.recognitionStatus}. The original image remains available if recognition fails.</p>
      <p className="text-xs text-slate-500">AI analysis is advisory. Final assessment remains under instructor control.</p>
      {row.recognitionFailure && <p className="text-sm text-amber-700">{row.recognitionFailure}</p>}
      <div className="flex flex-wrap gap-2">
        <Btn size="sm" variant="secondary" disabled={Boolean(busy) || Boolean(row.gradedAt)} loading={busy === 'recognize'} onClick={() => run('recognize', () => recognizeQuizSolution(row.id))}>{row.recognitionStatus === 'FAILED' ? 'Retry Recognition' : 'Recognize Solution'}</Btn>
        <Btn size="sm" variant="secondary" disabled={Boolean(busy) || Boolean(row.gradedAt) || row.recognitionStatus !== 'READY'} loading={busy === 'analyze'} onClick={() => run('analyze', () => analyzeQuizSolution(row.id))}>Analyze with AI</Btn>
      </div>
      {(row.recognizedText || row.recognizedMath?.length > 0) && <details>
        <summary className="cursor-pointer text-sm font-semibold">Recognized solution (verify against the image)</summary>
        {row.recognizedText && <GeneratedContent markdown={row.recognizedText}/>}
        {row.recognizedMath?.map((expression,index) => {
          const latex = typeof expression === 'string' ? expression : expression?.latex;
          return latex ? <GeneratedContent key={index} markdown={'$$\n' + latex + '\n$$'}/> : null;
        })}
      </details>}
      {row.aiReview && <div className="rounded-lg border border-primary/20 p-4 dark:border-primary/30">
        <p className="text-sm font-bold">AI advisory — not an official grade</p>
        <p className="mt-2 text-xs font-semibold">{row.aiReview.assessment?.replaceAll('_',' ')}</p><GeneratedContent markdown={row.aiReview.summary}/>
        {row.aiReview.strengths?.map((item,index)=><div key={index} className="mt-2"><GeneratedContent markdown={item}/></div>)}
        {row.aiReview.possible_errors?.map((item,index) => <div className="mt-2 text-sm" key={index}><GeneratedContent markdown={[item.step,item.issue,item.suggestion].filter(Boolean).join('\n\n')}/></div>)}
        {row.aiReview.suggested_feedback && <details className="mt-3"><summary className="cursor-pointer text-sm">Suggested feedback (instructor only)</summary><GeneratedContent markdown={row.aiReview.suggested_feedback}/></details>}
      </div>}
    </>}
    <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-700">
      <label className="grid max-w-48 gap-2 text-sm font-semibold">
        <span>Official score <span className="font-normal text-muted-foreground">/ {row.maxPoints}</span></span>
        <Input className="official-score-input block" type="number" min="0" max={row.maxPoints} step="0.01" value={score} disabled={Boolean(busy)} onChange={event => setScore(event.target.value)}/>
      </label>
      <label className="block text-sm font-semibold">Feedback to student<Textarea className="mt-2" value={feedback} disabled={Boolean(busy)} onChange={event => setFeedback(event.target.value)}/></label>
      <Btn size="sm" disabled={Boolean(busy) || score === ''} loading={busy === 'grade'} onClick={() => run('grade', () => gradeQuizSolution(row.id, { pointsAwarded: Number(score), instructorFeedback: feedback }))}>Save Official Grade</Btn>
      <p className="text-xs text-slate-500">{row.gradedAt ? 'Official grade saved.' : 'Awaiting professor review.'} The final quiz result is released when every manual question is graded.</p>
    </div>
  </div>;
}

export default function QuizSolutionReview({ quizId }) {
  const [open, setOpen] = useState(false), [rows, setRows] = useState([]), [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  async function refresh() {
    try { const result = await getQuizSolutions(quizId); setRows(result); setSelected(current => result.some(row => row.id === current) ? current : result[0]?.id || ''); }
    catch (requestError) { setError(requestError.response?.data?.error || 'Unable to load submitted answers.'); }
  }
  useEffect(() => {
    if (!open) return;
    let active = true; setLoading(true); setError('');
    getQuizSolutions(quizId).then(result => { if (active) { setRows(result); setSelected(result[0]?.id || ''); } })
      .catch(requestError => { if (active) setError(requestError.response?.data?.error || 'Unable to load submitted answers.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, quizId]);
  const row = rows.find(item => item.id === selected);
  return <section className="mb-5 min-w-0 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
    <button type="button" className="text-sm font-semibold text-primary-subtle-foreground dark:text-primary" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? 'Hide submitted answers' : 'Review submitted answers'}</button>
    {open && <>{error && <Alert>{error}</Alert>}{loading ? <p className="mt-3 text-sm">Loading submissions…</p> : rows.length ? <>
      <Select className="mt-3" aria-label="Submitted answer" value={selected} onChange={event => setSelected(event.target.value)}>{rows.map(item => <option key={item.id} value={item.id}>{item.student.name} · Question {item.order} · {item.gradedAt ? 'Graded' : 'Awaiting review'}</option>)}</Select>
      {row && <AnswerReview key={row.id} row={row} refresh={refresh} onUpdate={updated => setRows(current => current.map(item => item.id === updated.id ? updated : item))}/>}
    </> : <p className="mt-3 text-sm text-slate-500">No submitted answers requiring manual review yet.</p>}</>}
  </section>;
}
