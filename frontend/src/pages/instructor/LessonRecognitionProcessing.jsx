import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import DashboardLayout from '../../layouts/DashboardLayout';
import { Alert, Btn, EmptyState, LoadingState, PageHeader } from '../../components/ui';
import { ArrowLeft, BookOpen, Scan } from '../../components/icons';
import CaptureAlbum from '../../components/recognition/CaptureAlbum';
import SelectedCapturePreview from '../../components/recognition/SelectedCapturePreview';
import CompiledLessonRecognition from '../../components/recognition/CompiledLessonRecognition';
import ImageLightbox from '../../components/recognition/ImageLightbox';
import RecognitionStatusBadge from '../../components/recognition/RecognitionStatusBadge';
import AdditionalLessonMaterials from '../../components/recognition/AdditionalLessonMaterials';
import TranscriptPanel from '../../components/transcription/TranscriptPanel';
import useRecognitionPolling from '../../hooks/useRecognitionPolling';
import useTranscriptionPolling from '../../hooks/useTranscriptionPolling';
import useLessonWorkflowPolling from '../../hooks/useLessonWorkflowPolling';
import { processLessonCaptures } from '../../services/recognitionApi';
import { sectionBackLabel, sectionOriginFromState, sectionOriginState, sectionReturnPath } from '../../utils/instructorLessonNavigation';

export default function LessonRecognitionProcessing() {
  const { lessonId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { data, loading, error, refresh, hasRunningJobs } = useRecognitionPolling(lessonId);
  const transcript = useTranscriptionPolling(lessonId);
  const workflow = useLessonWorkflowPolling(lessonId);
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [message, setMessage] = useState({ text: '', type: 'success' });

  const items = data?.items || [];
  const lessonRecognition = data?.lessonRecognition || null;
  const workflowLesson = workflow.lesson;
  const running = hasRunningJobs || transcript.running || workflow.readiness.processing;
  const approved = workflowLesson?.workflow?.context?.status === 'APPROVED';
  const draftReady = workflowLesson?.workflow?.context?.status === 'DRAFT';
  const reviewBlocked = workflow.loading || !workflowLesson
    || (!approved && !draftReady && !workflow.readiness.canPrepare);
  const reviewLabel = approved
    ? 'Open Lesson Workspace'
    : draftReady
      ? 'Review Lesson Context'
      : workflow.readiness.processing
        ? 'Sources Processing…'
        : workflow.readiness.hasReadySource
          ? 'Prepare Lesson Review'
          : 'Process Sources First';
  const stageLabel = status => ['APPROVED', 'REVIEW_REQUIRED', 'SUCCEEDED'].includes(status) ? 'Ready' : status === 'FAILED' ? 'Needs attention' : ['PROCESSING','PENDING'].includes(status) ? 'Processing' : 'Not started';
  const stages = [
    ['Capture', loading ? 'Loading' : items.length ? `${items.length} saved` : 'No whiteboards'],
    ['Recognition', loading ? 'Loading' : stageLabel(lessonRecognition?.status)],
    ['Transcript', transcript.loading ? 'Loading' : !transcript.data?.recording ? 'Not recorded' : stageLabel(transcript.data?.transcription?.status)],
    ['Review', !workflowLesson ? 'Loading' : approved ? 'Reviewed' : draftReady ? 'Ready for review' : workflow.readiness.processing ? 'Waiting for sources' : workflow.readiness.hasReadySource ? 'Ready to prepare' : 'Sources required'],
    ['Approved', !workflowLesson ? 'Loading' : approved ? `Version ${workflowLesson.workflow.context.versionNumber}` : 'Instructor approval required'],
  ];
  useEffect(() => {
    if (!items.length) { setSelectedId(''); return; }
    if (!items.some(item => item.capture.id === selectedId)) setSelectedId(items[0].capture.id);
  }, [items, selectedId]);

  const selectedIndex = useMemo(() => Math.max(0, items.findIndex(item => item.capture.id === selectedId)), [items, selectedId]);
  const selectedItem = items[selectedIndex] || null;
  const viewerStatus = lessonRecognition?.status || selectedItem?.recognition?.status || 'NOT_STARTED';
  const sectionOrigin = sectionOriginFromState(location.state) || sectionReturnPath(data?.lesson?.sectionId, 'lessons');
  const navigationState = sectionOriginState(location.state, sectionOrigin);
  const backTarget = sectionOrigin || '/instructor/sections';
  const processingPath = `/instructor/lessons/${lessonId}/processing`;
  const closeViewer = useCallback(() => setViewerOpen(false), []);
  const showPrevious = useCallback(() => setSelectedId(current => {
    const index = items.findIndex(item => item.capture.id === current);
    return items[Math.max(0, index - 1)]?.capture.id || current;
  }), [items]);
  const showNext = useCallback(() => setSelectedId(current => {
    const index = items.findIndex(item => item.capture.id === current);
    return items[Math.min(items.length - 1, index + 1)]?.capture.id || current;
  }), [items]);

  async function compileLesson() {
    if (busy || running || !items.length) return;
    setBusy(true);
    try {
      const result = await processLessonCaptures(lessonId);
      const queuedAny = result.queued?.whiteboard || result.queued?.transcription || result.queued?.materials > 0;
      setMessage({ text: queuedAny ? 'All missing lesson sources were queued for processing.' : 'Lesson sources are processed. Open the review workspace when ready.', type: 'success' });
      await Promise.all([refresh({ quiet: true }), workflow.refresh({ quiet: true })]);
    } catch (requestError) {
      setMessage({ text: requestError.response?.data?.error || 'Unable to queue complete lesson processing.', type: 'error' });
    } finally { setBusy(false); }
  }

  function selectCompiledPage(pageNumber) {
    const item = items[pageNumber - 1];
    if (item) setSelectedId(item.capture.id);
  }

  const handleMaterialStatusChange = useCallback(() => {
    workflow.refresh({ quiet: true });
  }, [workflow.refresh]);

  if (loading && !data) return <DashboardLayout><LoadingState text="Loading lesson workspace…" /></DashboardLayout>;

  return <DashboardLayout>
    <button type="button" onClick={() => navigate(backTarget,{replace:true})} className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-muted-foreground transition hover:-translate-y-0.5 hover:bg-primary-subtle hover:text-primary-subtle-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ArrowLeft size={17}/> {sectionOrigin ? sectionBackLabel(sectionOrigin) : 'Back to My Teaching'}</button>
    <PageHeader title="Lesson Processing Workspace" subtitle={data?.lesson ? `${data.lesson.title}${data.lesson.topic ? ` — ${data.lesson.topic}` : ''}` : 'Compile whiteboard pages with the protected lesson transcript.'}>
      <Btn variant="secondary" className="w-full sm:w-auto" disabled={reviewBlocked} onClick={() => navigate(`/instructor/lessons/${lessonId}/review${approved?'?view=workspace':''}`,{state:{...navigationState,from:processingPath}})}>{reviewLabel}</Btn>
      <Btn variant="primary" className="w-full sm:w-auto" loading={busy} disabled={busy || running} onClick={compileLesson}><Scan size={16}/> {lessonRecognition ? 'Reprocess Complete Lesson' : 'Process Complete Lesson'}</Btn>
    </PageHeader>
    {message.text && <Alert type={message.type} onClose={() => setMessage({ text: '' })}>{message.text}</Alert>}
    {error && <Alert type="error">{error}</Alert>}
    {workflow.error && <Alert type="error">{workflow.error}</Alert>}
    <section aria-label="Lesson processing stages" className="mb-6 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <ol className="grid gap-3 sm:grid-cols-5">{stages.map(([name,status])=><li key={name}><p className="text-xs font-semibold text-slate-500">{name}</p><p className={`mt-1 text-sm font-semibold ${status==='Needs attention'?'text-amber-700 dark:text-amber-300':'text-slate-800 dark:text-slate-100'}`}>{status}</p></li>)}</ol>
      {transcript.data?.transcription?.status==='FAILED' && <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">The recording is saved. Retry the transcript or review the available whiteboard and uploaded sources.</p>}
    </section>

    <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(330px,410px)]">
      <main className="min-w-0">
        {!items.length ? <EmptyState icon={<BookOpen size={23}/>} title="No whiteboard captures" body="This lesson does not have saved whiteboard pages to process."/> : <>
          <CaptureAlbum items={items} selectedId={selectedId} onSelect={setSelectedId} lessonRecognition={lessonRecognition}/>
          <SelectedCapturePreview item={selectedItem} pageNumber={selectedIndex + 1} lessonRecognition={lessonRecognition} onOpen={() => setViewerOpen(true)}/>
          <CompiledLessonRecognition recognition={lessonRecognition} selectedPage={selectedIndex + 1} onSelectPage={selectCompiledPage}/>
        </>}
        <AdditionalLessonMaterials lessonId={lessonId} onMessage={setMessage} onStatusChange={handleMaterialStatusChange}/>
      </main>
      <aside className="min-w-0 xl:sticky xl:top-6"><TranscriptPanel lessonId={lessonId} data={transcript.data} loading={transcript.loading} error={transcript.error} onRefresh={transcript.refresh}/></aside>
    </div>
    <ImageLightbox open={viewerOpen && Boolean(selectedItem)} onClose={closeViewer} title={`Page ${selectedIndex + 1}`} subtitle={selectedItem ? `Captured ${new Date(selectedItem.capture.capturedAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'medium' })}` : ''} statusBadge={<RecognitionStatusBadge status={viewerStatus}/>} protectedUrl={selectedItem?.capture.correctedUrl || selectedItem?.capture.originalUrl} alt={`Full-size whiteboard page ${selectedIndex + 1}`} positionLabel={`Page ${selectedIndex + 1} of ${items.length}`} onPrevious={selectedIndex > 0 ? showPrevious : null} onNext={selectedIndex < items.length - 1 ? showNext : null}/>
  </DashboardLayout>;
}
