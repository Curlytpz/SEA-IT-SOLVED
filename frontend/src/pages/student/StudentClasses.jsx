import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../layouts/DashboardLayout';
import { LoadingState, EmptyState, PageHeader, Badge, Btn, Card, Alert, TabBar } from '../../components/ui';
import api from '../../services/api';
import { BookOpen, Plus } from '../../components/icons';
import { ContentTransition } from '../../components/PageTransition';

export default function StudentClasses() {
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('APPROVED');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.get('/sections/student/sections')
      .then(response => { if (active) setSections(response.data.data.sections); })
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
            {filtered.map(section => <Card key={section.enrollmentId} className="p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <span className="rounded-md bg-primary-subtle px-2 py-1 text-xs font-bold text-primary-subtle-foreground">{section.section.subjectCode}</span>
                <Badge status={section.enrollmentStatus}/>
              </div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{section.section.sectionName}</h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{section.section.subjectName}</p>
              <p className="mt-1 text-xs text-slate-500">Instructor: {section.section.instructorName}</p>
              {section.section.instructorStatus && section.section.instructorStatus !== 'ACTIVE' && <Alert type="warning" className="mt-3">This section is currently unavailable.</Alert>}
              <div className="mt-4 border-t border-slate-200 pt-3 text-xs leading-5 text-slate-500 dark:border-slate-700">
                Requested {new Date(section.requestedAt).toLocaleDateString('en-PH', { month:'short', day:'numeric', year:'numeric' })}
                {section.approvedAt && <> · Enrolled {new Date(section.approvedAt).toLocaleDateString('en-PH', { month:'short', day:'numeric', year:'numeric' })}</>}
              </div>
              {section.enrollmentStatus === 'PENDING' && <Alert type="pending" label="Enrollment status" className="mb-0 mt-3">Your request has been sent to the instructor.</Alert>}
            </Card>)}
          </div>}
    </ContentTransition>
  </DashboardLayout>;
}
