import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../layouts/DashboardLayout';
import { LoadingState, EmptyState, PageHeader, Badge, Btn, Card, Alert, TabBar } from '../../components/ui';
import api from '../../services/api';
import { BookOpen, ChevronDown, Plus } from '../../components/icons';
import { ContentTransition } from '../../components/PageTransition';
import { getStudentLearning } from '../../services/phase6Api';

export default function StudentClasses() {
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('APPROVED');
  const [error, setError] = useState('');
  const [lessons, setLessons] = useState([]);
  const [expandedSectionId, setExpandedSectionId] = useState(null);

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
              const sectionId = section.section.id;
              const expanded = expandedSectionId === sectionId;
              const sectionLessons = lessons.filter(lesson => lesson.section.id === sectionId);
              return <Card key={section.enrollmentId} className="p-0 transition-colors hover:border-primary/35">
                <button type="button" className="w-full p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" aria-expanded={expanded} aria-controls={`student-section-${sectionId}`} onClick={() => setExpandedSectionId(current => current === sectionId ? null : sectionId)}>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <span className="rounded-md bg-primary-subtle px-2 py-1 text-xs font-bold text-primary-subtle-foreground">{section.section.subjectCode}</span>
                    <Badge status={section.enrollmentStatus}/>
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">{section.section.sectionName}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{section.section.subjectName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Instructor: {section.section.instructorName}</p>
                  <div className="mt-4 flex items-end justify-between gap-3 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
                    <span>Requested {new Date(section.requestedAt).toLocaleDateString('en-PH', { month:'short', day:'numeric', year:'numeric' })}{section.approvedAt && <> · Enrolled {new Date(section.approvedAt).toLocaleDateString('en-PH', { month:'short', day:'numeric', year:'numeric' })}</>}</span>
                    <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-primary-subtle-foreground">{expanded ? 'Close' : 'Open'}<ChevronDown size={15} className={`transition-transform duration-200 motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`}/></span>
                  </div>
                </button>
                {section.section.instructorStatus && section.section.instructorStatus !== 'ACTIVE' && <Alert type="warning" className="mx-4 mt-0">This section is currently unavailable.</Alert>}
                {section.enrollmentStatus === 'PENDING' && <Alert type="pending" label="Enrollment status" className="mx-4 mb-4 mt-0">Your request has been sent to the instructor.</Alert>}
                {expanded && <div id={`student-section-${sectionId}`} className="border-t border-border bg-surface-subtle p-4">
                  {section.enrollmentStatus !== 'APPROVED'
                    ? <p className="text-sm text-muted-foreground">Lesson content becomes available after enrollment is approved.</p>
                    : section.section.instructorStatus && section.section.instructorStatus !== 'ACTIVE'
                      ? <p className="text-sm text-muted-foreground">Lesson content is unavailable while this section is inactive.</p>
                      : sectionLessons.length
                        ? <div><p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Available lessons</p><div className="grid gap-2">{sectionLessons.map(lesson => <Link key={lesson.id} to={`/student/lessons/${lesson.id}`} className="rounded-lg border border-border bg-card px-3 py-3 transition-colors hover:border-primary/40 hover:bg-primary-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="block font-semibold text-foreground">{lesson.title}</span><span className="mt-1 block text-xs text-muted-foreground">{lesson.availableQuizzes} available quiz{lesson.availableQuizzes === 1 ? '' : 'zes'}</span></Link>)}</div></div>
                        : <p className="text-sm text-muted-foreground">No published lessons are available in this section yet.</p>}
                </div>}
              </Card>;
            })}
          </div>}
    </ContentTransition>
  </DashboardLayout>;
}
