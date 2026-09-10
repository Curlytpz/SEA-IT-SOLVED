import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../layouts/DashboardLayout';
import { Alert, Badge, Card, EmptyState, LoadingState, PageHeader } from '../../components/ui';
import { Chart } from '../../components/icons';
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
      : <div className="student-history-grid">{attempts.map(attempt => <Link key={attempt.id} to={'/student/attempts/' + attempt.id}><Card className="student-history-card">
          <div className="student-history-heading"><div><span className="student-subject-label">{attempt.subjectCode}</span><h2 className="mt-3 font-bold text-slate-900 dark:text-white">{studentQuizTitle(attempt.quizTitle,attempt.lessonTitle)}</h2><p className="mt-1 text-sm text-slate-500">{attempt.lessonTitle} <span aria-hidden="true">·</span> {attempt.sectionName}</p></div><Badge status={attempt.status}/></div>
          <div className="student-history-details">
            <div><p className="text-xs font-semibold text-slate-500">Score</p><p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{attempt.score ?? '—'}<span className="text-base font-medium text-slate-400"> / {attempt.maxScore}</span></p></div>
            <div><p className="text-xs font-semibold text-slate-500">Result</p><p className={'mt-1 text-sm font-semibold ' + (attempt.status === 'SUBMITTED' ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300')}>{attempt.status === 'SUBMITTED' ? 'Awaiting professor review' : attempt.percentage + '%'}</p></div>
            <div className="student-history-date"><p className="text-xs font-semibold text-slate-500">Submitted</p><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{new Date(attempt.submittedAt).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'})}</p></div>
          </div>
          <span className="student-history-action">Review details <span aria-hidden="true">→</span></span>
        </Card></Link>)}</div>}
  </DashboardLayout>;
}
