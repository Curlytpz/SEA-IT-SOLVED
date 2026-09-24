import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../layouts/DashboardLayout';
import { Alert, Badge, Card, EmptyState, LoadingState, PageHeader } from '../../components/ui';
import { Chart } from '../../components/icons';
import GeneratedContent from '../../components/reasoning/GeneratedContent';
import { getQuizHistory } from '../../services/phase6Api';
import { studentQuizTitle } from '../../utils/quizDisplay';

export default function StudentQuizHistory() {
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getQuizHistory()
      .then(value => { if (active) setAttempts(value); })
      .catch(requestError => { if (active) setError(requestError.response?.data?.error || 'Unable to load your quiz history.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return <DashboardLayout>
    <PageHeader title="Quiz Results" subtitle="Your submitted quiz history"/>
    {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}
    {loading ? <LoadingState text="Loading quiz results…"/> : !attempts.length
      ? <EmptyState icon={<Chart/>} title="No submitted quizzes" body="Your quiz results will appear here after submission."/>
      : <div className="grid gap-3">{attempts.map(attempt => <Link key={attempt.id} to={'/student/attempts/' + attempt.id}><Card className="grid items-center gap-4 px-[1.35rem] py-[1.15rem] transition-colors hover:border-primary/35 md:grid-cols-[minmax(0,1.25fr)_minmax(18rem,1fr)] min-[1101px]:grid-cols-[minmax(0,1.5fr)_minmax(22rem,1fr)_auto] min-[1101px]:gap-6">
          <div className="min-w-0"><div><span className="inline-flex min-h-7 items-center rounded-[.45rem] border border-primary/20 bg-primary-subtle px-[.55rem] py-[.2rem] text-[.68rem] font-extrabold tracking-[.04em] text-primary-subtle-foreground dark:border-primary/35 dark:bg-primary/15">{attempt.subjectCode}</span><h2 className="mt-3 truncate font-bold text-foreground"><GeneratedContent markdown={studentQuizTitle(attempt.quizTitle,attempt.lessonTitle)} quizText audience="student" inline/></h2><p className="mt-1 text-sm text-muted-foreground"><GeneratedContent markdown={attempt.lessonTitle} audience="student" inline/> <span aria-hidden="true">·</span> {attempt.sectionName}</p></div><Badge status={attempt.status}/></div>
          <div className="grid grid-cols-2 gap-4 min-[1101px]:grid-cols-3">
            <div><p className="text-xs font-semibold text-muted-foreground">Score</p><p className="mt-1 text-2xl font-bold tabular-nums text-foreground dark:text-foreground">{attempt.score ?? '—'}<span className="text-base font-medium text-muted-foreground"> / {attempt.maxScore}</span></p></div>
            <div><p className="text-xs font-semibold text-muted-foreground">Result</p><p className={'mt-1 text-sm font-semibold ' + (attempt.status === 'SUBMITTED' ? 'text-warning-subtle-foreground dark:text-warning-subtle-foreground' : 'text-success-subtle-foreground dark:text-success-subtle-foreground')}>{attempt.status === 'SUBMITTED' ? 'Awaiting professor review' : attempt.percentage + '%'}</p></div>
            <div className="min-w-28"><p className="text-xs font-semibold text-muted-foreground">Submitted</p><p className="mt-1 text-sm text-muted-foreground dark:text-muted-foreground">{new Date(attempt.submittedAt).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'})}</p></div>
          </div>
          <span className="justify-self-start whitespace-nowrap text-[.8rem] font-bold text-primary-subtle-foreground md:col-start-2 md:justify-self-end min-[1101px]:col-auto">Review details <span aria-hidden="true">→</span></span>
        </Card></Link>)}</div>}
  </DashboardLayout>;
}
