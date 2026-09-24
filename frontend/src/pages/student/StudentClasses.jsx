import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import DashboardLayout from '../../layouts/DashboardLayout';
import { LoadingState, EmptyState, PageHeader, SectionHeading, Badge, Btn, Card, Alert, TabBar, BackButton } from '../../components/ui';
import api from '../../services/api';
import { ArrowRight, BookOpen, Plus } from '../../components/icons';
import { ContentTransition } from '../../components/PageTransition';
import { getStudentLearning } from '../../services/phase6Api';
import GeneratedContent from '../../components/reasoning/GeneratedContent';
import { classQuizStatus, lessonQuizStatus, summarizeClassLessons } from '../../utils/studentClassGroups';

export default function StudentClasses() {
  const { sectionId } = useParams();
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('APPROVED');
  const [error, setError] = useState('');
  const [lessons, setLessons] = useState([]);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get('/sections/student/sections'),
      getStudentLearning(),
    ])
      .then(([response, learning]) => {
        if (!active) return;
        setSections(response.data.data.sections);
        setLessons(learning.lessons || []);
      })
      .catch(requestError => { if (active) setError(requestError.response?.data?.error || 'Unable to load your classes.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const counts = {
    APPROVED: sections.filter(section => section.enrollmentStatus === 'APPROVED').length,
    PENDING: sections.filter(section => section.enrollmentStatus === 'PENDING').length,
    REJECTED: sections.filter(section => section.enrollmentStatus === 'REJECTED').length,
  };
  const filtered = filter === 'ALL' ? sections : sections.filter(section => section.enrollmentStatus === filter);
  const tabs = [
    { key: 'APPROVED', label: 'Enrolled (' + counts.APPROVED + ')' },
    { key: 'PENDING', label: 'Pending (' + counts.PENDING + ')' },
    { key: 'REJECTED', label: 'Rejected (' + counts.REJECTED + ')' },
    { key: 'ALL', label: 'All' },
  ];

  const lessonsBySection = useMemo(() => {
    const grouped = new Map();
    for (const lesson of lessons) {
      if (!grouped.has(lesson.section.id)) grouped.set(lesson.section.id, []);
      grouped.get(lesson.section.id).push(lesson);
    }
    return grouped;
  }, [lessons]);

  const selectedEnrollment = sectionId
    ? sections.find(section => section.section.id === sectionId)
    : null;

  if (sectionId) {
    const selectedLessons = lessonsBySection.get(sectionId) || [];
    const selectedSection = selectedEnrollment?.section;

    return <DashboardLayout>
      <div className="mx-auto w-full max-w-5xl">
        <BackButton to="/student/classes">Back to My Classes</BackButton>
        <PageHeader
          title={selectedSection?.subjectName || (loading ? 'Loading class…' : 'Class unavailable')}
          subtitle={selectedSection ? `${selectedSection.sectionName} · ${selectedSection.instructorName}` : 'This class could not be found in your enrollments.'}
        >
          {selectedEnrollment && (
            <Badge status={selectedEnrollment.enrollmentStatus}/>
          )}
        </PageHeader>
        {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}
        {loading ? <LoadingState text="Loading class lessons…"/> : !selectedEnrollment
          ? <EmptyState icon={<BookOpen/>} title="Class unavailable" body="This class is not part of your current enrollments.">
              <Link to="/student/classes"><Btn size="sm" variant="secondary">Return to My Classes</Btn></Link>
            </EmptyState>
          : <>
              {selectedSection.instructorStatus && selectedSection.instructorStatus !== 'ACTIVE' && <Alert type="warning">This section is currently unavailable.</Alert>}
              {selectedEnrollment.enrollmentStatus !== 'APPROVED' && <Alert type="pending" label="Enrollment status">Lesson content becomes available after your enrollment is approved.</Alert>}
              <section className="mt-6">
                <SectionHeading title="Lessons" description="Published material and quiz status for this class."/>
                {selectedEnrollment.enrollmentStatus !== 'APPROVED'
                  ? null
                  : selectedLessons.length
                    ? <div className="grid gap-3">{selectedLessons.map((lesson, index) => <Link
                        key={lesson.id}
                        to={`/student/lessons/${lesson.id}`}
                        className="group rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        aria-label={`Open lesson ${lesson.title}`}
                      >
                        <Card className="grid min-w-0 gap-4 p-4 transition-[transform,border-color,background-color,box-shadow] duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:bg-surface-elevated group-hover:shadow-surface sm:grid-cols-[3.25rem_minmax(0,1fr)_auto] sm:items-center motion-reduce:transform-none motion-reduce:transition-none">
                          <span className="grid h-11 w-11 place-items-center rounded-lg border border-primary/20 bg-primary-subtle text-sm font-extrabold tabular-nums text-primary-subtle-foreground">{String(index + 1).padStart(2, '0')}</span>
                          <div className="min-w-0">
                            <h3 className="font-bold text-foreground"><GeneratedContent markdown={lesson.title} audience="student" inline/></h3>
                            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <span>{lesson.hasMaterials ? 'Material available' : 'Quiz only'}</span>
                              <span aria-hidden="true">·</span>
                              <span>{lessonQuizStatus(lesson)}</span>
                            </div>
                          </div>
                          <span className="inline-flex items-center gap-2 text-sm font-bold text-primary-subtle-foreground">Open Lesson <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transform-none"/></span>
                        </Card>
                      </Link>)}</div>
                    : <EmptyState icon={<BookOpen/>} title="No published lessons yet." body="Published lessons from this class will appear here."/>}
              </section>
            </>}
      </div>
    </DashboardLayout>;
  }

  return <DashboardLayout>
    <PageHeader title="My Classes" subtitle="Sections you have requested or joined">
      <Link to="/student/join-section"><Btn size="sm"><Plus size={14}/> Join Section</Btn></Link>
    </PageHeader>
    {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}
    <TabBar tabs={tabs} active={filter} onChange={setFilter} label="Enrollment status"/>
    <ContentTransition transitionKey={filter + '-' + loading}>
      {loading ? <LoadingState text="Loading your classes…"/> : filtered.length === 0
        ? <EmptyState icon={<BookOpen size={23}/>} title={'No ' + (filter === 'ALL' ? '' : filter.toLowerCase() + ' ') + 'sections'} body={filter === 'APPROVED' ? 'You are not enrolled in any sections yet.' : 'No sections match this enrollment status.'}>
            {filter !== 'ALL' && <Link to="/student/join-section"><Btn size="sm">Find a Section</Btn></Link>}
          </EmptyState>
        : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map(section => {
              const currentSectionId = section.section.id;
              const sectionLessons = lessonsBySection.get(currentSectionId) || [];
              const summary = summarizeClassLessons(sectionLessons);
              const approved = section.enrollmentStatus === 'APPROVED';
              const classCard = <Card className={`flex h-full min-h-64 flex-col p-5 ${approved ? 'transition-[transform,border-color,background-color,box-shadow] duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:bg-surface-elevated group-hover:shadow-surface motion-reduce:transform-none motion-reduce:transition-none' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <span className="rounded-md bg-primary-subtle px-2 py-1 text-xs font-bold text-primary-subtle-foreground">{section.section.subjectCode}</span>
                  <Badge status={section.enrollmentStatus}/>
                </div>
                <h3 className="mt-4 text-lg font-bold text-foreground">{section.section.subjectName}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{section.section.sectionName} <span aria-hidden="true">·</span> {section.section.instructorName}</p>
                {approved ? <>
                  <div className="mt-4 grid grid-cols-2 gap-3 border-y border-border py-4 text-sm">
                    <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lessons</p><p className="mt-1 font-bold text-foreground">{summary.lessonCount}</p></div>
                    <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quiz status</p><p className="mt-1 font-semibold text-foreground">{classQuizStatus(summary)}</p></div>
                  </div>
                  <div className="mt-4 text-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Latest lesson</p>
                    {sectionLessons[0]
                      ? <p className="mt-1 line-clamp-2 font-semibold text-foreground"><GeneratedContent markdown={sectionLessons[0].title} audience="student" inline/></p>
                      : <p className="mt-1 text-muted-foreground">No published lessons yet.</p>}
                  </div>
                  <span className="mt-auto inline-flex items-center justify-between gap-3 pt-5 text-sm font-bold text-primary-subtle-foreground">View Class <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transform-none"/></span>
                </> : <div className="mt-auto pt-5 text-sm text-muted-foreground">
                  {section.enrollmentStatus === 'PENDING' ? 'Your request is waiting for instructor approval.' : 'This enrollment request was not approved.'}
                </div>}
              </Card>;

              return approved
                ? <Link key={section.enrollmentId} to={`/student/classes/${currentSectionId}`} className="group block h-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">{classCard}</Link>
                : <div key={section.enrollmentId}>{classCard}</div>;
            })}
          </div>}
    </ContentTransition>
  </DashboardLayout>;
}
