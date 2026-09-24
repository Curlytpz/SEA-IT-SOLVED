import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../layouts/DashboardLayout';
import { DashboardLoadingState, EmptyState, PageHeader, StatCard, Badge, Btn } from '../../components/ui';
import api from '../../services/api';
import { BookOpen, Plus, Users } from '../../components/icons';
import InstructorReviewQueue from '../../components/reasoning/InstructorReviewQueue';
import ClassCode from '../../components/sections/ClassCode';

export default function InstructorDashboard() {
  const [sections, setSections] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    api.get('/sections/instructor/sections').then(r=>setSections(r.data.data.sections)).catch(()=>{}).finally(()=>setLoading(false));
  }, []);

  const enrolled = sections.reduce((s,sec)=>s+(sec.enrolledCount||0),0);
  const pending  = sections.reduce((s,sec)=>s+(sec.pendingCount||0),0);

  return (
    <DashboardLayout>
      <PageHeader title="Teaching Overview" subtitle={loading ? 'Sections, enrollment, and work awaiting your attention.' : `${sections.length} active ${sections.length === 1 ? 'section' : 'sections'} • ${enrolled} enrolled ${enrolled === 1 ? 'student' : 'students'}${pending ? ` • ${pending} pending ${pending === 1 ? 'request' : 'requests'}` : ''}`}>
        <Link to="/instructor/sections"><Btn variant="primary"><Plus size={16}/> New Section</Btn></Link>
      </PageHeader>

      {loading ? <DashboardLoadingState /> : (
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
                  <h2 className="font-semibold text-foreground">Your Sections</h2>
                  <Link to="/instructor/sections" className="text-sm font-medium text-primary-subtle-foreground hover:text-primary-hover hover:underline dark:text-primary">View all →</Link>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {sections.slice(0,6).map(sec=>(
                    <article key={sec.id} className="min-w-0 max-w-full overflow-hidden rounded-xl border border-border bg-surface shadow-surface transition-[border-color,box-shadow,transform,background-color] duration-300 ease-[cubic-bezier(.16,1,.3,1)] hover:-translate-y-1 hover:border-primary/40 hover:bg-surface-elevated hover:shadow-glass motion-reduce:transform-none motion-reduce:transition-none">
                      <Link to={`/instructor/sections/${sec.id}`} className="block p-4 pb-3">
                        <div className="flex justify-between items-start mb-2">
                          <Badge status={sec.subjectCode||'SECTION'} />
                          {sec.pendingCount>0 && <span className="rounded-full bg-warning-subtle px-2 py-0.5 text-xs font-bold text-warning-subtle-foreground dark:bg-warning-subtle dark:text-warning-subtle-foreground">{sec.pendingCount} pending</span>}
                        </div>
                        <h3 className="font-semibold text-foreground text-sm">{sec.sectionName}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{sec.subjectName}</p>
                        <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground"><Users size={13}/> {sec.enrolledCount} enrolled</div>
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
