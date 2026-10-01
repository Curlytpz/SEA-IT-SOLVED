import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../layouts/DashboardLayout';
import { DashboardLoadingState, DashboardStatusPanel, EmptyState, PageHeader, Btn, StatusChip } from '../../components/ui';
import api from '../../services/api';
import { BookOpen, Check, Clock, Plus, Users } from '../../components/icons';
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
  const reviewsKnown = ['pending', 'reviewed', 'empty'].includes(reviewSummary?.state);
  const reviewCount = reviewSummary?.state === 'pending' ? (Number(reviewSummary.count) || 0) : 0;
  const attentionCount = pending + reviewCount;
  const instructorStory = attentionCount > 0
    ? { title: attentionCount + (attentionCount === 1 ? ' item needs your attention' : ' items need your attention'), description: 'Review the listed requests or student solutions.' }
    : reviewsKnown
      ? { title: 'Nothing needs review', description: 'There are no pending join requests or solutions awaiting review.' }
      : { title: 'Review status loading', description: 'Checking student solutions awaiting review.' };

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
            indicator={<div role="img" aria-label={attentionCount > 0 ? attentionCount + ' teaching items need attention' : reviewsKnown ? 'Nothing needs review' : 'Review status loading'} className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-primary-subtle text-primary-subtle-foreground shadow-[var(--sh-inset)]">{attentionCount > 0 ? <Clock size={25} aria-hidden="true" /> : <Check size={25} aria-hidden="true" />}</div>}
            title={instructorStory.title}
            description={instructorStory.description}
            chip={attentionCount > 0
              ? reviewCount > 0
                ? <a href="#solutions-awaiting-review" className="inline-flex min-h-10 items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><StatusChip status="PENDING" label="Review solutions" /></a>
                : <Link to="/instructor/sections" className="inline-flex min-h-10 items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><StatusChip status="PENDING" label="Review requests" /></Link>
              : reviewsKnown
                ? <StatusChip status="READY" label="Nothing waiting" />
                : <StatusChip status="PROCESSING" label="Checking reviews" />}
            attentionItems={[
              ...(reviewCount > 0 ? [{ key: 'reviews', label: reviewCount + (reviewCount === 1 ? ' solution awaiting review' : ' solutions awaiting review'), href: '#solutions-awaiting-review' }] : []),
              ...(pending > 0 ? [{ key: 'requests', label: pending + (pending === 1 ? ' pending join request' : ' pending join requests'), to: '/instructor/sections' }] : []),
            ]}
            slots={[
              { key: 'sections', label: 'Active sections', value: sections.length, icon: <BookOpen size={15} aria-hidden="true" />, to: '/instructor/sections', hideStatus: true, chevron: true, ariaLabel: 'Open sections' },
              { key: 'students', label: 'Enrolled students', value: enrolled, icon: <Users size={15} aria-hidden="true" />, to: '/instructor/sections', hideStatus: true, chevron: true, ariaLabel: 'Open sections' },
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
                    <article key={sec.id} className="tactile-raised-card relative min-w-0 max-w-full overflow-hidden transition-transform duration-200 ease-[var(--ease-apple)] hover:-translate-y-px motion-reduce:transform-none motion-reduce:transition-none">
                      <Link to={`/instructor/sections/${sec.id}`} aria-label="Open section details" className="absolute inset-0 z-0 rounded-[28px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
                      <div className="relative z-[1] pointer-events-none p-6 pb-4 sm:px-7">
                        <div className="flex justify-end items-start mb-2">
                          {sec.pendingCount > 0 && (
                            <StatusChip status="PENDING" label={`${sec.pendingCount} pending`}/>
                          )}
                        </div>
                        <h3 className="font-semibold text-foreground text-base">{sec.subjectName}</h3>
                        <p className="mt-0.5 text-sm text-muted-foreground">{sec.sectionName}</p>
                        <div className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground"><Users size={14}/> {sec.enrolledCount} enrolled</div>
                      </div>
                      <div className="relative z-[1]"><ClassCode compact sectionId={sec.id} code={sec.joinCode} subjectCode={sec.subjectCode} sectionName={sec.sectionName} /></div>
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
