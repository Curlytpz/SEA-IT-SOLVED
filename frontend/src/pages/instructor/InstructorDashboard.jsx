import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../layouts/DashboardLayout';
import { DashboardLoadingState, DashboardStatusPanel, EmptyState, PageHeader, Badge, Btn, StatusChip } from '../../components/ui';
import api from '../../services/api';
import { BookOpen, Check, Plus, Users } from '../../components/icons';
import InstructorReviewQueue from '../../components/reasoning/InstructorReviewQueue';
import ClassCode from '../../components/sections/ClassCode';

export default function InstructorDashboard() {
  const [sections, setSections] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [reviewSummary, setReviewSummary] = useState(null);

  useEffect(() => {
    api.get('/sections/instructor/sections').then(r=>setSections(r.data.data.sections)).catch(()=>{}).finally(()=>setLoading(false));
  }, []);

  const enrolled = sections.reduce((s,sec)=>s+(sec.enrolledCount||0),0);
  const pending  = sections.reduce((s,sec)=>s+(sec.pendingCount||0),0);
  const reviewCount = reviewSummary?.state === 'pending' ? (Number(reviewSummary.count) || 0) : 0;
  const instructorStory = reviewCount > 0
    ? { title: reviewCount + (reviewCount === 1 ? ' solution needs review' : ' solutions need review'), description: 'Review the submitted student work when you’re ready.' }
    : pending > 0
      ? { title: pending + (pending === 1 ? ' request is waiting' : ' requests are waiting'), description: 'Review the pending section requests.' }
      : { title: 'You’re ready to teach', description: 'Nothing currently needs your attention.' };

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-[75rem]">
        <PageHeader title="Teaching Overview" subtitle={loading ? 'Sections, enrollment, and work awaiting your attention.' : `${sections.length} active ${sections.length === 1 ? 'section' : 'sections'} • ${enrolled} enrolled ${enrolled === 1 ? 'student' : 'students'}${pending ? ` • ${pending} pending ${pending === 1 ? 'request' : 'requests'}` : ''}`}>
          <Link to="/instructor/sections"><Btn variant="primary"><Plus size={16}/> New Section</Btn></Link>
        </PageHeader>

        {loading ? <DashboardLoadingState /> : (
          <>
          <DashboardStatusPanel
            className="mb-6"
            indicator={<div role="img" aria-label={reviewCount > 0 ? reviewCount + ' student solutions awaiting review' : pending > 0 ? pending + ' requests awaiting action' : 'No teaching tasks currently need attention'} className="grid h-32 w-32 shrink-0 place-items-center rounded-full bg-[var(--surface-2)] shadow-[var(--sh-inset)]"><div className="grid text-center">{reviewCount > 0 || pending > 0 ? <strong className="text-3xl font-semibold leading-none tabular-nums text-foreground">{reviewCount || pending}</strong> : <Check size={28} className="mx-auto text-success" aria-hidden="true" />}<span className="mt-1 text-[12px] font-medium text-muted-foreground">{reviewCount > 0 ? 'to review' : pending > 0 ? 'pending' : 'ready'}</span></div></div>}
            title={instructorStory.title}
            description={instructorStory.description}
            chip={reviewCount > 0
              ? <StatusChip status="PENDING" label="Solutions waiting" />
              : pending > 0
                ? <Link to="/instructor/sections" className="inline-flex min-h-10 items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><StatusChip status="PENDING" label="Review requests" /></Link>
                : <StatusChip status="READY" label="All caught up" />}
            slots={[
              { key: 'sections', label: 'Active sections', value: sections.length, status: 'Teaching', icon: <BookOpen size={15} aria-hidden="true" />, to: '/instructor/sections' },
              { key: 'students', label: 'Enrolled students', value: enrolled, status: enrolled === 1 ? '1 student' : enrolled + ' students', icon: <Users size={15} aria-hidden="true" />, to: '/instructor/sections' },
            ]}
          />

          <InstructorReviewQueue onSummaryChange={setReviewSummary} compactEmpty/>
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
