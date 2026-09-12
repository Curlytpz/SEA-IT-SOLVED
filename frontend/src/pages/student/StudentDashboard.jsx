import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import DashboardLayout from '../../layouts/DashboardLayout';
import { Alert, Badge, Btn, Card, EmptyState, LoadingState, PageHeader, StatCard } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { BookOpen, Chart, Check, Play, Plus } from '../../components/icons';
import { getStudentLearning, startQuizAttempt } from '../../services/phase6Api';
import { studentQuizTitle } from '../../utils/quizDisplay';
import { dashboardGreeting } from '../../utils/dashboardGreeting';

const emptyDashboard = {
  summary: { availableLessons:0,pendingQuizzes:0,completedQuizzes:0,awaitingReviewQuizzes:0,gradedQuizzes:0 },
  lessons: [], quizzes: [], recentResults: [],
};

function countLabel(count, singular, plural = singular + 's') {
  return `${count} ${count === 1 ? singular : plural}`;
}

function lessonQuizSummary(lesson) {
  if (lesson.pendingQuizzes > 0) return countLabel(lesson.pendingQuizzes, 'quiz to answer', 'quizzes to answer');
  if (lesson.awaitingReviewQuizzes > 0) return `${lesson.awaitingReviewQuizzes === 1 ? '✓ Quiz submitted' : `✓ ${lesson.awaitingReviewQuizzes} quizzes submitted`} · Awaiting instructor review`;
  if (lesson.gradedQuizzes > 0) return lesson.gradedQuizzes === 1 ? '✓ Quiz answered' : `✓ ${lesson.gradedQuizzes} quizzes answered`;
  return 'No quiz currently available';
}

function lessonBadgeStatus(lesson) {
  if (lesson.pendingQuizzes > 0) return 'AVAILABLE';
  if (lesson.awaitingReviewQuizzes > 0) return 'SUBMITTED';
  if (lesson.gradedQuizzes > 0) return 'GRADED';
  return null;
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [quizBusy, setQuizBusy] = useState('');
  const [error, setError] = useState('');
  const [greeting] = useState(() => dashboardGreeting(user));

  useEffect(() => {
    let active = true;
    getStudentLearning()
      .then(value => { if (active) setData(value); })
      .catch(requestError => { if (active) setError(requestError.response?.data?.error || 'Unable to load your learning dashboard.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.id]);

  async function openPendingQuiz(quiz) {
    if (!quiz.canAttempt || quizBusy) return;
    if (quiz.attempt?.id) {
      navigate(`/student/attempts/${quiz.attempt.id}`);
      return;
    }
    setQuizBusy(quiz.id);
    setError('');
    try {
      const result = await startQuizAttempt(quiz.id);
      navigate(`/student/attempts/${result.attempt.id}`);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Unable to start the quiz.');
    } finally {
      setQuizBusy('');
    }
  }

  const pendingQuizzes = data.quizzes.filter(quiz => quiz.canAttempt);

  return <DashboardLayout>
    <div className="student-dashboard-page">
      <PageHeader title={greeting.title} subtitle={greeting.subtitle}>
        <Link to="/student/join-section"><Btn><Plus size={16}/>Join a Section</Btn></Link>
      </PageHeader>
      {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}
      {loading ? <LoadingState/> : <>
        <div className="student-stat-grid">
          <StatCard className="student-stat-card" value={data.summary.availableLessons} label="Available Lessons"/>
          <StatCard className="student-stat-card" value={data.summary.pendingQuizzes} label="Pending Quizzes"/>
          <StatCard className="student-stat-card" value={data.summary.completedQuizzes} label="Completed Quizzes"/>
        </div>

        <section className="mt-8">
          <div className="student-section-heading"><div><h2 className="text-lg font-bold text-foreground">Pending Quizzes</h2><p className="mt-1 text-sm text-muted-foreground">Assessments that still need your answer.</p></div></div>
          {pendingQuizzes.length ? <div className="student-pending-quiz-list">{pendingQuizzes.map(quiz => <Card key={quiz.id} className="student-pending-quiz-row">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge status={quiz.studentStatus}/><span className="student-subject-label">{quiz.section.subjectCode}</span></div><h3>{studentQuizTitle(quiz.title, quiz.lessonTitle)}</h3><p>{quiz.section.name} <span aria-hidden="true">·</span> {quiz.lessonTitle} <span aria-hidden="true">·</span> {countLabel(quiz.questionCount, 'question')}</p></div>
            <Btn loading={quizBusy === quiz.id} disabled={Boolean(quizBusy) && quizBusy !== quiz.id} onClick={() => openPendingQuiz(quiz)}><Play size={15}/>{quiz.studentStatus === 'IN_PROGRESS' ? 'Resume Quiz' : 'Answer Quiz'}</Btn>
          </Card>)}</div> : <Card className="student-dashboard-compact-empty"><span className="student-dashboard-compact-empty-icon" aria-hidden="true"><Check size={18}/></span><div><h3>You're all caught up!</h3><p>No quizzes are waiting for you right now.</p></div></Card>}
        </section>

        <section className="mt-8">
          <div className="student-section-heading"><div><h2 className="text-lg font-bold text-foreground">Available Lessons</h2><p className="mt-1 text-sm text-muted-foreground">Study published material and see each lesson's quiz status.</p></div><Link to="/student/classes" className="shrink-0 text-sm font-semibold text-primary hover:text-primary-hover">My Classes <span aria-hidden="true">→</span></Link></div>
          {data.lessons.length ? <div className="student-lesson-grid">{data.lessons.map(lesson => {
            const pendingQuiz = lesson.quizzes.find(quiz => quiz.canAttempt);
            const badgeStatus = lessonBadgeStatus(lesson);
            return <Card key={lesson.id} className="student-lesson-card">
              <div className="flex items-start justify-between gap-3"><span className="student-subject-label">{lesson.section.subjectCode}</span>{badgeStatus && <Badge status={badgeStatus}/>}</div>
              <h3 className="mt-4 font-bold text-foreground">{lesson.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{lesson.section.subjectName} <span aria-hidden="true">·</span> {lesson.section.name}</p>
              <p className="mt-2 text-xs text-muted-foreground">Instructor: {lesson.section.instructorName}</p>
              <div className="student-lesson-meta"><span>{lesson.hasMaterials ? 'Lesson material available' : 'Quiz only'}</span><span>{lessonQuizSummary(lesson)}</span></div>
              <div className="student-lesson-actions"><Btn variant="secondary" size="sm" onClick={() => navigate(`/student/lessons/${lesson.id}`)}>Open Lesson</Btn>{pendingQuiz && <Btn size="sm" loading={quizBusy === pendingQuiz.id} disabled={Boolean(quizBusy) && quizBusy !== pendingQuiz.id} onClick={() => openPendingQuiz(pendingQuiz)}>{pendingQuiz.studentStatus === 'IN_PROGRESS' ? 'Resume Quiz' : 'Answer Quiz'}</Btn>}</div>
            </Card>;
          })}</div> : <EmptyState icon={<BookOpen/>} title="No published lessons" body="Published lesson materials and quizzes from your enrolled sections will appear here."/>}
        </section>

        <section className="mt-8">
          <div className="student-section-heading"><div><h2 className="text-lg font-bold text-foreground">Recent Results</h2><p className="mt-1 text-sm text-muted-foreground">Recent submissions and released quiz results.</p></div><Link to="/student/results" className="shrink-0 text-sm font-semibold text-primary hover:text-primary-hover">View history <span aria-hidden="true">→</span></Link></div>
          {data.recentResults.length ? <div className="student-result-list">{data.recentResults.map(result => <Link key={result.id} to={`/student/attempts/${result.id}`}><Card className="student-result-row"><div className="student-result-main"><div className="flex flex-wrap items-center gap-2"><Badge status={result.status}/><h3 className="truncate font-semibold text-foreground">{studentQuizTitle(result.quizTitle,result.lessonTitle)}</h3></div><p className="mt-1 text-xs text-muted-foreground">{result.subjectCode} <span aria-hidden="true">·</span> Submitted {new Date(result.submittedAt).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'})}</p></div><div className="student-result-score">{result.status === 'SUBMITTED' ? <><strong className="text-warning">Awaiting Review</strong><span>Instructor grading pending</span></> : <><strong className="text-success">{result.score}/{result.maxScore}</strong><span>{result.percentage}% <span aria-hidden="true">·</span> <span className="student-result-action">View Results</span></span></>}</div></Card></Link>)}</div> : <EmptyState icon={<Chart/>} title="No results yet" body="Submit a quiz to see your performance indicators."/>}
        </section>
      </>}
    </div>
  </DashboardLayout>;
}
