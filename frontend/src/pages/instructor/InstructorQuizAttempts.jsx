import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import DashboardLayout from '../../layouts/DashboardLayout';
import { Alert, Btn, Card, LoadingState, Select } from '../../components/ui';
import GeneratedContent from '../../components/reasoning/GeneratedContent';
import { AnswerReview } from '../../components/reasoning/QuizSolutionReview';
import { getInstructorQuizAttempts, getQuizSolutions } from '../../services/phase6Api';
import { sectionOriginFromState, sectionOriginState, sectionReturnPath } from '../../utils/instructorLessonNavigation';

export default function InstructorQuizAttempts(){
  const {quizId}=useParams();
  const location=useLocation();
  const [data,setData]=useState(null),[rows,setRows]=useState([]),[selected,setSelected]=useState(''),[filter,setFilter]=useState('ALL'),[error,setError]=useState('');
  async function refresh(){
    try{const [next,solutions]=await Promise.all([getInstructorQuizAttempts(quizId),getQuizSolutions(quizId)]);
      setData(next);setRows(solutions);setError('');setSelected(id=>next.attempts.some(a=>a.id===id)?id:next.attempts[0]?.id||'');
    }catch(e){setError(e.response?.data?.error||'Unable to load quiz attempts.');}
  }
  useEffect(()=>{setData(null);setSelected('');refresh();},[quizId]);
  const attempt=data?.attempts.find(a=>a.id===selected);
  const requestedOrigin=location.state?.from;
  const validOrigin=typeof requestedOrigin==='string'&&(/^\/instructor\/sections\/[0-9a-f-]+\?tab=reviews$/i.test(requestedOrigin)||/^\/instructor\/lessons\/[0-9a-f-]+\/review(?:\?view=workspace)?$/i.test(requestedOrigin));
  const backTo=validOrigin?requestedOrigin:data?`/instructor/sections/${data.quiz.sectionId}?tab=reviews`:'/instructor/sections';
  const backToSection=backTo.includes('/sections/');
  const higherLevelOrigin=sectionOriginFromState(location.state)||sectionReturnPath(data?.quiz.sectionId,'reviews');
  const lessonBackState=sectionOriginState(location.state,higherLevelOrigin,{focusQuizId:quizId});
  return <DashboardLayout>
    <Link replace className="mb-5 inline-flex min-h-11 items-center text-sm font-semibold text-primary-subtle-foreground hover:text-primary-hover dark:text-primary" to={backTo} state={backToSection?undefined:lessonBackState}>← {backToSection?'Back to section reviews':'Back to lesson workspace'}</Link>
    {error&&<Alert>{error}<button className="ml-3 underline" onClick={refresh}>Retry</button></Alert>}
    {!data?!error&&<LoadingState text="Loading quiz attempts…"/>:<>
      <h1 className="text-2xl font-bold">{data.quiz.title}</h1><p className="mt-2 text-sm text-slate-500">{data.attempts.length} attempts · {data.attempts.reduce((sum,a)=>sum+a.pending,0)} responses awaiting review</p>
      <div className="mt-6 grid min-w-0 gap-5 xl:grid-cols-[19rem_minmax(0,1fr)]">
        <Card className="min-w-0 self-start p-4"><label className="text-sm font-semibold">Submission status<Select className="mt-2" value={filter} onChange={e=>setFilter(e.target.value)}><option value="ALL">All attempts</option><option value="IN_PROGRESS">In progress</option><option value="SUBMITTED">Awaiting review</option><option value="GRADED">Graded</option></Select></label>
        <div className="mt-4 space-y-2">{data.attempts.filter(a=>filter==='ALL'||a.status===filter).map(a=><button key={a.id} type="button" aria-pressed={a.id===selected} onClick={()=>setSelected(a.id)} className={`w-full rounded-lg border p-3 text-left text-sm ${a.id===selected?'border-primary/40 bg-primary-subtle':'border-border'}`}>
          <strong className="block">{a.studentName}</strong><span className="mt-1 block">{a.status==='SUBMITTED'?'Awaiting review':a.status.replaceAll('_',' ')}</span>
          <span className="block text-xs text-slate-500">{a.status==='IN_PROGRESS'?'Not yet submitted':`${a.objectiveScore} / ${a.objectiveMax} objective · ${a.pending} need review`}</span>
          {a.submittedAt&&<time className="mt-1 block text-xs text-slate-500">{new Date(a.submittedAt).toLocaleString()}</time>}
        </button>)}{!data.attempts.length&&<p className="text-sm text-slate-500">No attempts yet.</p>}</div></Card>
        <section className="min-w-0 space-y-4" aria-label="Student attempt">
          {attempt&&<><Card className="p-5"><h2 className="text-lg font-bold">{attempt.studentName}</h2><p className="mt-1 text-sm">{attempt.status==='GRADED'?`Final score: ${attempt.score} / ${attempt.maxScore}`:attempt.status==='IN_PROGRESS'?'The student has not submitted this attempt.':`${attempt.pending} responses awaiting instructor review. Final score is pending.`}</p></Card>
          {attempt.responses.map(q=>{const row=rows.find(r=>r.attemptId===attempt.id&&r.questionId===q.questionId);return <Card key={q.questionId} className="min-w-0 p-5"><h3 className="font-bold">Question {q.order} · {q.maxPoints} points</h3>
            {q.manualGrading&&row?<AnswerReview key={row.id} row={row} refresh={refresh} onGrade={refresh} onUpdate={updated=>setRows(current=>current.map(r=>r.id===updated.id?updated:r))}/>:<><GeneratedContent markdown={q.prompt}/><p className="mt-3 text-xs font-semibold text-slate-500">Student answer</p><GeneratedContent markdown={q.answer||'Unanswered'}/><p className="mt-3 text-sm font-semibold">{q.isCorrect===true?'Correct':q.isCorrect===false?'Incorrect':'Awaiting review'} · {q.pointsAwarded??'—'} / {q.maxPoints}</p>{!q.manualGrading&&<><p className="mt-3 text-xs font-semibold text-slate-500">Correct answer</p><GeneratedContent markdown={q.correctAnswer}/></>}</>}
          </Card>;})}</>}
        </section>
      </div>
    </>}
  </DashboardLayout>;
}
