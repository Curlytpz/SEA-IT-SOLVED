import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Btn, Card, Select } from '../ui';
import { sectionOriginState, sectionReturnPath } from '../../utils/instructorLessonNavigation';

export default function SectionReviews({ sectionId, data, loading, error, onRetry }) {
  const [status,setStatus]=useState('ALL');
  const [quizId,setQuizId]=useState('');
  if (loading && !data) return <p className="py-10 text-center text-sm text-slate-500">Loading section reviews…</p>;
  if (error && !data) return <Alert type="error" title="Reviews could not be loaded" actions={<Btn variant="secondary" size="sm" onClick={onRetry}>Retry</Btn>}>{error}</Alert>;
  const summary=data?.summary||{pendingResponses:0,submittedAttempts:0,gradedAttempts:0};
  const quizzes=data?.quizzes||[];
  const visible=quizzes.filter(quiz=>(!quizId||quiz.quizId===quizId)
    &&(status==='ALL'||status==='AWAITING'&&quiz.pendingResponses>0||status==='GRADED'&&quiz.submittedAttempts>0&&quiz.pendingResponses===0));
  const noSubmissions=!quizzes.some(quiz=>quiz.submittedAttempts>0);
  const reviewsReturnTo=sectionReturnPath(sectionId,'reviews');
  const reviewsOriginState=sectionOriginState(null,reviewsReturnTo);
  return <section aria-labelledby="section-reviews-title">
    <div className="mb-5"><h2 id="section-reviews-title" className="text-lg font-bold text-slate-900 dark:text-white">Quiz Reviews</h2><p className="mt-1 text-sm text-slate-500">Submitted work requiring instructor assessment in this section.</p></div>
    <div className="grid gap-3 sm:grid-cols-3">
      {[['Awaiting Review',summary.pendingResponses,'responses'],['Submitted Attempts',summary.submittedAttempts,'attempts'],['Graded',summary.gradedAttempts,'attempts']].map(([label,value,unit])=><Card key={label} className="p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{value}</p><p className="text-xs text-slate-500">{unit}</p></Card>)}
    </div>
    {!noSubmissions&&summary.pendingResponses===0&&<Alert type="success" label="Review status" title="All caught up" className="mb-0 mt-5">There are no submitted manual responses waiting for review.</Alert>}
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-semibold">Status<Select className="mt-2" value={status} onChange={event=>setStatus(event.target.value)}><option value="ALL">All</option><option value="AWAITING">Awaiting Review</option><option value="GRADED">Graded</option></Select></label>
      <label className="text-sm font-semibold">Quiz<Select className="mt-2" value={quizId} onChange={event=>setQuizId(event.target.value)}><option value="">All quizzes</option>{quizzes.map(quiz=><option key={quiz.quizId} value={quiz.quizId}>{quiz.title}</option>)}</Select></label>
    </div>
    {noSubmissions?<div className="mt-5 rounded-xl border border-slate-200 p-5 dark:border-slate-700"><p className="font-semibold">No quiz submissions yet.</p><p className="mt-1 text-sm text-slate-500">Published quizzes and their attempts will appear here when students submit.</p></div>:
      <div className="mt-5 space-y-3">{visible.map(quiz=><Card key={quiz.quizId} className="p-4 sm:p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-slate-900 dark:text-white">{quiz.title}</h3><span className="text-xs font-semibold text-slate-500">{quiz.status}</span></div><p className="mt-1 text-sm text-slate-500">Lesson: <Link className="font-semibold text-primary-subtle-foreground hover:underline" to={`/instructor/lessons/${quiz.lessonId}/review?view=workspace`} state={reviewsOriginState}>{quiz.lessonTitle}</Link></p><p className="mt-3 text-sm text-slate-700 dark:text-slate-300">{quiz.submittedAttempts} submitted {quiz.submittedAttempts===1?'attempt':'attempts'} · {quiz.pendingResponses?quiz.pendingResponses+' awaiting review':'All reviewed'} · {quiz.problemSolvingQuestions} Problem Solving {quiz.problemSolvingQuestions===1?'question':'questions'}</p></div><Link to={`/instructor/quizzes/${quiz.quizId}/attempts`} state={{...reviewsOriginState,from:reviewsReturnTo}} className="shrink-0"><Btn>{quiz.pendingResponses?'Review Attempts':'View Attempts'}</Btn></Link></div></Card>)}
      {!visible.length&&<p className="rounded-xl border border-slate-200 p-5 text-sm text-slate-500 dark:border-slate-700">No quizzes match these review filters.</p>}</div>}
  </section>;
}
