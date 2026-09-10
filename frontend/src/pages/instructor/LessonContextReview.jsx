import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ban, ChevronDown, CircleCheck, CircleMinus, FileText, Image as ImageIcon, LoaderCircle, Maximize2, Mic, MoreVertical, Trash2, TriangleAlert } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import DashboardLayout from '../../layouts/DashboardLayout';
import { Alert, Badge, Btn, Card, ConfirmModal, EmptyState, LoadingState, PageHeader, Textarea } from '../../components/ui';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/ui/dropdown-menu';
import { ArrowLeft, BookOpen, Check, Pencil } from '../../components/icons';
import ProtectedCaptureImage from '../../components/hardware/ProtectedCaptureImage';
import ProtectedAudioPlayer from '../../components/hardware/ProtectedAudioPlayer';
import ImageLightbox from '../../components/recognition/ImageLightbox';
import GeneratedLessonDocument from '../../components/reasoning/GeneratedLessonDocument';
import LessonChatAssistant from '../../components/reasoning/LessonChatAssistant';
import GeneratedContent from '../../components/reasoning/GeneratedContent';
import WorkspaceToast from '../../components/reasoning/WorkspaceToast';
import QuizQuestionEditor from '../../components/reasoning/QuizQuestionEditor';
import MathAwareEditor from '../../components/reasoning/MathAwareEditor';
import PdfViewer from '../../components/recognition/PdfViewer';
import { listLessonMaterials } from '../../services/lessonMaterialApi';
import { approveLessonContext, buildLessonContext, getLessonContext, reopenLessonContext, saveLessonContext } from '../../services/lessonContextApi';
import useLessonWorkflowPolling from '../../hooks/useLessonWorkflowPolling';
import { deleteQuiz, deleteQuizQuestion, generateLessonMaterials, getLessonIntelligence, publishLessonMaterials, publishQuiz, setQuizStatus, updateQuizQuestion } from '../../services/lessonIntelligenceApi';
import { humanText, latexValues } from '../../utils/structuredContent';
import { studentQuizTitle } from '../../utils/quizDisplay';
import { buildLessonContextPreview, normalizeLessonContextMathValues } from '../../utils/lessonContextPreview';
import { normalizeLessonMathContent } from '../../utils/mathContent';
import { buildTranscriptReviewSources, formatTranscriptTime, patchTranscriptReviewSource } from '../../utils/transcriptReview';
import { createLessonContextDraftGate, isExpectedSourcesProcessingError, lessonContextReadiness } from '../../utils/lessonContextReadiness';
import { sectionBackLabel, sectionOriginFromState, sectionOriginState, sectionReturnPath } from '../../utils/instructorLessonNavigation';

const PUBLISH_STATE = Object.freeze({ IDLE: 'idle', PUBLISHING: 'publishing', SUCCESS: 'success', ERROR: 'error' });

function sourceLabel(chunk) {
  const source = chunk.source || {};
  if (chunk.type === 'WHITEBOARD') return `Whiteboard Page ${source.pageNumber}`;
  if (chunk.type === 'SPEECH') return 'Lesson Transcript';
  if (chunk.type === 'PDF') return `${source.filename} • Page ${source.pdfPageNumber}`;
  return source.filename || 'Uploaded image';
}

function sourceTypeLabel(type) {
  return { WHITEBOARD: 'Whiteboard', UPLOADED_IMAGE: 'Uploaded material', PDF: 'Uploaded material', SPEECH: 'Transcript' }[type] || 'Lesson source';
}

function mathMarkdown(values) {
  return normalizeLessonContextMathValues(latexValues(values)).map(value => `$$\n${value}\n$$`).join('\n\n');
}

function mathValues(markdown) {
  const values = [];
  String(markdown || '').replace(/\$\$([\s\S]*?)\$\$|\$([^$\n]+)\$/g, (_, display, inline) => {
    const value = String(display || inline || '').trim();
    if (value) values.push(value);
    return '';
  });
  return values;
}

function sourceImageUrl(chunk, materials) {
  const source = chunk?.source || {};
  if (chunk?.type === 'WHITEBOARD' && source.captureId) return `/api/captures/${source.captureId}/image/original`;
  if (chunk?.type === 'UPLOADED_IMAGE') return materials.find(item => item.id === source.materialId)?.fileUrl || '';
  return '';
}

export default function LessonContextReview() {
  const { lessonId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const wantsWorkspace = new URLSearchParams(location.search).get('view') === 'workspace';
  const [context, setContext] = useState(null);
  const [chunks, setChunks] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [materials, setMaterials] = useState([]);
  const [intelligence, setIntelligence] = useState({ materials: [], quizzes: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [publishState, setPublishState] = useState(PUBLISH_STATE.IDLE);
  const [regenerating, setRegenerating] = useState(false);
  const regenerationInFlight = useRef(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [pdf, setPdf] = useState(null);
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [changedMaterialId, setChangedMaterialId] = useState('');
  const [documentUpdated, setDocumentUpdated] = useState(false);
  const [documentResetRevision, setDocumentResetRevision] = useState(0);
  const [documentEditState, setDocumentEditState] = useState({ active: false, targetMaterialId: '' });
  const [workspaceView, setWorkspaceView] = useState('assistant');
  const [quizToast, updateToast] = useState(null);
  const toastSequence = useRef(0);
  const setQuizToast = useCallback(value => updateToast(value ? { ...value, id: ++toastSequence.current } : null), []);
  const setMessage = setQuizToast;
  const [quizAction, setQuizAction] = useState(null);
  const [editingChunkId, setEditingChunkId] = useState('');
  const [expandedQuizId, setExpandedQuizId] = useState('');
  const [imageViewerId, setImageViewerId] = useState('');
  const [showApprovedSources, setShowApprovedSources] = useState(false);
  const publishInFlight = useRef(false);
  const handledQuizOrigin = useRef('');
  const draftBuildGate = useRef(null);
  const reviewMounted = useRef(false);
  const [draftError, setDraftError] = useState('');
  if (!draftBuildGate.current) draftBuildGate.current = createLessonContextDraftGate();
  const workflow = useLessonWorkflowPolling(lessonId, { enabled: !context });
  const lesson = workflow.lesson;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextContext, nextMaterials] = await Promise.all([
        getLessonContext(lessonId),
        listLessonMaterials(lessonId),
      ]);
      setContext(nextContext);
      setChunks(nextContext?.chunks || []);
      setMaterials(nextMaterials);
      setSelectedId(current => nextContext?.chunks?.some(item => item.id === current) ? current : nextContext?.chunks?.[0]?.id || '');
      if (nextContext?.status === 'APPROVED' && wantsWorkspace) setIntelligence(await getLessonIntelligence(lessonId));
    } catch (error) { setMessage({ type: 'error', text: error.response?.data?.error || 'Unable to load the lesson review.' }); }
    finally { setLoading(false); }
  }, [lessonId, wantsWorkspace]);
  useEffect(() => {
    reviewMounted.current = true;
    return () => { reviewMounted.current = false; };
  }, []);
  useEffect(() => {
    draftBuildGate.current.reset();
    setDraftError('');
  }, [lessonId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!quizToast) return undefined;
    const timer = window.setTimeout(() => setQuizToast(null), quizToast.type === 'error' ? 6000 : quizToast.quizId ? 8000 : 3000);
    return () => window.clearTimeout(timer);
  }, [quizToast]);
  const reviewSources = useMemo(() => buildTranscriptReviewSources(chunks), [chunks]);
  const selected = useMemo(() => reviewSources.find(item => item.id === selectedId || item.memberIds?.includes(selectedId)) || null, [reviewSources, selectedId]);
  const includedChunks = useMemo(() => reviewSources.filter(item => !item.removed), [reviewSources]);
  const includedCount = includedChunks.length;
  const excludedCount = reviewSources.length - includedCount;
  const workspaceMode = context?.status === 'APPROVED' && wantsWorkspace;
  const workspacePath = `/instructor/lessons/${lessonId}/review?view=workspace`;
  const reviewPath = `/instructor/lessons/${lessonId}/review`;
  const processingPath = `/instructor/lessons/${lessonId}/processing`;
  const explicitSectionOrigin = sectionOriginFromState(location.state);
  const originStorageKey = `sea-it-solved:lesson-origin:${lessonId}`;
  let rememberedOrigin = '';
  try {
    const candidate = sectionOriginFromState({ originalReturnTo: sessionStorage.getItem(originStorageKey) });
    if (lesson?.sectionId && candidate.startsWith(`/instructor/sections/${lesson.sectionId}?`)) rememberedOrigin = candidate;
  } catch { /* Private browsing may disable storage; metadata fallback still works. */ }
  const fallbackSectionOrigin = sectionReturnPath(
    lesson?.sectionId,
    workspaceMode || context?.status === 'APPROVED' ? 'reviews' : 'lessons',
  );
  const sectionOrigin = explicitSectionOrigin || rememberedOrigin || fallbackSectionOrigin;
  useEffect(() => {
    if (!explicitSectionOrigin) return;
    try { sessionStorage.setItem(originStorageKey, explicitSectionOrigin); } catch { /* Optional refresh aid. */ }
  }, [explicitSectionOrigin, originStorageKey]);
  // Approved sources belong below the same lesson workspace, even when a
  // refresh loses the transient inspection marker. Keep the Section origin.
  const inspectedFromWorkspace = !wantsWorkspace && (
    location.state?.inspectionParent === workspacePath || context?.status === 'APPROVED'
  );
  const cameFromProcessing = context?.status !== 'APPROVED' && location.state?.from === processingPath;
  function preservedOriginState(extra = {}) {
    const next = sectionOriginState(location.state, sectionOrigin, extra);
    delete next.inspectionParent;
    delete next.inspectionHistoryIndex;
    if (next.from === processingPath) delete next.from;
    return next;
  }
  const backTarget = inspectedFromWorkspace ? workspacePath : cameFromProcessing ? processingPath : sectionOrigin || processingPath;
  const backLabel = inspectedFromWorkspace ? 'Back to Lesson Workspace' : cameFromProcessing ? 'Back to Processing' : sectionOrigin ? sectionBackLabel(sectionOrigin) : 'Back to Processing';
  function navigateBack() {
    // Return through the exact known parent entry only when this inspection
    // was pushed from it. Direct URLs/state-less refreshes use the explicit path.
    if (inspectedFromWorkspace && location.state?.inspectionHistoryIndex === window.history.state?.idx - 1) {
      navigate(-1);
      return;
    }
    navigate(backTarget, {
      replace: true,
      state: inspectedFromWorkspace || backTarget === processingPath ? preservedOriginState() : undefined,
    });
  }
  function continueToWorkspace() {
    if (inspectedFromWorkspace && location.state?.inspectionHistoryIndex === window.history.state?.idx - 1) {
      navigate(-1);
    } else navigate(workspacePath, { replace: true, state: preservedOriginState() });
  }
  const staleMaterials = intelligence.materials.some(item => item.outdated || (item.contextVersionId && item.contextVersionId !== context?.id));
  async function regenerateMaterials() {
    if (regenerationInFlight.current || documentEditState.active) return;
    regenerationInFlight.current = true;
    setRegenerating(true);
    try {
      await generateLessonMaterials(lessonId);
      const next = await getLessonIntelligence(lessonId);
      setIntelligence(next);
      setDocumentResetRevision(current => current + 1);
      setMessage({ type: 'success', text: 'Lesson materials regenerated', description: 'Review the updated notes before publishing.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.error || 'Regeneration could not finish. Your existing material is still available. Please retry.' });
    } finally { setRegenerating(false); regenerationInFlight.current = false; }
  }
  const sourceStatus = useMemo(() => {
    const whiteboards = includedChunks.filter(item => item.type === 'WHITEBOARD').length;
    const transcripts = includedChunks.filter(item => item.type === 'SPEECH').length;
    const uploads = includedChunks.filter(item => ['UPLOADED_IMAGE','PDF'].includes(item.type)).length;
    return [
      whiteboards ? `${whiteboards} whiteboard source${whiteboards === 1 ? '' : 's'}` : '',
      transcripts ? 'transcript reviewed' : '',
      uploads ? `${uploads} uploaded source${uploads === 1 ? '' : 's'}` : '',
    ].filter(Boolean).join(' · ') || `${includedCount} source${includedCount === 1 ? '' : 's'} reviewed`;
  }, [includedChunks, includedCount]);
  const imageSources = useMemo(() => reviewSources.map(chunk => ({ chunk, url: sourceImageUrl(chunk, materials) })).filter(item => item.url), [reviewSources, materials]);
  const imageViewerIndex = imageSources.findIndex(item => item.chunk.id === imageViewerId);
  const imageViewer = imageViewerIndex >= 0 ? imageSources[imageViewerIndex] : null;
  useEffect(() => {
    const quizzes = intelligence.quizzes || [];
    setExpandedQuizId(current => {
      if (current && quizzes.some(quiz => quiz.id === current)) return current;
      return quizzes[0]?.id || '';
    });
  }, [intelligence.quizzes]);
  useEffect(() => {
    const focusQuizId = location.state?.focusQuizId;
    if (handledQuizOrigin.current === location.key || !focusQuizId || !intelligence.quizzes.some(quiz => quiz.id === focusQuizId)) return;
    handledQuizOrigin.current = location.key;
    setExpandedQuizId(focusQuizId);
    window.requestAnimationFrame(() => document.getElementById(`quiz-toggle-${focusQuizId}`)?.scrollIntoView({ block: 'center' }));
  }, [intelligence.quizzes, location.state?.focusQuizId, location.key]);

  function patchReviewSource(source, patch) { setChunks(items => patchTranscriptReviewSource(items, source, patch)); }
  const prepareReview = useCallback(async ({ automatic = false } = {}) => {
    const readiness = workflow.readiness;
    const gate = draftBuildGate.current;
    gate.observe(readiness.signature);
    if (context || readiness.processing || !readiness.canPrepare
      || !gate.start(readiness.signature, { force: !automatic })) return false;
    setBusy('build');
    setDraftError('');
    try {
      let next = readiness.hasContext ? await getLessonContext(lessonId) : null;
      if (!next) next = await buildLessonContext(lessonId);
      if (!reviewMounted.current) return false;
      setContext(next);
      setChunks(next.chunks);
      setSelectedId(next.chunks[0]?.id || '');
      await workflow.refresh({ quiet: true });
      return true;
    } catch (error) {
      if (isExpectedSourcesProcessingError(error)) {
        if (reviewMounted.current) setDraftError('');
        await workflow.refresh({ quiet: true });
        return false;
      }
      if (reviewMounted.current) setDraftError(error.response?.data?.error || 'Unable to prepare lesson review.');
      return false;
    } finally {
      gate.finish();
      if (reviewMounted.current) setBusy('');
    }
  }, [context, lessonId, workflow.readiness, workflow.refresh]);
  useEffect(() => {
    draftBuildGate.current.observe(workflow.readiness.signature);
    if (loading || workflow.loading || context || workflow.readiness.processing || !workflow.readiness.canPrepare) return;
    prepareReview({ automatic: true });
  }, [context, loading, prepareReview, workflow.loading, workflow.readiness]);
  async function save() {
    setBusy('save');
    try {
      const next = await saveLessonContext(lessonId, chunks.map(item => ({ id: item.id, text: item.text, math: item.math, removed: item.removed })));
      setContext(next); setChunks(next.chunks); setMessage({ type: 'success', text: 'Lesson-context draft saved.' });
    } catch (error) { setMessage({ type: 'error', text: error.response?.data?.error || 'Unable to save the review draft.' }); }
    finally { setBusy(''); }
  }
  async function approve() {
    setBusy('approve');
    try {
      const next = await approveLessonContext(lessonId);
      setContext(next); setChunks(next.chunks); setConfirmApprove(false); setShowApprovedSources(false);
      setMessage({ type: 'success', text: 'Lesson context approved', description: `Version ${next.versionNumber} is frozen and ready for lesson generation.` });
      navigate(workspacePath, { replace: true, state: preservedOriginState({ contextApproved: true }) });
    } catch (error) { setMessage({ type: 'error', text: error.response?.data?.error || 'Unable to approve the context.' }); }
    finally { setBusy(''); }
  }
  async function reopen() {
    setBusy('reopen');
    try {
      const next = await reopenLessonContext(lessonId);
      setContext(next); setChunks(next.chunks); setShowApprovedSources(false);
      navigate(reviewPath, { replace: true, state: preservedOriginState() });
      setMessage({ type: 'success', text: 'Review reopened', description: 'A new review draft was created. The approved version remains unchanged.' });
    }
    catch (error) { setMessage({ type: 'error', text: error.response?.data?.error || 'Unable to reopen the review.' }); }
    finally { setBusy(''); }
  }
  async function publishMaterialsForStudents() {
    if (publishInFlight.current || staleMaterials || regenerating || documentEditState.active) return;
    publishInFlight.current = true;
    setPublishState(PUBLISH_STATE.PUBLISHING);
    try {
      const republishing = intelligence.materials.some(item => item.publishedAt);
      const publishedMaterials = await publishLessonMaterials(lessonId);
      setIntelligence(current => ({ ...current, materials: publishedMaterials }));
      setPublishState(PUBLISH_STATE.SUCCESS);
      setMessage({ type: 'success', text: republishing ? 'Learning materials updated' : 'Learning materials published', description: republishing ? 'The latest version is now available to students.' : 'Students can now access the lesson materials.' });
    } catch (error) {
      if (import.meta.env.DEV) console.error('Lesson material publication failed', error);
      setPublishState(PUBLISH_STATE.ERROR);
      setMessage({ type: 'error', text: error.response?.data?.error || 'Unable to publish lesson materials. Your current lesson draft was preserved.' });
    } finally {
      publishInFlight.current = false;
    }
  }

  function reviewQuizDraft(quizId) {
    if (!quizId) return;
    setQuizToast(null);
    setExpandedQuizId(quizId);
    window.requestAnimationFrame(() => {
      const toggle = document.getElementById(`quiz-toggle-${quizId}`);
      toggle?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toggle?.focus({ preventScroll: true });
    });
  }
  async function refreshQuizDraft({ review = false, notify = false } = {}) {
    try {
      const next = await getLessonIntelligence(lessonId);
      const newestQuizId = next.quizzes?.[0]?.id || '';
      setIntelligence(next);
      if (review) reviewQuizDraft(newestQuizId);
      else {
        setWorkspaceView('document');
        setExpandedQuizId('');
        if (notify && newestQuizId) setQuizToast({ quizId: newestQuizId });
      }
    } catch (error) { setMessage({ type: 'error', text: error.response?.data?.error || 'Unable to load the quiz draft.' }); }
  }
  function updateEditedMaterials(nextMaterials, changedId, nextDocument, update = {}) {
    setIntelligence(current => ({ ...current, materials: nextMaterials, document: nextDocument || current.document }));
    if (update.resetPage) setDocumentResetRevision(current => current + 1);
    setChangedMaterialId(changedId || '');
    if (changedId) setTimeout(() => setChangedMaterialId(current => current === changedId ? '' : current), 1000);
    if (!changedId) {
      setDocumentUpdated(false);
      window.requestAnimationFrame(() => {
        setDocumentUpdated(true);
        window.setTimeout(() => setDocumentUpdated(false), 700);
      });
    }
  }
  function updateDocumentEditState(nextState) {
    setDocumentEditState(nextState);
    if (nextState.active && window.matchMedia('(max-width: 1279px)').matches) setWorkspaceView('document');
  }
  function updateEditedQuiz(nextQuiz) {
    setIntelligence(current => ({
      ...current,
      quizzes: current.quizzes.some(item => item.id === nextQuiz.id)
        ? current.quizzes.map(item => item.id === nextQuiz.id ? nextQuiz : item)
        : [nextQuiz, ...current.quizzes],
    }));
    setExpandedQuizId(nextQuiz.id);
  }
  const saveQuestion = useCallback(async (quizId, question) => {
    setBusy(question.id);
    try {
      const savedQuestion = await updateQuizQuestion(quizId, question.id, question);
      setIntelligence(current => ({
        ...current,
        quizzes: current.quizzes.map(quiz => quiz.id !== quizId ? quiz : {
          ...quiz,
          questions: quiz.questions.map(item => item.id === question.id ? savedQuestion : item),
        }),
      }));
      setMessage({ type: 'success', text: 'Question saved', description: 'Your changes have been saved.' });
      return true;
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.error || 'Unable to save this question.' });
      return false;
    }
    finally { setBusy(''); }
  }, [lessonId]);
  const removeQuestion = useCallback(async (quizId, question) => {
    setBusy(question.id);
    try { await deleteQuizQuestion(quizId, question.id); setIntelligence(await getLessonIntelligence(lessonId)); }
    catch (error) { setMessage({ type: 'error', text: error.response?.data?.error || 'Unable to delete this question.' }); }
    finally { setBusy(''); }
  }, [lessonId]);
  async function publish(quiz) {
    setBusy(`quiz-publish-${quiz.id}`);
    try {
      const saved = await publishQuiz(quiz.id);
      setIntelligence(current => ({ ...current, quizzes: current.quizzes.map(item => item.id === saved.id ? saved : item) }));
      setQuizToast({ text: 'Quiz published', description: 'Students can now access this quiz.' });
    }
    catch (error) { setMessage({ type: 'error', text: error.response?.data?.error || 'Unable to publish this quiz.' }); }
    finally { setBusy(''); }
  }
  async function changeAvailability(quiz, status) {
    setBusy(`quiz-${status === 'DISABLED' ? 'disable' : 'enable'}-${quiz.id}`);
    try {
      const saved = await setQuizStatus(quiz.id, status);
      setIntelligence(current => ({ ...current, quizzes: current.quizzes.map(item => item.id === saved.id ? saved : item) }));
      setQuizAction(null);
      setQuizToast({ text: status === 'DISABLED' ? 'Quiz disabled successfully.' : 'Quiz enabled successfully.' });
    }
    catch (error) { setQuizAction(null); setMessage({ type: 'error', text: error.response?.data?.error || `Unable to ${status === 'DISABLED' ? 'disable' : 'enable'} this quiz.` }); }
    finally { setBusy(''); }
  }
  async function removeQuiz(quiz, { force = false } = {}) {
    setQuizAction(current => current?.quiz.id === quiz.id ? { ...current, error: '' } : current);
    setBusy(`quiz-${force ? 'force-delete' : 'delete'}-${quiz.id}`);
    try {
      const result = await deleteQuiz(quiz.id, { force });
      setIntelligence(current => ({ ...current, quizzes: current.quizzes.filter(item => item.id !== quiz.id) }));
      setExpandedQuizId(current => current === quiz.id ? '' : current);
      setQuizAction(null);
      setQuizToast({ text: result.forceDeleted ? 'Quiz and associated student attempts were permanently deleted.' : 'Quiz deleted successfully.' });
    } catch (error) {
      if (!force && error.response?.status === 409 && error.response?.data?.code === 'QUIZ_HAS_ATTEMPTS') {
        setQuizAction({
          action: 'force-delete',
          quiz,
          attemptCount: Number(error.response?.data?.details?.attemptCount) || 0,
          confirmation: '',
          error: '',
        });
        return;
      }
      const deletionError = error.response?.data?.error || 'Unable to delete this quiz.';
      setQuizAction(current => current?.quiz.id === quiz.id ? {
        ...current,
        error: force ? 'Quiz could not be deleted. No records were removed.' : deletionError,
      } : current);
    } finally { setBusy(''); }
  }
  function manageQuiz(action, quiz) {
    if (action === 'publish') { publish(quiz); return; }
    if (action === 'enable') { changeAvailability(quiz, 'PUBLISHED'); return; }
    setQuizAction({ action, quiz });
  }
  function confirmQuizAction() {
    if (!quizAction) return;
    if (quizAction.action === 'disable') changeAvailability(quizAction.quiz, 'DISABLED');
    if (quizAction.action === 'delete') removeQuiz(quizAction.quiz);
    if (quizAction.action === 'force-delete' && quizAction.confirmation === 'DELETE') removeQuiz(quizAction.quiz, { force: true });
  }

  if (loading || (workflow.loading && !lesson)) return <DashboardLayout>
    <button type="button" onClick={navigateBack} className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300"><ArrowLeft size={17}/> {backLabel}</button>
    <PageHeader title={wantsWorkspace ? 'Lesson Workspace' : 'Lesson Context Review'} subtitle={lesson?.title || 'Preparing your lesson sources and approved context.'}/>
    <section aria-busy="true" aria-label="Loading lesson content" className="space-y-5">
      <p role="status" className="text-sm text-slate-500">Loading lesson content…</p>
      <div aria-hidden="true" className="space-y-5 motion-safe:animate-pulse">
        <Card className="p-5"><div className="h-5 w-48 rounded bg-slate-200 dark:bg-slate-700"/><div className="mt-4 h-4 w-2/3 rounded bg-slate-100 dark:bg-slate-800"/></Card>
        <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">{[0,1].map(key=><Card key={key} className="min-h-80 space-y-5 p-5">{[0,1,2,3].map(line=><div key={line} className="h-5 rounded bg-slate-100 dark:bg-slate-800"/>)}</Card>)}</div>
      </div>
    </section>
  </DashboardLayout>;
  if (!context) {
    const waitingFor = workflow.readiness.processingSources.join(', ');
    const failed = workflow.readiness.failedSources.join(', ');
    const unavailableBody = draftError
      || (failed
        ? `Processing finished, but ${failed} needs attention. Return to Processing to retry it, or continue once another usable source is ready.`
        : 'No processed lesson sources are available yet. Return to Processing to start recognition or transcription.');
    return <DashboardLayout>
      <button type="button" onClick={navigateBack} className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300"><ArrowLeft size={17}/> {backLabel}</button>
      <PageHeader title="Lesson Context Review" subtitle={lesson?.title || 'Preparing the combined lesson context.'}/>
      {workflow.readiness.processing ? <EmptyState
        icon={<LoaderCircle className="motion-safe:animate-spin"/>}
        title="Lesson sources are processing"
        body={`Waiting for ${waitingFor}. This page checks status automatically and will prepare the review once processing finishes.`}
      >
        {workflow.pollingTimedOut && <Btn variant="secondary" onClick={workflow.retry}>Check Status Again</Btn>}
      </EmptyState> : busy === 'build' ? <LoadingState text="Preparing lesson context review…"/> : <EmptyState
        icon={<BookOpen/>}
        title="Review is not ready"
        body={workflow.error || unavailableBody}
      >
        {workflow.readiness.canPrepare && <Btn onClick={() => prepareReview({ automatic: false })}>Retry Prepare Review</Btn>}
        <Btn variant="secondary" onClick={() => navigate(processingPath, { state: preservedOriginState() })}>Return to Processing</Btn>
      </EmptyState>}
    </DashboardLayout>;
  }

  return <DashboardLayout>
    <button type="button" onClick={navigateBack} className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300"><ArrowLeft size={17}/> {backLabel}</button>
    {context.status === 'DRAFT' && <PageHeader title="Lesson Context Review" subtitle={`Version ${context.versionNumber} • Review every source before approval.`}>
      <Badge status={context.status}/>
      <Btn variant="secondary" loading={busy === 'save'} onClick={save}>Save Draft</Btn>
      <Btn loading={busy === 'approve'} onClick={() => setConfirmApprove(true)}><Check size={16}/> Approve Lesson Context</Btn>
    </PageHeader>}
    {context.status === 'APPROVED' && !workspaceMode && <>
      <Card className="mb-6 max-w-3xl p-5 sm:p-6">
        <div className="mb-5 flex items-start gap-3"><CircleCheck size={24} className="shrink-0 text-emerald-600" aria-hidden="true"/><div><h1 className="text-xl font-bold text-slate-900 dark:text-white">Approved Lesson Context</h1><p className="mt-1 text-sm text-slate-500">{lesson?.title} · Approved sources remain frozen until a new version is reviewed.</p></div></div>
        <dl className="grid gap-4 sm:grid-cols-3">
          <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Approved version</dt><dd className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{context.versionNumber}</dd></div>
          <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Included sources</dt><dd className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{includedCount}</dd></div>
          <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Excluded sources</dt><dd className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{excludedCount}</dd></div>
        </dl>
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">{sourceStatus}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Btn onClick={continueToWorkspace}>Continue to Lesson Workspace</Btn>
          <Btn variant="secondary" aria-expanded={showApprovedSources} onClick={() => setShowApprovedSources(value => !value)}>{showApprovedSources ? 'Hide Approved Sources' : 'View Approved Sources'}</Btn>
          <Btn variant="secondary" loading={busy === 'reopen'} onClick={reopen}>Reopen Review</Btn>
        </div>
      </Card>
    </>}
    {workspaceMode && <Alert
      type="approved"
      title="Lesson context approved"
      actions={<Btn variant="secondary" onClick={() => navigate(reviewPath, { state: { ...preservedOriginState(), inspectionParent: workspacePath, inspectionHistoryIndex: window.history.state?.idx } })}>Review Sources</Btn>}
    >{sourceStatus}</Alert>}

    {(context.status === 'DRAFT' || showApprovedSources) && <section className="context-review-section" aria-labelledby="source-review-title">
      <header className="context-review-summary">
        <div><h2 id="source-review-title">{context.status === 'DRAFT' ? 'Source review' : 'Approved sources'}</h2><p>{context.status === 'DRAFT' ? 'Check the interpreted lesson content, then include only the sources that belong in the approved context.' : 'Inspect the frozen source selection used by lesson generation.'}</p></div>
        <span>{includedCount} of {reviewSources.length} included</span>
      </header>
      <div className="context-review-workspace">
        <div className="context-source-list" role="list" aria-label="Lesson context sources">
          {reviewSources.map(chunk => <SourceCard key={chunk.id} chunk={chunk} materials={materials} selected={selected?.id === chunk.id} draft={context.status === 'DRAFT'} editing={editingChunkId === chunk.id} onSelect={() => setSelectedId(chunk.id)} onToggleEdit={open => setEditingChunkId(open ? chunk.id : '')} onPatch={patch => patchReviewSource(chunk, patch)} onOpenImage={() => setImageViewerId(chunk.id)} onOpenPdf={setPdf}/>) }
        </div>
        <aside className="context-source-inspector min-w-0 xl:sticky xl:top-6"><SourceInspector chunk={selected} materials={materials} onOpenImage={() => selected && setImageViewerId(selected.id)} onOpenPdf={setPdf}/></aside>
      </div>
    </section>}

    {workspaceMode && <section className="space-y-5">
      {staleMaterials && <Alert type="stale" title="This generated lesson is based on an older approved context.">Regenerate from the latest approved context, then review and publish. Existing published material remains available until replacement is published.</Alert>}
      <section className="lesson-ai-workspace-shell" aria-label="Lesson document and AI editing workspace">
        <header className="lesson-ai-workspace-header">
          <div className="lesson-ai-workspace-identity">
            <p>AI lesson workspace</p>
            <h2>{intelligence.document?.title || 'Generated Lesson Materials'}</h2>
            <span>{intelligence.materials.length} {intelligence.materials.length === 1 ? 'section' : 'sections'} • Approved context{intelligence.materials.some(item => item.publishedAt) ? ' • Published' : ''}{documentEditState.active ? ' • AI editing…' : ''}</span>
          </div>
          <div className="lesson-intelligence-actions">
            {staleMaterials ? <Btn className="lesson-workspace-action is-primary" loading={regenerating} disabled={regenerating || documentEditState.active} onClick={regenerateMaterials}>{regenerating ? 'Regenerating…' : 'Regenerate from Approved Context'}</Btn> : <Btn className="lesson-workspace-action is-primary" aria-busy={publishState === PUBLISH_STATE.PUBLISHING || undefined} disabled={!intelligence.materials.length || publishState === PUBLISH_STATE.PUBLISHING || regenerating || documentEditState.active} onClick={publishMaterialsForStudents}>{publishState === PUBLISH_STATE.PUBLISHING ? <><LoaderCircle className="animate-spin" size={16}/>Publishing…</> : intelligence.materials.some(item => item.publishedAt) ? 'Republish Materials' : 'Publish Materials'}</Btn>}
          </div>
        </header>
        <div className="lesson-ai-workspace-tabs" role="group" aria-label="Workspace view">
          <button id="lesson-workspace-document-tab" type="button" aria-pressed={workspaceView === 'document'} aria-controls="lesson-workspace-document" onClick={() => setWorkspaceView('document')}>Lesson</button>
          <button id="lesson-workspace-assistant-tab" type="button" aria-pressed={workspaceView === 'assistant'} aria-controls="lesson-workspace-assistant" onClick={() => setWorkspaceView('assistant')}>AI Assistant</button>
        </div>
        <div className="lesson-ai-workspace">
          <div id="lesson-workspace-document" className={`lesson-ai-pane lesson-ai-document-pane ${workspaceView === 'document' ? 'is-active' : ''} ${documentUpdated ? 'is-document-updated' : ''}`}>
            <GeneratedLessonDocument materials={intelligence.materials} documentModel={intelligence.document} audience="internal" selectedMaterialId={selectedMaterialId} changedMaterialId={changedMaterialId} editState={documentEditState} onVisibleMaterialChange={setSelectedMaterialId} documentResetKey={`${lessonId}:${documentResetRevision}`}/>
            {!intelligence.materials.length && documentEditState.active
              ? <div className="lesson-generation-skeleton" role="status" aria-live="polite" aria-label="Generating lesson notes"><span/><span/><span/><span/><span/></div>
              : !intelligence.materials.length && <div className="lesson-ai-empty-document">Generate lesson notes to create the academic handout.</div>}
          </div>
          <div id="lesson-workspace-assistant" inert={regenerating || undefined} className={`lesson-ai-pane lesson-ai-assistant-pane ${workspaceView === 'assistant' ? 'is-active' : ''}`}>
            <LessonChatAssistant lessonId={lessonId} lessonTitle={intelligence.document?.title} materials={intelligence.materials} selectedMaterialId={selectedMaterialId} onMaterialsUpdated={updateEditedMaterials} onEditStateChange={updateDocumentEditState} onQuizCreated={() => refreshQuizDraft({ notify: true })} onReviewQuiz={() => refreshQuizDraft({ review: true })} onQuizUpdated={updateEditedQuiz}/>
          </div>
        </div>
      </section>
      <div id="lesson-quiz-drafts" className="scroll-mt-6 space-y-5">
        {intelligence.quizzes.map(quiz => <QuizEditor key={quiz.id} lessonId={lessonId} navigationState={preservedOriginState()} quiz={quiz} expanded={expandedQuizId === quiz.id} busy={busy} onToggle={() => setExpandedQuizId(current => current === quiz.id ? '' : quiz.id)} onSave={saveQuestion} onDelete={removeQuestion} onManage={manageQuiz}/>) }
      </div>
    </section>}
    <ImageLightbox
      open={Boolean(imageViewer)}
      onClose={() => setImageViewerId('')}
      protectedUrl={imageViewer?.url}
      title={imageViewer ? sourceLabel(imageViewer.chunk) : 'Lesson source'}
      subtitle={imageViewer ? `${sourceTypeLabel(imageViewer.chunk.type)} • ${imageViewer.chunk.removed ? 'Excluded from lesson context' : 'Included in lesson context'}` : ''}
      alt={imageViewer ? `${sourceLabel(imageViewer.chunk)} lesson source` : 'Lesson source'}
      positionLabel={imageViewer ? `Image ${imageViewerIndex + 1} of ${imageSources.length}` : ''}
      onPrevious={imageViewerIndex > 0 ? () => setImageViewerId(imageSources[imageViewerIndex - 1].chunk.id) : undefined}
      onNext={imageViewerIndex >= 0 && imageViewerIndex < imageSources.length - 1 ? () => setImageViewerId(imageSources[imageViewerIndex + 1].chunk.id) : undefined}
      statusBadge={imageViewer ? <Badge status={imageViewer.chunk.removed ? 'EXCLUDED' : 'INCLUDED'}/> : null}
    />
    <PdfViewer open={Boolean(pdf)} onClose={() => setPdf(null)} material={pdf}/>
    <WorkspaceToast notification={quizToast} onDismiss={() => setQuizToast(null)} onReview={reviewQuizDraft}/>
    {quizAction && <ConfirmModal
      title={['delete', 'force-delete'].includes(quizAction.action)
        ? <span className="inline-flex items-center gap-2 text-red-700 dark:text-red-300"><TriangleAlert size={20} aria-hidden="true"/>{quizAction.action === 'force-delete' ? 'Force delete quiz?' : 'Delete quiz permanently?'}</span>
        : 'Disable this quiz?'}
      body={quizAction.action === 'force-delete'
        ? <div className="space-y-3">
            <p>This quiz has student attempts and recorded results. Force deleting it will permanently remove:</p>
            <ul className="list-disc space-y-1 pl-5"><li>the quiz</li><li>student attempts for this quiz</li><li>submitted answers</li><li>quiz scores/results</li><li>analytics derived from this quiz</li></ul>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-red-50 px-3 py-2 dark:bg-red-500/10"><dt className="font-semibold">Attempts:</dt><dd>{quizAction.attemptCount}</dd><dt className="font-semibold">Quiz:</dt><dd>{studentQuizTitle(quizAction.quiz.title)}</dd></dl>
            <p className="font-semibold text-red-700 dark:text-red-200">This action cannot be undone.</p>
            <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100">Type DELETE to confirm
              <input
                type="text"
                autoComplete="off"
                value={quizAction.confirmation || ''}
                onChange={event => setQuizAction(current => ({ ...current, confirmation: event.target.value }))}
                className="mt-2 block min-h-11 w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-200 dark:border-red-400/40 dark:bg-slate-950 dark:text-white dark:focus:ring-red-500/20"
              />
            </label>
            {quizAction.error && <Alert type="error" className="mb-0">{quizAction.error}</Alert>}
          </div>
        : quizAction.action === 'delete'
          ? <div>This will permanently delete “{studentQuizTitle(quizAction.quiz.title)}” ({quizAction.quiz.questions.length} {quizAction.quiz.questions.length === 1 ? 'question' : 'questions'}, {quizAction.quiz.status.toLowerCase()}) and remove it from the student dashboard. This cannot be undone.{quizAction.error && <Alert type="error" className="mb-0 mt-3">{quizAction.error}</Alert>}</div>
          : `“${studentQuizTitle(quizAction.quiz.title)}” will remain visible to students, but they will not be able to start, open, or submit it until you enable it again.`}
      confirmLabel={quizAction.action === 'force-delete' ? 'Force Delete Quiz' : quizAction.action === 'delete' ? 'Delete Quiz' : 'Disable Quiz'}
      confirmVariant="danger"
      confirmDisabled={quizAction.action === 'force-delete' && quizAction.confirmation !== 'DELETE'}
      loading={busy === `quiz-${quizAction.action}-${quizAction.quiz.id}`}
      loadingLabel={['delete', 'force-delete'].includes(quizAction.action) ? 'Deleting…' : 'Disabling…'}
      onCancel={() => setQuizAction(null)}
      onConfirm={confirmQuizAction}
    />}
    {confirmApprove && <ConfirmModal title="Approve lesson context?" body="This freezes the reviewed version as the only source Gemini may use. Later changes require reopening review and approving a new version." confirmLabel="Approve Context" confirmVariant="success" loading={busy === 'approve'} onCancel={() => setConfirmApprove(false)} onConfirm={approve}/>}
  </DashboardLayout>;
}

function SourceCard({ chunk, materials, selected, draft, editing, onSelect, onToggleEdit, onPatch, onOpenImage, onOpenPdf }) {
  const included = !chunk.removed;
  return <Card role="listitem" className={`context-source-card ${selected ? 'is-selected' : ''} ${included ? '' : 'is-excluded'}`}>
    <header className="context-source-card-header">
      <button type="button" aria-pressed={selected} onClick={onSelect} className="context-source-select">
        <span>{sourceTypeLabel(chunk.type)}</span>
        <strong>{sourceLabel(chunk)}</strong>
      </button>
      <div className="context-source-state">{chunk.uncertain && <Badge status="UNCERTAIN"/>}<span className={included ? 'is-included' : 'is-excluded'}>{chunk.partiallyRemoved ? 'Partially included' : included ? 'Included' : 'Excluded'}</span></div>
    </header>
    <div className="context-source-card-body">
      <SourceThumbnail chunk={chunk} materials={materials} onOpenImage={onOpenImage} onOpenPdf={onOpenPdf}/>
      <div className="context-source-content">
        <SourceCleanPreview chunk={chunk}/>
        {chunk.isTranscriptGroup && chunk.source?.recordingId && <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/60">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Lesson audio</p>
          <ProtectedAudioPlayer url={`/api/audio-recordings/${chunk.source.recordingId}/audio`}/>
        </div>}
        {chunk.isTranscriptGroup && <TranscriptSegmentDetails chunk={chunk}/>}
        {draft && <details open={editing} onToggle={event => onToggleEdit(event.currentTarget.open)}>
          <summary><Pencil size={15}/> {chunk.isTranscriptGroup ? 'Edit Transcript' : 'Edit interpreted content'}</summary>
          <label>{chunk.isTranscriptGroup ? 'Reviewed transcript' : 'Interpreted text'}<Textarea value={humanText(chunk.text)} onChange={event => onPatch({ text: event.target.value })}/></label>
          {latexValues(chunk.math).length > 0 && <MathAwareEditor unified multiline label="Recognized mathematics" value={mathMarkdown(chunk.math)} onChange={value => onPatch({ math: mathValues(value) })}/>} 
        </details>}
      </div>
    </div>
    {draft && <footer className="context-source-card-footer"><Btn variant={included ? 'ghost' : 'secondary'} aria-pressed={included} onClick={() => onPatch({ removed: included })}>{included ? <><CircleMinus size={16}/> {chunk.isTranscriptGroup ? 'Exclude Lesson Transcript' : 'Exclude from context'}</> : <><CircleCheck size={16}/> {chunk.isTranscriptGroup ? 'Include Lesson Transcript' : 'Include in context'}</>}</Btn></footer>}
  </Card>;
}

function TranscriptSegmentDetails({ chunk }) {
  const segments = chunk.transcriptSegments || [];
  return <details className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950/40">
    <summary className="cursor-pointer font-semibold text-slate-700 dark:text-slate-200">View timestamped segments ({segments.length})</summary>
    <ol className="mt-3 space-y-2">
      {segments.map((segment, index) => <li key={`${segment.originalIndex}-${segment.lessonOffsetStartMs}-${index}`} className="grid grid-cols-[auto_1fr] gap-3 border-t border-slate-100 pt-2 first:border-0 first:pt-0 dark:border-slate-800">
        <time className="font-mono text-xs font-semibold text-info">{formatTranscriptTime(segment.lessonOffsetStartMs)}</time>
        <span className="min-w-0 whitespace-pre-wrap break-words text-slate-600 dark:text-slate-300">{humanText(segment.text)}</span>
      </li>)}
    </ol>
  </details>;
}

function SourceCleanPreview({ chunk }) {
  const [expanded, setExpanded] = useState(false);
  const preview = useMemo(() => buildLessonContextPreview(humanText(chunk.text), latexValues(chunk.math)), [chunk.math, chunk.text]);
  return <div className="context-source-preview">
    <p className="context-source-preview-label">Recognized lesson content</p>
    {preview.full ? <GeneratedContent markdown={expanded || !preview.isLong ? preview.full : preview.concise} reviewIndicator/> : <p>No readable text or mathematics was recognized.</p>}
    {preview.isLong && <button type="button" className="context-source-preview-toggle" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Show concise preview' : 'View full recognized solution'}<ChevronDown size={16} aria-hidden="true"/></button>}
  </div>;
}

function SourceThumbnail({ chunk, materials, onOpenImage, onOpenPdf }) {
  const source = chunk.source || {};
  const material = materials.find(item => item.id === source.materialId);
  const imageUrl = sourceImageUrl(chunk, materials);
  if (imageUrl) return <button type="button" onClick={onOpenImage} className="context-source-thumbnail is-image" aria-label={`Open ${sourceLabel(chunk)} in full-size viewer`}><ProtectedCaptureImage url={imageUrl} alt="" className="h-full w-full object-contain"/><span><Maximize2 size={15}/> View source</span></button>;
  if (chunk.type === 'PDF' && material) return <button type="button" onClick={() => onOpenPdf({ ...material, initialPage: source.pdfPageNumber })} className="context-source-thumbnail"><FileText size={26}/><span>Open PDF page {source.pdfPageNumber}</span></button>;
  if (chunk.type === 'SPEECH') return <div className="context-source-thumbnail" aria-hidden="true"><Mic size={26}/><span>Audio transcript</span></div>;
  return <div className="context-source-thumbnail" aria-hidden="true"><ImageIcon size={26}/><span>Source preview</span></div>;
}

function SourceInspector({ chunk, materials, onOpenImage, onOpenPdf }) {
  if (!chunk) return <Card className="p-5 text-sm text-slate-500">Select a source to inspect it.</Card>;
  const source = chunk.source || {};
  const material = materials.find(item => item.id === source.materialId);
  const imageUrl = sourceImageUrl(chunk, materials);
  const identifiers = [['Context chunk', chunk.id], ['Capture', source.captureId], ['Material', source.materialId], ['Recording', source.recordingId]].filter(([, value]) => value);
  return <Card className="source-inspector overflow-hidden p-4"><p>Source preview</p><h3>{sourceLabel(chunk)}</h3>
    {imageUrl && <button type="button" onClick={onOpenImage} className="source-inspector-image" aria-label={`Open ${sourceLabel(chunk)} in full-size viewer`}><ProtectedCaptureImage url={imageUrl} alt={sourceLabel(chunk)} className="max-h-[55vh] w-full bg-slate-950 object-contain"/><span><Maximize2 size={15}/> Inspect full size</span></button>}
    {chunk.type === 'PDF' && material && <Btn className="mt-4 w-full" variant="secondary" onClick={() => onOpenPdf({ ...material, initialPage: source.pdfPageNumber })}>Open protected PDF • Page {source.pdfPageNumber}</Btn>}
    {chunk.type === 'SPEECH' && <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-900">The lesson audio and timestamped evidence are available in the transcript source card.</p>}
    <details className="source-raw-recognition"><summary>Advanced · View raw recognition</summary><div className="source-raw-panel">{identifiers.length > 0 && <dl>{identifiers.map(([label, value]) => <div key={label}><dt>{label} ID</dt><dd>{value}</dd></div>)}</dl>}<h4>Raw recognized text</h4><pre>{humanText(chunk.rawText) || 'No raw recognition text is available.'}</pre></div></details>
  </Card>;
}

function QuizEditor({ lessonId, navigationState, quiz, expanded, busy, onToggle, onSave, onDelete, onManage }) {
  const hasUnresolvedMath = useMemo(() => quiz.questions.some(question => [question.prompt, question.explanation, question.correctAnswer, ...(question.choices || [])].some(value => normalizeLessonMathContent(value).needsReview.length > 0)), [quiz.questions]);
  const draftsRef = useRef(new Map());
  const rememberDraft = useCallback((questionId, draft) => {
    draftsRef.current.set(questionId, draft);
  }, []);
  const contentId = `quiz-content-${quiz.id}`;
  const toggleId = `quiz-toggle-${quiz.id}`;
  const status = String(quiz.status || 'DRAFT').replaceAll('_', ' ').toLowerCase();
  const difficulty = String(quiz.difficulty || 'MEDIUM').toLowerCase();
  const created = quiz.createdAt ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(quiz.createdAt)) : '';
  const managementBusy = busy.endsWith(`-${quiz.id}`) && busy.startsWith('quiz-');
  const managementLabel = busy === `quiz-publish-${quiz.id}` ? 'Publishing…' : busy === `quiz-disable-${quiz.id}` ? 'Disabling…' : busy === `quiz-enable-${quiz.id}` ? 'Enabling…' : busy === `quiz-delete-${quiz.id}` ? 'Deleting…' : '';

  return <Card className={`quiz-history-card ${expanded ? 'is-expanded' : ''}`}>
    <div className="quiz-management-heading">
    <h2 className="quiz-disclosure-heading">
      <button id={toggleId} type="button" className="quiz-disclosure-toggle" aria-expanded={expanded} aria-controls={contentId} onClick={onToggle}>
        <span className="quiz-disclosure-copy">
          <strong>{studentQuizTitle(quiz.title)}</strong>
          <span>
            {quiz.questions.length} {quiz.questions.length === 1 ? 'question' : 'questions'}
            <span aria-hidden="true"> · </span>{difficulty}
            {created && <><span aria-hidden="true"> · </span>Generated {created}</>}
          </span>
        </span>
        <span className="quiz-disclosure-action">
          <span className={`quiz-disclosure-status is-${status.replaceAll(' ', '-')}`}>{status}</span>
          <span>{managementLabel || (expanded ? 'Collapse' : 'Expand')}</span>
          {managementLabel ? <LoaderCircle className="animate-spin" size={17} aria-hidden="true"/> : <ChevronDown size={18} aria-hidden="true"/>}
        </span>
      </button>
    </h2>
      <DropdownMenu>
        <DropdownMenuTrigger className="quiz-management-trigger" aria-label={`Manage ${studentQuizTitle(quiz.title)}`} disabled={managementBusy}><MoreVertical size={19} aria-hidden="true"/></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => { if (!expanded) onToggle(); }}><Pencil size={16}/>Edit Quiz</DropdownMenuItem>
          {quiz.status === 'DRAFT' && <DropdownMenuItem disabled={hasUnresolvedMath} onClick={() => onManage('publish', quiz)}><CircleCheck size={16}/>Publish Quiz</DropdownMenuItem>}
          {quiz.status === 'PUBLISHED' && <DropdownMenuItem onClick={() => onManage('disable', quiz)}><Ban size={16}/>Disable Quiz</DropdownMenuItem>}
          {quiz.status === 'DISABLED' && <DropdownMenuItem onClick={() => onManage('enable', quiz)}><CircleCheck size={16}/>Enable Quiz</DropdownMenuItem>}
          <DropdownMenuItem variant="destructive" onClick={() => onManage('delete', quiz)}><Trash2 size={16}/>Delete Quiz</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    {quiz.status !== 'DRAFT' && <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 px-4 py-3 dark:border-slate-700">
      <Link to={`/instructor/quizzes/${quiz.id}/attempts`} state={{...navigationState,from:`/instructor/lessons/${lessonId}/review?view=workspace`}}><Btn variant="secondary">Review Attempts</Btn></Link>
      <span className="text-xs text-slate-500">{quiz.questions.filter(question=>question.type==='PROBLEM_SOLVING').length} Problem Solving · View submissions and pending reviews</span>
    </div>}
    {expanded && <div id={contentId} className="quiz-disclosure-content" role="region" aria-labelledby={toggleId}>
      <div className="quiz-disclosure-toolbar">
        <p>{quiz.instructions}</p>
        <div>
          {quiz.status !== 'DRAFT' && lessonId && <Link to={`/instructor/quizzes/${quiz.id}/analytics`} state={{ ...navigationState, from: `/instructor/lessons/${lessonId}/review?view=workspace`, quizId: quiz.id }}><Btn variant="secondary">View Analytics</Btn></Link>}
        </div>
      </div>
      {quiz.status === 'DRAFT' && hasUnresolvedMath && <Alert type="warning" label="Math review" className="mb-4">Resolve the marked math fields and save each question before publishing.</Alert>}
      <div className="quiz-disclosure-questions">{quiz.questions.map((question, questionIndex) => <QuizQuestionEditor
        key={question.id}
        quizId={quiz.id}
        quizStatus={quiz.status}
        question={question}
        questionIndex={questionIndex}
        initialDraft={draftsRef.current.get(question.id)}
        busy={busy === question.id}
        onDraftChange={rememberDraft}
        onSave={onSave}
        onDelete={onDelete}
      />)}</div>
    </div>}
  </Card>;
}
