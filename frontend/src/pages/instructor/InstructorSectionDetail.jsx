import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import DashboardLayout from '../../layouts/DashboardLayout';
import { BackButton, LoadingState, EmptyState, PageHeader, Alert, Btn, Badge, ConfirmModal, TabBar, Card, FormField, Input } from '../../components/ui';
import LessonEditModal from '../../components/LessonEditModal';
import api from '../../services/api';
import { getSectionAudioRecordings } from '../../services/audioRecordingApi';
import LessonRecordingControl from '../../components/hardware/LessonRecordingControl';
import { BookOpen, Chart, Check, CircleX, Pencil, Play, Plus, Scan, Trash, Users } from '../../components/icons';
import { ContentTransition } from '../../components/PageTransition';
import SectionAnalytics from '../../components/analytics/SectionAnalytics';
import ClassCode from '../../components/sections/ClassCode';
import SectionReviews from '../../components/reasoning/SectionReviews';
import { getInstructorSectionReviews } from '../../services/phase6Api';
import { sectionOriginState, sectionReturnPath } from '../../utils/instructorLessonNavigation';
import { formatLessonDuration, lessonPrimaryAction } from '../../utils/lessonWorkflow';

const MOBILE_RECORD_CARD = [
  'min-w-0 rounded-xl border border-border bg-surface p-[.9rem]',
  '[&_header]:flex [&_header]:min-w-0 [&_header]:items-start [&_header]:justify-between [&_header]:gap-3',
  '[&_header_p]:text-[.7rem] [&_header_p]:font-[650] [&_header_p]:text-muted-foreground',
  '[&_header_h3]:mt-[.15rem] [&_header_h3]:break-words [&_header_h3]:text-[.9rem] [&_header_h3]:font-bold [&_header_h3]:leading-[1.35] [&_header_h3]:text-foreground',
  '[&_header>span]:shrink-0 [&_header>span]:text-[.72rem] [&_header>span]:font-[650] [&_header>span]:text-slate-600 dark:[&_header>span]:text-slate-300',
  '[&_dl]:my-[.85rem] [&_dl]:grid [&_dl]:gap-[.65rem] [&_dl_div]:min-w-0',
  '[&_dt]:text-[.68rem] [&_dt]:font-[650] [&_dt]:text-muted-foreground',
  '[&_dd]:mt-[.12rem] [&_dd]:break-words [&_dd]:text-[.82rem] [&_dd]:leading-[1.45] [&_dd]:text-slate-700 dark:[&_dd]:text-slate-200',
].join(' ');

export default function InstructorSectionDetail() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [section, setSection] = useState(null);
  const [tab, setTab] = useState(() => {
    const requested = new URLSearchParams(location.search).get('tab');
    return ['students', 'pending', 'lessons', 'reviews', 'analytics'].includes(requested) ? requested : 'students';
  });
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [reviews,setReviews]=useState(null);
  const [reviewsLoading,setReviewsLoading]=useState(true);
  const [reviewsError,setReviewsError]=useState('');
  const [navigationWarning, setNavigationWarning] = useState(()=>location.state?.warning||'');

  const loadSection = useCallback(async () => {
    try { const { data } = await api.get(`/sections/${id}`); setSection(data.data.section); }
    catch(err) { setError(err.response?.data?.error||'Failed to load section.'); }
    finally { setLoading(false); }
  }, [id]);

  const loadReviews=useCallback(async()=>{setReviewsLoading(true);try{setReviews(await getInstructorSectionReviews(id));setReviewsError('');}catch(err){setReviewsError(err.response?.data?.error||'Unable to load section reviews.');}finally{setReviewsLoading(false);}},[id]);
  useEffect(() => { loadSection(); loadReviews(); }, [loadSection,loadReviews]);
  useEffect(() => {
    const requested = new URLSearchParams(location.search).get('tab');
    if (['students', 'pending', 'lessons', 'reviews', 'analytics'].includes(requested)) setTab(requested);
  }, [location.search]);

  const changeTab = useCallback(nextTab => {
    setTab(nextTab);
    const search = new URLSearchParams(location.search);
    search.set('tab', nextTab);
    navigate({ pathname: location.pathname, search: `?${search.toString()}` }, { replace: true });
  }, [location.pathname, location.search, navigate]);

  if (loading) return <DashboardLayout><LoadingState /></DashboardLayout>;
  if (error)   return <DashboardLayout><Alert type="error">{error}</Alert></DashboardLayout>;

  const tabs = [
    { key:'students', label:'Students', badge: section.enrolledCount },
    { key:'pending',  label:'Pending Requests', badge: section.pendingCount },
    { key:'lessons',  label:'Lessons' },
    { key:'reviews', label:'Reviews', badge: reviews?.summary.pendingResponses || undefined },
    { key:'analytics',label:'Analytics' },
  ];

  return (
    <DashboardLayout>
      <div className="mb-4">
        <BackButton to="/instructor/sections" className="mb-0 sm:hidden">My Teaching</BackButton>
        <div className="hidden text-xs text-muted-foreground sm:block">
          <Link to="/instructor/sections" className="text-primary-subtle-foreground hover:text-primary-hover hover:underline dark:text-primary">My Teaching</Link>
          {' / '}{section.sectionName}
        </div>
      </div>

      <div className="mb-5 flex min-w-0 flex-col items-start justify-between gap-3 sm:flex-row">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge status={section.subjectCode} />
          </div>
          <h1 className="text-xl font-bold text-foreground">{section.sectionName}</h1>
          <p className="text-sm text-muted-foreground">{section.subjectName}</p>
          <ClassCode code={section.joinCode} subjectCode={section.subjectCode} sectionName={section.sectionName} />
        </div>
        <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground sm:justify-end">
          <span>👥 {section.enrolledCount} enrolled</span>
          {section.pendingCount>0 && <span className="text-warning-subtle-foreground font-semibold">⏳ {section.pendingCount} pending</span>}
        </div>
      </div>

      {navigationWarning&&<Alert type="warning" onClose={()=>setNavigationWarning('')}>{navigationWarning}</Alert>}

      <TabBar tabs={tabs} active={tab} onChange={changeTab} />

      <ContentTransition transitionKey={tab}>
        {tab==='students'  && <StudentsTab sectionId={id} onAction={loadSection} />}
        {tab==='pending'   && <PendingTab sectionId={id} onAction={loadSection} />}
        {tab==='lessons'   && <LessonsTab sectionId={id} section={section} />}
        {tab==='reviews' && <SectionReviews sectionId={id} data={reviews} loading={reviewsLoading} error={reviewsError} onRetry={loadReviews}/>}
        {tab==='analytics' && <SectionAnalytics sectionId={id}/>}
      </ContentTransition>
    </DashboardLayout>
  );
}

// ── Students Tab ─────────────────────────────────────────────────────────────
function StudentsTab({ sectionId, onAction }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [confirm, setConfirm]   = useState(null);
  const [rl, setRl]             = useState({});
  const [showAdd, setShowAdd]   = useState(false);
  const [addNum, setAddNum]     = useState('');
  const [addLoading, setAddL]   = useState(false);
  const [msg, setMsg]           = useState({ text:'', type:'success' });

  const load = useCallback(async () => {
    setLoading(true);
    api.get(`/sections/${sectionId}/students`).then(r=>setStudents(r.data.data.students)).catch(()=>{}).finally(()=>setLoading(false));
  }, [sectionId]);

  useEffect(() => { load(); }, [load]);

  function notify(text, type='success') { setMsg({ text, type }); setTimeout(()=>setMsg({text:''}),4000); }

  function handleRecordingDeleted(recordingId) { setRecordings(current=>current.filter(recording=>recording.id!==recordingId)); notify('Audio recording deleted.'); }

  async function handleRemove(s) {
    setConfirm(null); setRl(p=>({...p,[s.id]:true}));
    try { await api.delete(`/sections/${sectionId}/students/${s.id}`); notify('Student removed.'); load(); onAction(); }
    catch(err) { notify(err.response?.data?.error||'Remove failed.','error'); }
    finally { setRl(p=>({...p,[s.id]:false})); }
  }

  async function handleAdd(e) {
    e.preventDefault(); if (!addNum.trim()) return;
    setAddL(true);
    try { await api.post(`/sections/${sectionId}/students`, { studentNumber: addNum.trim() }); notify('Student added.'); setAddNum(''); setShowAdd(false); load(); onAction(); }
    catch(err) { notify(err.response?.data?.error||'Add failed.','error'); }
    finally { setAddL(false); }
  }

  if (loading) return <LoadingState />;

  return (
    <>
      {msg.text && <Alert type={msg.type} onClose={()=>setMsg({text:''})}>{msg.text}</Alert>}
      <div className="flex justify-end mb-3">
        <Btn variant="secondary" size="sm" onClick={()=>setShowAdd(v=>!v)}>{showAdd?<><CircleX size={14}/> Cancel</>:<><Plus size={14}/> Add Student</>}</Btn>
      </div>
      {showAdd && (
        <Card className="p-4 mb-4">
          <h3 className="font-semibold text-foreground mb-3">Manually Add Student</h3>
          <form onSubmit={handleAdd} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1"><FormField label="Student Number"><Input value={addNum} onChange={e=>setAddNum(e.target.value)} placeholder="e.g. 2021-00001" required /></FormField></div>
            <Btn variant="primary" size="sm" type="submit" loading={addLoading} className="sm:mb-4">Add</Btn>
          </form>
          <p className="text-xs text-muted-foreground">The student must have a registered account. Enrollment will be set to Approved immediately.</p>
        </Card>
      )}
      {students.length===0
        ? <EmptyState icon={<Users size={23}/>} title="No enrolled students" body="Approve pending requests or add a student manually." />
        : (
          <>
          <div className="mobile-record-list grid gap-3 sm:hidden" aria-label="Enrolled students">
            {students.map(s=><article key={s.id} className={MOBILE_RECORD_CARD}>
              <header><div className="min-w-0"><p>Student</p><h3>{s.lastName}, {s.firstName}</h3></div><span>{s.studentNumber||'No student number'}</span></header>
              <dl>
                <div><dt>Email</dt><dd>{s.email}</dd></div>
                <div><dt>Enrolled</dt><dd>{new Date(s.approvedAt).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'})}</dd></div>
              </dl>
              <Btn variant="danger" size="sm" loading={rl[s.id]} className="w-full" onClick={()=>setConfirm(s)}>Remove Student</Btn>
            </article>)}
          </div>
          <div className="scrollbar-hidden hidden max-w-full overflow-x-auto rounded-xl border border-border bg-surface shadow-sm [-webkit-overflow-scrolling:touch] sm:block">
            <table className="w-full text-sm">
              <thead><tr className="bg-surface-subtle border-b border-border">
                {['#','Name','Student No.','Email','Enrolled',''].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-border">
                {students.map((s,i)=>(
                  <tr key={s.id} className="hover:bg-surface-subtle/60">
                    <td className="px-4 py-3 text-muted-foreground font-semibold">{i+1}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{s.lastName}, {s.firstName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.studentNumber||'—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.email}</td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(s.approvedAt).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'})}</td>
                    <td className="px-4 py-3"><Btn variant="danger" size="sm" loading={rl[s.id]} onClick={()=>setConfirm(s)}>Remove</Btn></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )
      }
      {confirm && <ConfirmModal title="Remove this student from the section?" body={`This will remove ${confirm.firstName} ${confirm.lastName}'s access to this class, but their account will remain.`} confirmLabel="Remove Student" confirmVariant="danger" onConfirm={()=>handleRemove(confirm)} onCancel={()=>setConfirm(null)} />}
    </>
  );
}

// ── Pending Tab ───────────────────────────────────────────────────────────────
function PendingTab({ sectionId, onAction }) {
  const [requests, setReqs] = useState([]);
  const [loading, setL]     = useState(true);
  const [al, setAl]         = useState({});
  const [msg, setMsg]       = useState('');

  const load = useCallback(async () => {
    setL(true); api.get(`/sections/${sectionId}/join-requests`).then(r=>setReqs(r.data.data.requests)).catch(()=>{}).finally(()=>setL(false));
  }, [sectionId]);

  useEffect(()=>{ load(); },[load]);

  async function handle(id, action) {
    setAl(p=>({...p,[id]:action}));
    try { await api.patch(`/enrollments/${id}/${action}`); setMsg(`Student ${action}d.`); setReqs(p=>p.filter(r=>r.enrollmentId!==id)); onAction(); }
    catch(err) { setMsg(err.response?.data?.error||'Action failed.'); }
    finally { setAl(p=>({...p,[id]:null})); }
  }

  if (loading) return <LoadingState />;

  return (
    <>
      {msg && <Alert type="success" onClose={()=>setMsg('')}>{msg}</Alert>}
      {requests.length===0
        ? <EmptyState icon={<Check size={23}/>} title="No pending requests" body="All join requests have been reviewed." />
        : (
          <>
          <div className="mobile-record-list grid gap-3 sm:hidden" aria-label="Pending enrollment requests">
            {requests.map(r=><article key={r.enrollmentId} className={MOBILE_RECORD_CARD}>
              <header><div className="min-w-0"><p>Pending student</p><h3>{r.student.lastName}, {r.student.firstName}</h3></div><span>{r.student.studentNumber||'No student number'}</span></header>
              <dl>
                <div><dt>Email</dt><dd>{r.student.email}</dd></div>
                <div><dt>Requested</dt><dd>{new Date(r.requestedAt).toLocaleDateString('en-PH',{month:'short',day:'numeric'})}</dd></div>
              </dl>
              <div className="grid grid-cols-2 gap-2">
                <Btn variant="success" size="sm" loading={al[r.enrollmentId]==='approve'} onClick={()=>handle(r.enrollmentId,'approve')}><Check size={14}/> Approve</Btn>
                <Btn variant="danger" size="sm" loading={al[r.enrollmentId]==='reject'} onClick={()=>handle(r.enrollmentId,'reject')}><CircleX size={14}/> Reject</Btn>
              </div>
            </article>)}
          </div>
          <div className="scrollbar-hidden hidden max-w-full overflow-x-auto rounded-xl border border-border bg-surface shadow-sm [-webkit-overflow-scrolling:touch] sm:block">
            <table className="w-full text-sm">
              <thead><tr className="bg-surface-subtle border-b border-border">
                {['Name','Student No.','Email','Requested','Actions'].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-border">
                {requests.map(r=>(
                  <tr key={r.enrollmentId} className="hover:bg-surface-subtle/60">
                    <td className="px-4 py-3 font-semibold text-foreground">{r.student.lastName}, {r.student.firstName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.student.studentNumber||'—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.student.email}</td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(r.requestedAt).toLocaleDateString('en-PH',{month:'short',day:'numeric'})}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <Btn variant="success" size="sm" loading={al[r.enrollmentId]==='approve'} onClick={()=>handle(r.enrollmentId,'approve')}><Check size={14}/> Approve</Btn>
                        <Btn variant="danger" size="sm" loading={al[r.enrollmentId]==='reject'} onClick={()=>handle(r.enrollmentId,'reject')}><CircleX size={14}/> Reject</Btn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )
      }
    </>
  );
}

// ── Lessons Tab ───────────────────────────────────────────────────────────────
function LessonsTab({ sectionId }) {
  const navigate = useNavigate();
  const lessonsReturnTo = sectionReturnPath(sectionId, 'lessons');
  const lessonsOriginState = sectionOriginState(null, lessonsReturnTo);
  const [lessons, setLessons]   = useState([]);
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ title:'', topic:'' });
  const [createL, setCL]        = useState(false);
  const [msg, setMsg]           = useState({ text:'', type:'success' });
  const [editing, setEditing]   = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [lessonResponse, savedRecordings] = await Promise.all([
        api.get(`/sections/${sectionId}/lessons`),
        getSectionAudioRecordings(sectionId),
      ]);
      setLessons(lessonResponse.data.data.lessons);
      setRecordings(savedRecordings);
    } catch {
      setMsg({text:'Unable to load lesson history.',type:'error'});
    } finally {
      setLoading(false);
    }
  }, [sectionId]);

  useEffect(()=>{ load(); },[load]);

  function notify(text, type='success') { setMsg({ text, type }); setTimeout(()=>setMsg({text:''}),4000); }

  function handleRecordingDeleted(recordingId) { setRecordings(current=>current.filter(recording=>recording.id!==recordingId)); notify('Audio recording deleted.'); }

  const currentLesson = lessons.find(l=>l.status==='ACTIVE'||l.status==='PAUSED');
  const hasOngoing    = !!currentLesson;

  async function handleCreate(e) {
    e.preventDefault(); if (!form.title.trim()) return;
    setCL(true);
    try { await api.post(`/sections/${sectionId}/lessons`, { title: form.title.trim(), topic: form.topic.trim()||undefined }); setForm({title:'',topic:''}); setShowForm(false); notify('Lesson created.'); load(); }
    catch(err) { notify(err.response?.data?.error||'Create failed.','error'); }
    finally { setCL(false); }
  }

  function handleStart(l) { navigate(`/instructor/lessons/${l.id}/active`); }

  async function handleDelete() {
    if (!deleteTarget || deleteLoading) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/lessons/${deleteTarget.id}`);
      setDeleteTarget(null);
      notify('Lesson deleted.');
      await load();
    } catch(err) {
      notify(err.response?.data?.error||'Delete failed.','error');
    } finally {
      setDeleteLoading(false);
    }
  }

  function handleSaved(updated) {
    setLessons(current=>current.map(lesson=>lesson.id===updated.id ? {...lesson,...updated} : lesson));
    setEditing(null);
    notify('Lesson updated.');
  }

  const created   = lessons.filter(l=>l.status==='CREATED');
  const completed = lessons.filter(l=>l.status==='COMPLETED');

  function fmtDuration(ms) {
    return formatLessonDuration(ms);
  }

  if (loading) return <LoadingState />;

  return (
    <>
      {msg.text && <Alert type={msg.type} onClose={()=>setMsg({text:''})}>{msg.text}</Alert>}

      {/* Current lesson banner */}
      {currentLesson && <Alert
        type={currentLesson.status==='PAUSED'?'warning':'success'}
        label={currentLesson.status==='PAUSED'?'Paused lesson':'Active lesson'}
        title={currentLesson.title}
        actions={<><Btn variant="secondary" size="sm" onClick={()=>setEditing(currentLesson)}><Pencil size={14}/> Edit</Btn><Btn variant="primary" size="sm" onClick={()=>navigate(`/instructor/lessons/${currentLesson.id}/active`)}>Resume Live Session →</Btn></>}
      >{currentLesson.topic || 'The current lesson session is ready to resume.'}</Alert>}

      {/* Create form */}
      <div className="flex justify-end mb-3">
        {hasOngoing
          ? <p className="text-xs text-muted-foreground italic self-center mr-2">End the current lesson before creating a new one.</p>
          : <Btn variant="primary" size="sm" onClick={()=>setShowForm(v=>!v)}>{showForm?<><CircleX size={14}/> Cancel</>:<><Plus size={14}/> Create Lesson</>}</Btn>
        }
      </div>

      {showForm && !hasOngoing && (
        <Card className="p-4 mb-4">
          <h3 className="font-semibold text-foreground mb-3">New Lesson</h3>
          <form onSubmit={handleCreate}>
            <FormField label="Lesson Title *"><Input required value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="e.g. Introduction to Limits" /></FormField>
            <FormField label="Topic (optional)"><Input value={form.topic} onChange={e=>setForm(f=>({...f,topic:e.target.value}))} placeholder="e.g. Limits and Continuity" /></FormField>
            <div className="flex justify-end gap-2 mt-2">
              <Btn variant="ghost" size="sm" onClick={()=>setShowForm(false)}>Cancel</Btn>
              <Btn variant="primary" size="sm" type="submit" loading={createL}>Create Lesson</Btn>
            </div>
          </form>
        </Card>
      )}

      {/* Ready to start */}
      {created.length>0 && (
        <div className="mb-5">
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">Ready to Start</h3>
          <div className="flex flex-col gap-2">
            {created.map(l=>(
              <Card key={l.id} className="p-3 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                <div><strong className="text-foreground">{l.title}</strong>{l.topic&&<span className="text-muted-foreground text-sm ml-2">— {l.topic}</span>}
                  <div className="text-xs text-muted-foreground mt-0.5">Created {new Date(l.createdAt).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'})}</div>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  <Btn variant="secondary" size="sm" onClick={()=>setEditing(l)}><Pencil size={14}/> Edit</Btn>
                  <Btn variant="danger" size="sm" onClick={()=>setDeleteTarget(l)}><Trash size={14}/> Delete</Btn>
                  <Btn variant="success" size="sm" disabled={hasOngoing}
                    title={hasOngoing?'End the active lesson first':'Check hardware before starting'} onClick={()=>handleStart(l)}>
                    <Play size={14}/> Prepare Session
                  </Btn>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* History */}
      {completed.length>0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">Lesson History</h3>
          <div className="mobile-record-list grid gap-3 sm:hidden" aria-label="Completed lesson history">
            {completed.map(l=>{
              const totalMs = l.startedAt&&l.endedAt ? new Date(l.endedAt)-new Date(l.startedAt) : 0;
              const pausedMs = l.totalPausedMs||0;
              const netMs = Math.max(0,totalMs-pausedMs);
              const recording = recordings.find(item=>item.lessonId===l.id);
              return <article key={l.id} className={MOBILE_RECORD_CARD}>
                <header><div className="min-w-0"><p>Completed lesson</p><h3>{l.title}</h3></div><Badge status="COMPLETED"/></header>
                {l.topic&&<p className="mt-[.55rem] break-words text-[.8rem] leading-[1.45] text-muted-foreground">{l.topic}</p>}
                <dl>
                  <div><dt>Date</dt><dd>{l.startedAt?new Date(l.startedAt).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'}):'—'}</dd></div>
                  <div><dt>Duration</dt><dd>{fmtDuration(netMs)}</dd></div>
                  <div><dt>Paused</dt><dd>{pausedMs>0?fmtDuration(pausedMs):'—'}</dd></div>
                </dl>
                {recording&&<LessonRecordingControl recording={recording} onDeleted={handleRecordingDeleted} onError={text=>notify(text,'error')}/>}
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-2">
                  <Btn variant="secondary" size="sm" aria-label={`Edit ${l.title}`} onClick={()=>setEditing(l)}><Pencil size={14}/></Btn>
                  <Btn variant="primary" size="sm" onClick={()=>navigate(lessonPrimaryAction(l).to,{state:lessonsOriginState})}>{lessonPrimaryAction(l).label}</Btn>
                  <Btn variant="danger" size="sm" aria-label={`Delete ${l.title}`} onClick={()=>setDeleteTarget(l)}><Trash size={14}/></Btn>
                </div>
              </article>;
            })}
          </div>
          <div className="scrollbar-hidden hidden max-w-full overflow-x-auto rounded-xl border border-border bg-surface shadow-sm [-webkit-overflow-scrolling:touch] sm:block">
            <table className="w-full text-sm">
              <thead><tr className="bg-surface-subtle border-b border-border">
                {['Title','Topic','Date','Duration','Paused','Status','Audio','Actions'].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-border">
                {completed.map(l=>{
                  const totalMs  = l.startedAt&&l.endedAt ? new Date(l.endedAt)-new Date(l.startedAt) : 0;
                  const pausedMs = l.totalPausedMs||0;
                  const netMs    = Math.max(0, totalMs-pausedMs);
                  const recording = recordings.find(item=>item.lessonId===l.id);
                  return (
                    <tr key={l.id} className="hover:bg-surface-subtle/60">
                      <td className="px-4 py-3 font-semibold text-foreground">{l.title}</td>
                      <td className="px-4 py-3 text-muted-foreground">{l.topic||'—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{l.startedAt?new Date(l.startedAt).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'}):'—'}</td>
                      <td className="px-4 py-3 text-foreground font-medium">{fmtDuration(netMs)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{pausedMs>0?fmtDuration(pausedMs):'—'}</td>
                      <td className="px-4 py-3"><Badge status="COMPLETED" /></td>
                      <td className="px-4 py-3"><LessonRecordingControl recording={recording} onDeleted={handleRecordingDeleted} onError={text=>notify(text,'error')}/></td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5">
                          <Btn variant="secondary" size="sm" aria-label={`Edit ${l.title}`} onClick={()=>setEditing(l)}><Pencil size={14}/></Btn>
                          <Btn variant="primary" size="sm" onClick={()=>navigate(lessonPrimaryAction(l).to,{state:lessonsOriginState})}>{lessonPrimaryAction(l).label}</Btn>
                          <Btn variant="danger" size="sm" aria-label={`Delete ${l.title}`} onClick={()=>setDeleteTarget(l)}><Trash size={14}/></Btn>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {lessons.length===0 && <EmptyState icon={<BookOpen size={23}/>} title="No lessons yet" body="Create your first lesson to get started." />}
      {editing && <LessonEditModal lesson={editing} onClose={()=>setEditing(null)} onSaved={handleSaved} />}
      {deleteTarget && (
        <ConfirmModal
          title="Delete this lesson?"
          body={`This will permanently delete “${deleteTarget.title}” and its pause history. This action cannot be undone.`}
          confirmLabel="Delete Lesson"
          confirmVariant="danger"
          loading={deleteLoading}
          onConfirm={handleDelete}
          onCancel={()=>setDeleteTarget(null)}
        />
      )}
    </>
  );
}
