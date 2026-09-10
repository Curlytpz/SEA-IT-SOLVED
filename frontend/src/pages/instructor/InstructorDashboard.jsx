import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../layouts/DashboardLayout';
import { Alert, LoadingState, EmptyState, PageHeader, StatCard, Badge, Btn } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { BookOpen, Plus, Users } from '../../components/icons';
import { dashboardGreeting } from '../../utils/dashboardGreeting';
import InstructorReviewQueue from '../../components/reasoning/InstructorReviewQueue';
import ClassCode from '../../components/sections/ClassCode';

export default function InstructorDashboard() {
  const { user } = useAuth();
  const [sections, setSections] = useState([]);
  const [loading, setLoading]   = useState(true);
  const greeting = dashboardGreeting(user);

  useEffect(() => {
    api.get('/sections/instructor/sections').then(r=>setSections(r.data.data.sections)).catch(()=>{}).finally(()=>setLoading(false));
  }, []);

  if (user.status === 'PENDING') return (
    <DashboardLayout>
      <Alert type="pending" label="Account status" title="Awaiting approval" className="mt-6 max-w-lg">Your instructor account is pending administrator approval. You will gain access to your dashboard once an admin reviews your registration.</Alert>
    </DashboardLayout>
  );

  const enrolled = sections.reduce((s,sec)=>s+(sec.enrolledCount||0),0);
  const pending  = sections.reduce((s,sec)=>s+(sec.pendingCount||0),0);

  return (
    <DashboardLayout>
      <PageHeader title={greeting.title} subtitle={[greeting.name, 'Instructor Dashboard'].filter(Boolean).join(' • ')}>
        <Link to="/instructor/sections"><Btn variant="primary"><Plus size={16}/> New Section</Btn></Link>
      </PageHeader>

      {loading ? <LoadingState /> : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard value={sections.length} label="Active Sections" />
            <StatCard value={enrolled} label="Enrolled Students" />
            <StatCard value={pending} label="Pending Requests" accent={pending>0?'#f59e0b':undefined} />
          </div>

          <InstructorReviewQueue/>
          {sections.length===0
            ? <EmptyState icon={<BookOpen size={23}/>} title="No sections yet" body="Create your first section to get started.">
                <Link to="/instructor/sections"><Btn variant="primary">Create Section</Btn></Link>
              </EmptyState>
            : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-slate-800">Your Sections</h2>
                  <Link to="/instructor/sections" className="text-sm font-medium text-primary-subtle-foreground hover:text-primary-hover hover:underline dark:text-primary">View all →</Link>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {sections.slice(0,6).map(sec=>(
                    <article key={sec.id} className="glass-panel interactive-card overflow-hidden rounded-2xl hover:border-primary/35 hover:shadow-glass">
                      <Link to={`/instructor/sections/${sec.id}`} className="block p-4 pb-3">
                        <div className="flex justify-between items-start mb-2">
                          <Badge status={sec.subjectCode||'SECTION'} />
                          {sec.pendingCount>0 && <span className="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{sec.pendingCount} pending</span>}
                        </div>
                        <h3 className="font-semibold text-slate-800 text-sm">{sec.sectionName}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">{sec.subjectName}</p>
                        <div className="mt-3 flex items-center gap-1 text-xs text-slate-500"><Users size={13}/> {sec.enrolledCount} enrolled</div>
                      </Link>
                      <ClassCode compact code={sec.joinCode} subjectCode={sec.subjectCode} sectionName={sec.sectionName} />
                    </article>
                  ))}
                </div>
              </>
            )
          }
        </>
      )}
    </DashboardLayout>
  );
}
