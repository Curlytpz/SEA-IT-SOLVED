import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Btn, Card, Select, StatusChip } from '../ui';
import { sectionOriginState, sectionReturnPath } from '../../utils/instructorLessonNavigation';
import GeneratedContent from './GeneratedContent';
import { Check, Clock } from '../icons';

export default function SectionReviews({ sectionId, data, loading, error, onRetry }) {
  const [status,setStatus]=useState('ALL');
  const [quizId,setQuizId]=useState('');
  if (loading && !data) return <p className="py-10 text-center text-sm text-muted-foreground">Loading section reviews…</p>;
  if (error && !data) return <Alert type="error" title="Reviews could not be loaded" actions={<Btn variant="secondary" size="sm" onClick={onRetry}>Retry</Btn>}>{error}</Alert>;
  const summary=data?.summary||{pendingResponses:0,submittedAttempts:0,gradedAttempts:0};
  const quizzes=data?.quizzes||[];
  const visible=quizzes.filter(quiz=>(!quizId||quiz.quizId===quizId)
    &&(status==='ALL'||status==='AWAITING'&&quiz.pendingResponses>0||status==='GRADED'&&quiz.submittedAttempts>0&&quiz.pendingResponses===0));
  const noSubmissions=!quizzes.some(quiz=>quiz.submittedAttempts>0);
  const reviewsReturnTo=sectionReturnPath(sectionId,'reviews');
  const reviewsOriginState=sectionOriginState(null,reviewsReturnTo);
  const submittedAttempts=Math.max(0,Number(summary.submittedAttempts)||0);
  const awaitingResponses=Math.max(0,Number(summary.pendingResponses)||0);
  const gradedAttempts=Math.max(0,Number(summary.gradedAttempts)||0);
  const gradedWidth=submittedAttempts?Math.min(100,(gradedAttempts/submittedAttempts)*100):0;
  const awaitingWidth=submittedAttempts?Math.min(100-gradedWidth,(awaitingResponses/submittedAttempts)*100):0;
  const nextReview=quizzes.find(quiz=>quiz.pendingResponses>0);
  const reviewHeadline=noSubmissions?'No submitted work yet':awaitingResponses===0?'All submitted work is graded':`${awaitingResponses} responses need review`;
  return <section aria-labelledby="section-reviews-title">
    <Card className="tactile-raised-card p-5 sm:p-6">
      <div className="flex flex-col justify-between gap-3 min-[820px]:flex-row min-[820px]:items-start">
        <div><h2 id="section-reviews-title" className="text-[22px] font-[650] leading-tight tracking-[-.02em] text-foreground">Quiz Reviews</h2><p className="mt-1 text-sm text-muted-foreground">{reviewHeadline}</p></div>
        <div className="flex flex-wrap items-center gap-2"><StatusChip status={noSubmissions?'INFO':awaitingResponses?'PENDING':'READY'} label={noSubmissions?'No submissions':awaitingResponses?`${awaitingResponses} awaiting review`:'All graded'} />{awaitingResponses>0&&nextReview&&<Link to={`/instructor/quizzes/${nextReview.quizId}/attempts`} state={{...reviewsOriginState,from:reviewsReturnTo}}><Btn>Review now</Btn></Link>}</div>
      </div>
      <div className="mt-5 tactile-inset-well px-4 py-4" role="img" aria-label={`${gradedAttempts} graded and ${awaitingResponses} awaiting review out of ${submittedAttempts} submitted attempts.`}>
        <div className="flex h-3 overflow-hidden rounded-full bg-[var(--surface-2)] shadow-[var(--sh-inset)]">
          <span className="bg-teal-500 transition-[width] duration-500 motion-reduce:transition-none" style={{width:`${gradedWidth}%`}}/>
          <span className="bg-primary/35 transition-[width] duration-500 motion-reduce:transition-none" style={{width:`${awaitingWidth}%`}}/>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[12px] font-semibold text-muted-foreground"><span className="inline-flex items-center gap-1.5"><Check size={14} aria-hidden="true" className="text-teal-600 dark:text-teal-300"/>Graded: {gradedAttempts}</span><span className="inline-flex items-center gap-1.5"><Clock size={14} aria-hidden="true" className="text-primary"/>Awaiting review: {awaitingResponses}</span><span>Submitted attempts: {submittedAttempts}</span></div>
      </div>
    </Card>
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-semibold">Status<Select className="mt-2 max-w-sm" value={status} onChange={event=>setStatus(event.target.value)}><option value="ALL">All</option><option value="AWAITING">Awaiting review</option><option value="GRADED">Graded</option></Select></label>
      <label className="text-sm font-semibold">Quiz<Select className="mt-2 max-w-sm" value={quizId} onChange={event=>setQuizId(event.target.value)}><option value="">All quizzes</option>{quizzes.map(quiz=><option key={quiz.quizId} value={quiz.quizId}>{quiz.title}</option>)}</Select></label>
    </div>
    {noSubmissions?<div className="mt-5 rounded-xl border border-border p-5 dark:border-border"><p className="font-semibold">No quiz submissions yet.</p><p className="mt-1 text-sm text-muted-foreground">Published quizzes and their attempts will appear here when students submit.</p></div>:
      <div className="mt-5 space-y-3">{visible.map(quiz=><Card key={quiz.quizId} className="p-4 sm:p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-foreground dark:text-foreground"><GeneratedContent markdown={quiz.title} quizText inline/></h3><StatusChip status={quiz.status}/></div><p className="mt-1 text-sm text-muted-foreground">Lesson: <Link className="font-semibold text-primary-subtle-foreground hover:underline" to={`/instructor/lessons/${quiz.lessonId}/review?view=workspace`} state={reviewsOriginState}><GeneratedContent markdown={quiz.lessonTitle} inline/></Link></p><p className="mt-3 text-sm text-foreground dark:text-muted-foreground">{quiz.submittedAttempts} submitted {quiz.submittedAttempts===1?'attempt':'attempts'} · {quiz.pendingResponses?quiz.pendingResponses+' awaiting review':'All reviewed'} · {quiz.problemSolvingQuestions} problem solving {quiz.problemSolvingQuestions===1?'question':'questions'}</p></div><Link to={`/instructor/quizzes/${quiz.quizId}/attempts`} state={{...reviewsOriginState,from:reviewsReturnTo}} className="shrink-0"><Btn>{quiz.pendingResponses?'Review attempts':'View attempts'}</Btn></Link></div></Card>)}
      {!visible.length&&<p className="rounded-xl border border-border p-5 text-sm text-muted-foreground dark:border-border">No quizzes match these review filters.</p>}</div>}
  </section>;
}
