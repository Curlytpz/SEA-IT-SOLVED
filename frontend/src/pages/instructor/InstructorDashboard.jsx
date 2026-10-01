import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../layouts/DashboardLayout';
import { DashboardLoadingState, EmptyState, PageHeader, StatCard, Badge, Btn, StatusChip } from '../../components/ui';
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
      <div className="mx-auto w-full max-w-[75rem]">
        <PageHeader title="Teaching Overview" subtitle={loading ? 'Sections, enrollment, and work awaiting your attention.' : `${sections.length} active ${sections.length === 1 ? 'section' : 'sections'} • ${enrolled} enrolled ${enrolled === 1 ? 'student' : 'students'}${pending ? ` • ${pending} pending ${pending === 1 ? 'request' : 'requests'}` : ''}`}>
          <Link to="/instructor/sections"><Btn variant="primary"><Plus size={16}/> New Section</Btn></Link>
        </PageHeader>

        {loading ? <DashboardLoadingState /> : (
          <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard value={sections.length} label="Active Sections" />
            <StatCard value={enrolled} label="Enrolled Students" />
            <StatCard value={pending} label={pending > 0 ? 'Pending requests' : 'All caught up'} accent={pending>0?'#f59e0b':undefined} className={pending === 0 ? 'opacity-80' : ''} />
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
                    <article key={sec.id} className="min-w-0 max-w-full overflow-hidden rounded-[1.25rem] border border-white/60 bg-surface shadow-[var(--neu-shadow-raised-sm)] transition-[border-color,box-shadow,transform,background-color] duration-200 ease-[var(--ease-apple)] hover:-translate-y-px hover:border-primary/40 hover:bg-surface-elevated hover:shadow-[var(--neu-shadow-raised)] dark:border-border/80 motion-reduce:transform-none motion-reduce:transition-none">
                      <Link to={`/instructor/sections/${sec.id}`} className="block p-4 pb-3">
                        <div className="flex justify-between items-start mb-2">
                          <Badge status={sec.subjectCode||'SECTION'} />
                          {sec.pendingCount > 0 && (
                            <StatusChip status="PENDING" label={`${sec.pendingCount} pending`}/>
                          )}
                        </div>
                        <h3 className="font-semibold text-foreground text-base">{sec.subjectName}</h3>
                        <p className="mt-0.5 text-sm text-muted-foreground">{sec.sectionName}</p>
                        <div className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground"><Users size={14}/> {sec.enrolledCount} enrolled</div>
                      </Link>
                      <ClassCode compact sectionId={sec.id} code={sec.joinCode} subjectCode={sec.subjectCode} sectionName={sec.sectionName} />
                    </article>
                  ))}
                </div>
              </>
            )
          }
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
