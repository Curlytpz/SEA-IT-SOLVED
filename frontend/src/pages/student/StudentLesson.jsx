import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import DashboardLayout from '../../layouts/DashboardLayout';
import { Alert, Badge, Btn, Card, EmptyState, LoadingState, PageHeader } from '../../components/ui';
import { ArrowLeft, BookOpen, Check, Download, Play } from '../../components/icons';
import GeneratedLessonDocument from '../../components/reasoning/GeneratedLessonDocument';
import { downloadStudentLesson, getStudentLesson, startQuizAttempt } from '../../services/phase6Api';
import { studentQuizInstructions, studentQuizTitle } from '../../utils/quizDisplay';

async function requestMessage(error, fallback) {
  const payload = error.response?.data;
  if (payload instanceof Blob) {
    try {
      const parsed = JSON.parse(await payload.text());
      if (parsed.error) return parsed.error;
    } catch {
      return fallback;
    }
  }
  return payload?.error || fallback;
}

export default function StudentLesson() {
  const { lessonId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quizBusy, setQuizBusy] = useState('');
  const [downloadBusy, setDownloadBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getStudentLesson(lessonId)
      .then(value => active && setData(value))
      .catch(requestError => active && setError(requestError.response?.data?.error || 'Unable to load this lesson.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [lessonId]);

  async function openQuiz(quiz) {
    if (!quiz.available) {
      setError(quiz.availabilityMessage || 'This quiz is currently unavailable.');
      return;
    }
    if (quiz.attempt?.id) {
      navigate(`/student/attempts/${quiz.attempt.id}`);
      return;
    }
    setQuizBusy(quiz.id);
    try {
      const result = await startQuizAttempt(quiz.id);
      navigate(`/student/attempts/${result.attempt.id}`);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Unable to start the quiz.');
    } finally {
      setQuizBusy('');
    }
  }

  async function downloadLesson(format) {
    setError('');
    setDownloadBusy(format);
    try {
      const { blob, filename } = await downloadStudentLesson(lessonId, format);
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (requestError) {
      setError(await requestMessage(requestError, `Unable to prepare the ${format.toUpperCase()} download. Please try again.`));
    } finally {
      setDownloadBusy('');
    }
  }

  if (loading) return <DashboardLayout><LoadingState text="Loading lesson…"/></DashboardLayout>;
  if (!data) return <DashboardLayout><Alert>{error}</Alert></DashboardLayout>;

  const hasMaterials = (data.document?.sections?.length ?? data.materials.length) > 0;
  return <DashboardLayout><div className="student-lesson-page">
    <Link to="/student" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300"><ArrowLeft size={17}/>Back to learning</Link>
    <PageHeader title={data.lesson.title} subtitle={`${data.lesson.subjectCode} • ${data.lesson.sectionName} • ${data.lesson.instructorName}`}><Badge status={data.lesson.status}/></PageHeader>
    {error && <Alert onClose={() => setError('')}>{error}</Alert>}

    <section className="student-lesson-content">
      <div className="student-lesson-material">
        <div className="student-section-heading student-lesson-material-heading">
          <div><h2>Lesson material</h2><p>Approved notes published by your instructor.</p></div>
          {hasMaterials && <div className="student-lesson-downloads" role="group" aria-label="Download lesson material">
            <Btn variant="outline" size="sm" disabled={Boolean(downloadBusy)} loading={downloadBusy === 'pdf'} loadingText="Preparing PDF…" onClick={() => downloadLesson('pdf')}><Download size={16}/>Download PDF</Btn>
            <Btn variant="outline" size="sm" disabled={Boolean(downloadBusy)} loading={downloadBusy === 'docx'} loadingText="Preparing DOCX…" onClick={() => downloadLesson('docx')}><Download size={16}/>Download DOCX</Btn>
          </div>}
        </div>
        {hasMaterials ? <GeneratedLessonDocument materials={data.materials} documentModel={data.document} audience="student" documentMeta={{ lessonTitle:data.lesson.title, subjectCode:data.lesson.subjectCode, subjectName:data.lesson.subjectName, sectionName:data.lesson.sectionName, instructorName:data.lesson.instructorName, lessonDate:data.lesson.startedAt || data.lesson.endedAt }}/>:<EmptyState icon={<BookOpen/>} title="No published material" body="Your instructor has not published lesson material yet."/>}
      </div>

      <div className="student-lesson-quizzes">
        <div className="student-section-heading"><div><h2>Lesson quizzes</h2><p>Published assessments and their current availability.</p></div></div>
        {data.quizzes.length ? <div className="student-available-quiz-grid">{data.quizzes.map(quiz => <Card key={quiz.id} className="student-available-quiz">
          <div className="flex items-start justify-between gap-3"><div><Badge status={quiz.studentStatus === 'SUBMITTED_AWAITING_REVIEW' ? 'SUBMITTED' : quiz.studentStatus}/><h3 className="mt-2 font-semibold text-slate-900 dark:text-white">{studentQuizTitle(quiz.title, data.lesson.title)}</h3><p className="mt-1 text-sm text-slate-500">{quiz.questionCount} questions</p></div>{quiz.attempt && ['SUBMITTED','GRADED'].includes(quiz.attempt.status) && <Check className="text-emerald-500"/>}</div>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{studentQuizInstructions(quiz.instructions, quiz.questionCount)}</p>
          {quiz.awaitingReview && <p className="mt-3 text-sm font-medium text-warning">Submitted · Awaiting instructor review</p>}
          {!quiz.available && <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">{quiz.availabilityMessage || 'This quiz is currently unavailable.'}</p>}
          <Btn className="mt-4 w-full" disabled={!quiz.available} loading={quizBusy === quiz.id} onClick={() => openQuiz(quiz)}><Play size={15}/>{!quiz.available ? 'Quiz not available yet' : quiz.studentStatus === 'IN_PROGRESS' ? 'Resume Quiz' : quiz.studentStatus === 'SUBMITTED_AWAITING_REVIEW' ? 'View Submission' : quiz.studentStatus === 'GRADED' ? 'View Results' : 'Answer Quiz'}</Btn>
        </Card>)}</div>:<Card className="p-6 text-center text-sm text-slate-500">No published quiz is available.</Card>}
      </div>
    </section>
  </div></DashboardLayout>;
}
