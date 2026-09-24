import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import DashboardLayout from '../../layouts/DashboardLayout';
import { Alert, Badge, Btn, Card, DashboardLoadingState, EmptyState, PageHeader, SectionHeading, StatCard } from '../../components/ui';
import { ArrowRight, BookOpen, Chart, Check, Play, Plus } from '../../components/icons';
import { getStudentLearning, startQuizAttempt } from '../../services/phase6Api';
import api from '../../services/api';
import GeneratedContent from '../../components/reasoning/GeneratedContent';
import { studentQuizTitle } from '../../utils/quizDisplay';
import { buildStudentClassGroups, classQuizStatus } from '../../utils/studentClassGroups';

const emptyDashboard = {
  summary: { availableLessons:0,pendingQuizzes:0,completedQuizzes:0,awaitingReviewQuizzes:0,gradedQuizzes:0 },
  lessons: [], quizzes: [], recentResults: [], sections: [],
};

function countLabel(count, singular, plural = singular + 's') {
  return `${count} ${count === 1 ? singular : plural}`;
}

export default function StudentDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [quizBusy, setQuizBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([
      getStudentLearning(),
      api.get('/sections/student/sections'),
    ])
      .then(([learning, sectionsResponse]) => {
        if (active) setData({ ...learning, sections: sectionsResponse.data.data.sections || [] });
      })
      .catch(requestError => { if (active) setError(requestError.response?.data?.error || 'Unable to load your learning dashboard.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

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
  const availableClasses = useMemo(
    () => buildStudentClassGroups(data.sections, data.lessons),
    [data.sections, data.lessons],
  );

  return <DashboardLayout>
    <div className="mx-auto w-full max-w-[1440px]">
      <PageHeader title="Learning Overview" subtitle={loading ? 'Classes, assessments, and recent performance.' : `${countLabel(availableClasses.length, 'class', 'classes')} • ${data.summary.availableLessons} published ${data.summary.availableLessons === 1 ? 'lesson' : 'lessons'} • ${data.summary.pendingQuizzes} ${data.summary.pendingQuizzes === 1 ? 'quiz' : 'quizzes'} to complete${data.summary.awaitingReviewQuizzes ? ` • ${data.summary.awaitingReviewQuizzes} awaiting review` : ''}`}>
        <Link to="/student/join-section"><Btn><Plus size={16}/>Join a Section</Btn></Link>
      </PageHeader>
      {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}
      {loading ? <DashboardLoadingState/> : <>
        <div className="grid gap-3 md:grid-cols-3">
          <StatCard className="min-h-[7.5rem] shadow-[0_2px_8px_rgba(15,23,42,.04)] [&>div:first-child]:text-4xl [&>div:first-child]:tabular-nums" value={availableClasses.length} label="Available Classes"/>
          <StatCard className="min-h-[7.5rem] shadow-[0_2px_8px_rgba(15,23,42,.04)] [&>div:first-child]:text-4xl [&>div:first-child]:tabular-nums" value={data.summary.pendingQuizzes} label="Pending Quizzes"/>
          <StatCard className="min-h-[7.5rem] shadow-[0_2px_8px_rgba(15,23,42,.04)] [&>div:first-child]:text-4xl [&>div:first-child]:tabular-nums" value={data.summary.completedQuizzes} label="Completed Quizzes"/>
        </div>

        <section className="mt-8">
          <SectionHeading title="Pending Quizzes" description="Assessments that still need your answer."/>
          {pendingQuizzes.length ? <div className="grid gap-2.5">{pendingQuizzes.map(quiz => <Card key={quiz.id} className="flex min-w-0 flex-col items-stretch justify-between gap-4 px-[1.1rem] py-4 md:flex-row md:items-center [&>button]:w-full md:[&>button]:w-auto">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge status={quiz.studentStatus}/><span className="inline-flex min-h-7 items-center rounded-[.45rem] border border-primary/20 bg-primary-subtle px-[.55rem] py-[.2rem] text-[.68rem] font-extrabold tracking-[.04em] text-primary-subtle-foreground dark:border-primary/35 dark:bg-primary/15">{quiz.section.subjectCode}</span></div><h3 className="mt-[.55rem] text-[.95rem] font-bold text-foreground"><GeneratedContent markdown={studentQuizTitle(quiz.title, quiz.lessonTitle)} quizText audience="student" inline/></h3><p className="mt-[.2rem] text-xs text-muted-foreground">{quiz.section.name} <span aria-hidden="true">·</span> <GeneratedContent markdown={quiz.lessonTitle} audience="student" inline/> <span aria-hidden="true">·</span> {countLabel(quiz.questionCount, 'question')}</p></div>
            <Btn loading={quizBusy === quiz.id} disabled={Boolean(quizBusy) && quizBusy !== quiz.id} onClick={() => openPendingQuiz(quiz)}><Play size={15}/>{quiz.studentStatus === 'IN_PROGRESS' ? 'Resume Quiz' : 'Answer Quiz'}</Btn>
          </Card>)}</div> : <Card className="grid min-h-[4.75rem] w-full min-w-0 grid-cols-[2.25rem_minmax(0,max-content)] content-center items-center justify-center gap-3 px-[1.1rem] py-[.9rem] text-left"><span className="grid h-9 w-9 place-items-center rounded-[.65rem] bg-success-subtle text-success" aria-hidden="true"><Check size={18}/></span><div className="min-w-0">{availableClasses.length === 0 ? <><h3 className="text-sm font-bold text-foreground">No classes available yet.</h3><p className="mt-[.1rem] text-xs text-muted-foreground">Join a section to receive lessons and quizzes.</p></> : data.summary.availableLessons === 0 ? <><h3 className="text-sm font-bold text-foreground">No published lessons yet.</h3><p className="mt-[.1rem] text-xs text-muted-foreground">Quizzes will appear after your instructor publishes lesson content.</p></> : <><h3 className="text-sm font-bold text-foreground">You're all caught up!</h3><p className="mt-[.1rem] text-xs text-muted-foreground">No quizzes are waiting for you right now.</p></>}</div></Card>}
        </section>

        <section className="mt-8">
          <SectionHeading title="Available Classes" description="Open a class to view its published lessons and quiz work." action={<Link to="/student/classes" className="text-sm font-semibold text-primary hover:text-primary-hover">View all classes <span aria-hidden="true">→</span></Link>}/>
          {availableClasses.length ? <div className="grid gap-3 md:grid-cols-2 min-[1101px]:grid-cols-3">{availableClasses.map(studentClass => {
            const { summary } = studentClass;
            return <Link
              key={studentClass.id}
              to={`/student/classes/${studentClass.id}`}
              aria-label={`View ${studentClass.subjectName}, ${studentClass.sectionName}`}
              className="group block h-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Card className="flex h-full min-h-64 flex-col p-5 transition-[transform,border-color,background-color,box-shadow] duration-300 ease-[cubic-bezier(.16,1,.3,1)] group-hover:-translate-y-1 group-hover:border-primary/45 group-hover:bg-surface-elevated group-hover:shadow-[0_18px_38px_-24px_hsl(var(--foreground)/.42)] group-active:translate-y-0 motion-reduce:transform-none motion-reduce:transition-none">
                <span className="inline-flex min-h-7 w-fit items-center rounded-[.45rem] border border-primary/20 bg-primary-subtle px-[.55rem] py-[.2rem] text-[.68rem] font-extrabold tracking-[.04em] text-primary-subtle-foreground dark:border-primary/35 dark:bg-primary/15">{studentClass.subjectCode}</span>
                <h3 className="mt-4 text-lg font-bold text-foreground transition-colors duration-300 group-hover:text-primary-subtle-foreground">{studentClass.subjectName}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{studentClass.sectionName} <span aria-hidden="true">·</span> {studentClass.instructorName}</p>
                <div className="mt-4 grid grid-cols-2 gap-3 border-y border-border py-4 text-sm">
                  <div><p className="text-xs font-semibold uppercase tracking-[.04em] text-muted-foreground">Lessons</p><p className="mt-1 font-bold text-foreground">{summary.lessonCount}</p></div>
                  <div><p className="text-xs font-semibold uppercase tracking-[.04em] text-muted-foreground">Quiz status</p><p className="mt-1 font-semibold text-foreground">{classQuizStatus(summary)}</p></div>
                </div>
                <div className="mt-4 min-h-10 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-[.04em] text-muted-foreground">Latest lesson</p>
                  {studentClass.latestLesson
                    ? <p className="mt-1 line-clamp-2 font-semibold text-foreground"><GeneratedContent markdown={studentClass.latestLesson.title} audience="student" inline/></p>
                    : <p className="mt-1 text-muted-foreground">No published lessons yet.</p>}
                </div>
                <span className="mt-auto inline-flex items-center justify-between gap-3 pt-5 text-sm font-bold text-primary-subtle-foreground">
                  View Class
                  <ArrowRight size={17} className="transition-transform duration-300 ease-[cubic-bezier(.16,1,.3,1)] group-hover:translate-x-1 motion-reduce:transform-none"/>
                </span>
              </Card>
            </Link>;
          })}</div> : <EmptyState icon={<BookOpen/>} title="No classes available yet." body="Join a section and wait for instructor approval to see it here."/>}
        </section>

        <section className="mt-8">
          <SectionHeading title="Recent Results" description="Recent submissions and released quiz results." action={<Link to="/student/results" className="text-sm font-semibold text-primary hover:text-primary-hover">View history <span aria-hidden="true">→</span></Link>}/>
          {data.recentResults.length ? <div className="grid gap-2">{data.recentResults.map(result => <Link key={result.id} to={`/student/attempts/${result.id}`}><Card interactive className="group grid min-h-[4.5rem] min-w-0 grid-cols-1 items-start gap-4 px-[1.1rem] py-[.85rem] text-left md:grid-cols-[minmax(0,1fr)_auto] md:items-center"><div className="min-w-0 text-left"><div className="flex w-full min-w-0 flex-wrap items-center justify-start gap-2"><Badge status={result.status}/><h3 className="truncate font-semibold text-foreground"><GeneratedContent markdown={studentQuizTitle(result.quizTitle,result.lessonTitle)} quizText audience="student" inline/></h3></div><p className="mt-1 text-left text-xs text-muted-foreground">{result.subjectCode} <span aria-hidden="true">·</span> Submitted {new Date(result.submittedAt).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'})}</p></div><div className="grid min-w-0 justify-items-start gap-[.15rem] text-left md:min-w-32 md:justify-items-end md:text-right">{result.status === 'SUBMITTED' ? <><strong className="text-base tabular-nums text-warning">Awaiting Review</strong><span className="text-xs font-semibold text-muted-foreground">Instructor grading pending</span></> : <><strong className="text-base tabular-nums text-success">{result.score}/{result.maxScore}</strong><span className="text-xs font-semibold text-muted-foreground">{result.percentage}% <span aria-hidden="true">·</span> <span className="text-primary-subtle-foreground group-hover:underline group-hover:underline-offset-[3px]">View Results</span></span></>}</div></Card></Link>)}</div> : <EmptyState icon={<Chart/>} title="No results yet" body="Submit a quiz to see your performance indicators."/>}
        </section>
      </>}
    </div>
  </DashboardLayout>;
}
