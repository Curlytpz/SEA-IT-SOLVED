import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../layouts/DashboardLayout';
import { Alert, Badge, Btn, Card, EmptyState, LoadingState, PageHeader, StatCard } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { BookOpen, Chart, Plus } from '../../components/icons';
import { getStudentLearning } from '../../services/phase6Api';
import { studentQuizTitle } from '../../utils/quizDisplay';
import { dashboardGreeting } from '../../utils/dashboardGreeting';

export default function StudentDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState({ lessons: [], recentResults: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const greeting = dashboardGreeting(user);

  useEffect(() => {
    getStudentLearning().then(setData).catch(e => setError(e.response?.data?.error || 'Unable to load your learning dashboard.')).finally(() => setLoading(false));
  }, []);

  const quizzes = data.lessons.reduce((sum, lesson) => sum + lesson.availableQuizzes, 0);

  return <DashboardLayout>
    <div className="student-dashboard-page">
    <PageHeader title={greeting.title} subtitle={[greeting.name, 'Your lessons, available quizzes, and recent results'].filter(Boolean).join(' • ')}>
      <Link to="/student/join-section"><Btn><Plus size={16}/>Join a Section</Btn></Link>
    </PageHeader>
    {error && <Alert>{error}</Alert>}
    {loading ? <LoadingState/> : <>
      <div className="student-stat-grid"><StatCard className="student-stat-card" value={data.lessons.length} label="Available Lessons"/><StatCard className="student-stat-card" value={quizzes} label="Available Quizzes"/><StatCard className="student-stat-card" value={data.recentResults.length} label="Recent Results"/></div>
      <section className="mt-8">
        <div className="student-section-heading"><div><h2 className="text-lg font-bold text-foreground">Available Lessons</h2><p className="mt-1 text-sm text-muted-foreground">Continue with a lesson from your enrolled sections.</p></div><Link to="/student/classes" className="shrink-0 text-sm font-semibold text-primary hover:text-primary-hover">My Classes <span aria-hidden="true">→</span></Link></div>
        {data.lessons.length ? <div className="student-lesson-grid">{data.lessons.map(lesson => <Link key={lesson.id} to={`/student/lessons/${lesson.id}`}><Card className="student-lesson-card"><div className="flex items-start justify-between gap-3"><span className="student-subject-label">{lesson.section.subjectCode}</span>{lesson.availableQuizzes > 0 && <Badge status="PUBLISHED"/>}</div><h3 className="mt-4 font-bold text-slate-900 dark:text-white">{lesson.title}</h3><p className="mt-1 text-sm text-slate-500">{lesson.section.subjectName} <span aria-hidden="true">·</span> {lesson.section.name}</p><p className="mt-2 text-xs text-slate-500">Instructor: {lesson.section.instructorName}</p><div className="student-lesson-meta"><span>{lesson.hasMaterials ? 'Lesson material available' : 'Quiz only'}</span><span>{lesson.availableQuizzes} available quiz{lesson.availableQuizzes === 1 ? '' : 'zes'}</span></div></Card></Link>)}</div> : <EmptyState icon={<BookOpen/>} title="No published lessons" body="Published lesson materials and quizzes from your enrolled sections will appear here."/>}
      </section>
      <section className="mt-8">
        <div className="student-section-heading"><div><h2 className="text-lg font-bold text-foreground">Recent Results</h2><p className="mt-1 text-sm text-muted-foreground">Your latest submitted quizzes.</p></div><Link to="/student/results" className="shrink-0 text-sm font-semibold text-primary hover:text-primary-hover">View history <span aria-hidden="true">→</span></Link></div>
        {data.recentResults.length ? <div className="student-result-list">{data.recentResults.map(result => <Link key={result.id} to={`/student/attempts/${result.id}`}><Card className="student-result-row"><div className="student-result-main"><h3 className="truncate font-semibold text-slate-900 dark:text-white">{studentQuizTitle(result.quizTitle,result.lessonTitle)}</h3><p className="text-xs text-slate-500">{result.subjectCode} <span aria-hidden="true">·</span> {new Date(result.submittedAt).toLocaleDateString('en-PH')}</p></div><div className="student-result-score"><strong className={result.status === 'SUBMITTED' ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'}>{result.score}/{result.maxScore}</strong><span>{result.status === 'SUBMITTED' ? 'Pending review' : `${result.percentage}%`}</span></div></Card></Link>)}</div> : <EmptyState icon={<Chart/>} title="No results yet" body="Submit a quiz to see your performance indicators."/>}
      </section>
    </>}
    </div>
  </DashboardLayout>;
}
