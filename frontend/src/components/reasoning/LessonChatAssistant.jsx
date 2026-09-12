import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { History, Mic, RotateCcw, Send, Undo2 } from 'lucide-react';
import { Alert, Btn, ConfirmModal, Input } from '../ui';
import AiAssistantAvatar from './AiAssistantAvatar';
import GeneratedContent from './GeneratedContent';
import LessonChatHistory from './LessonChatHistory';
import '../../../../shared/quizEditTargeting.cjs';
import { deleteLessonChatConversation, generateQuizFromLessonChat, getLessonChat, sendLessonChatMessage, undoLastLessonEdit } from '../../services/lessonChatApi';

const GENERAL_ACTIONS = [
  ['Explain lesson', 'Explain the approved lesson clearly and concisely.', 'ASK'],
  ['Generate notes', 'Generate notes.', 'GENERATE_LESSON'],
  ['Key formulas', 'List and explain the key formulas in this approved lesson.', 'ASK'],
  ['Generate quiz', 'Generate a quiz about this lesson.', 'GENERATE_QUIZ'],
];

const HISTORY_PREFERENCE_KEY = 'sea-it-solved.lesson-assistant.history-open';

function storedHistoryPreference() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(HISTORY_PREFERENCE_KEY) === 'true';
  } catch {
    return false;
  }
}

function documentStages(action) {
  if (action === 'GENERATE_QUIZ') return [
    { id: 'context', label: 'Reading approved lesson context', status: 'active' },
    { id: 'request', label: 'Understanding quiz request', status: 'pending' },
    { id: 'structure', label: 'Planning questions', status: 'pending' },
    { id: 'generate', label: 'Creating questions', status: 'pending' },
    { id: 'validate', label: 'Validating answers', status: 'pending' },
    { id: 'apply', label: 'Saving quiz draft', status: 'pending' },
  ];
  if (action === 'EDIT_QUIZ') return [
    { id: 'context', label: 'Finding the draft quiz', status: 'active' },
    { id: 'structure', label: 'Locating the requested question', status: 'pending' },
    { id: 'generate', label: 'Updating quiz content', status: 'pending' },
    { id: 'validate', label: 'Validating answers and options', status: 'pending' },
    { id: 'apply', label: 'Saving draft quiz changes', status: 'pending' },
  ];
  if (action === 'EDIT_LESSON') return [
    { id: 'context', label: 'Preparing current lesson', status: 'active' },
    { id: 'structure', label: 'Locating requested content', status: 'pending' },
    { id: 'generate', label: 'Applying requested changes', status: 'pending' },
    { id: 'validate', label: 'Validating mathematics', status: 'pending' },
    { id: 'apply', label: 'Rebuilding document layout', status: 'pending' },
  ];
  return [
    { id: 'context', label: 'Reading approved lesson context', status: 'active' },
    { id: 'structure', label: 'Planning lesson structure', status: 'pending' },
    { id: 'generate', label: ['GENERATE_LESSON', 'REGENERATE_LESSON'].includes(action) ? 'Generating lesson notes' : 'Generating the update', status: 'pending' },
    { id: 'validate', label: 'Validating mathematics', status: 'pending' },
    { id: 'apply', label: 'Updating lesson material', status: 'pending' },
  ];
}

const { explicitQuizGeneration, quizEditIntent: isQuizEditRequest } = globalThis[Symbol.for('sea-it-solved.quizEditTargeting')];

function isGenerateNotesRequest(message, explicitIntent) {
  if (['GENERATE_NOTES', 'GENERATE_LESSON', 'REGENERATE_LESSON'].includes(explicitIntent)) return true;
  return /\b(re-?generate|generate|create|prepare|build|draft)\b[\s\S]{0,48}\b(?:(?:lesson\s+)?(?:notes?|materials?|handout|document)|lesson)\b|\b(?:(?:lesson\s+)?(?:notes?|materials?|handout|document)|lesson)\b[\s\S]{0,32}\b(re-?generate|generate|create|prepare|build)\b/i.test(message);
}

function isRegenerateNotesRequest(message, explicitIntent) {
  return explicitIntent === 'REGENERATE_LESSON' || /\bre-?generate\b[\s\S]{0,40}\b(lesson|notes?|materials?|handout|document)\b/i.test(message);
}

function isGenerateQuizRequest(message, explicitIntent) {
  if (['QUIZ', 'GENERATE_QUIZ'].includes(explicitIntent)) return true;
  return /\b(generate|create|make|build)\b[\s\S]{0,40}\b(quiz|questions?|problems?)\b|\bgive\s+(?:me|us)\b[\s\S]{0,40}\b(quiz|questions?|problems?)\b|\bquiz\b[\s\S]{0,30}\b(generate|create|make)\b/i.test(message);
}

function isQuizOptionReply(message, draft) {
  if (!draft) return false;
  const text = String(message || '').trim();
  return /\b(?:quiz|questions?|items?|difficulty|multiple[-\s]+choice|mcqs?|problem[-\s]+solving|solution[-\s]+required)\b/i.test(text)
    || /^(?:actually\s+)?(?:make\s+it\s+)?(?:easy|medium|hard|multiple[-\s]+choice|mcqs?|problem[-\s]+solving|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|\d{1,3})(?:\s+please)?[.!?]*$/i.test(text);
}

function friendly(error, editing = false) {
  if (error.response?.status === 503) return 'AI is temporarily unavailable. Please try again.';
  if (error.response?.status === 429) return 'The AI service is temporarily rate-limited. Please try again shortly.';
  if (error.response?.status === 409) return error.response?.data?.error || 'Approve the lesson context before using the lesson assistant.';
  if (error.response?.status === 422 && editing) return "I couldn't safely apply that edit. Name the section or describe the content more specifically.";
  return error.response?.data?.error || 'AI is temporarily unavailable. Please try again.';
}

function isEditRequest(message, explicitIntent) {
  if (['EDIT', 'EDIT_LESSON'].includes(explicitIntent)) return true;
  if (['ASK', 'CHAT_QUERY'].includes(explicitIntent)) return false;
  const mutation = /\b(make|shorten|rewrite|remove|delete|add|change|rename|fix|format|simplify|condense|concise|improve|update|expand)\b/i.test(message);
  const documentTarget = /\b(section|pages?|paragraph|lessons?|lesson\s+notes?|notes?|materials?|document|explanation|samples?|examples?|key\s+takeaways?|summary|common\s+mistakes?|reminders?|key\s+formulas?|formula\s+section|worked\s+examples?|concept\s+explanation|this\s+part|this\s+section|example\s+above)\b/i.test(message);
  return mutation && documentTarget;
}

function isWholeLessonEdit(message) {
  return /\b(?:whole|entire|full)\s+(?:current\s+|existing\s+|generated\s+)?(?:lesson|document|lesson\s+notes?|lesson\s+materials?)\b|\ball\s+of\s+it\b|\b(?:all|everything)\s+(?:in\s+|from\s+|of\s+)?(?:the\s+)?(?:current\s+|existing\s+|generated\s+)?(?:lesson|document|lesson\s+notes?|lesson\s+materials?)\b/i.test(message);
}

function pageMaterialTarget(message, pageContext, materials) {
  const pageNumber = Number(String(message || '').match(/\bpage\s+(\d{1,3})\b/i)?.[1]);
  if (!Number.isInteger(pageNumber) || pageNumber < 1) return '';
  const ids = pageContext?.pageMaterialIds?.[pageNumber - 1] || [];
  return ids.find(id => materials.some(material => material.id === id)) || '';
}

function semanticMaterialTarget(message, materials, fallbackId = '') {
  const text = String(message || '');
  const targetType = /\b(summary|key takeaways?)\b/i.test(text) ? 'SUMMARY'
    : /\b(worked example|examples?|samples?|example above)\b/i.test(text) ? 'WORKED_EXAMPLE'
      : /\b(key formulas?|formula section|equations?)\b/i.test(text) ? 'KEY_FORMULAS'
        : /\b(common mistakes?|reminders?)\b/i.test(text) ? 'COMMON_MISTAKES'
          : /\b(concept explanation|explanation)\b/i.test(text) ? 'EXPLANATION'
            : /\b(lesson notes?|notes?|materials?|lessons?)\b/i.test(text) ? 'NOTES' : '';
  return materials.find(item => item.type === targetType)?.id || fallbackId || '';
}

function restoredQuizOptions(messages) {
  const relevant=[...(messages||[])].reverse().find(message =>
    message.role === 'ASSISTANT' && ['QUIZ_OPTIONS_REQUIRED', 'QUIZ_CREATED'].includes(message.action)
  );
  if(relevant?.action !== 'QUIZ_OPTIONS_REQUIRED')return null;
  const draft=relevant.quizDraft||{};
  return {
    prompt: relevant.quizPrompt || draft.prompt || '',
    difficulty: draft.difficulty || null,
    questionCount: draft.questionCount ?? null,
    questionType: draft.questionType || null,
    missingParameters: relevant.missingQuizParameters || ['questionCount','difficulty','questionType'],
    instruction: relevant.content || '',
  };
}

export default function LessonChatAssistant({ lessonId, lessonTitle, materials, selectedMaterialId, documentPageContext, onMaterialsUpdated, onEditStateChange, onQuizCreated, onReviewQuiz, onQuizUpdated }) {
  const reduceMotion = useReducedMotion();
  const [messages, setMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [historySearch, setHistorySearch] = useState('');
  const [desktopHistoryOpen, setDesktopHistoryOpen] = useState(storedHistoryPreference);
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [compactHistory, setCompactHistory] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 1279px)').matches);
  const [historyError, setHistoryError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingConversation, setDeletingConversation] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [operation, setOperation] = useState('ASK');
  const [error, setError] = useState('');
  const [retryRequest, setRetryRequest] = useState(null);
  const [canUndo, setCanUndo] = useState(false);
  const [quizOptions, setQuizOptions] = useState(null);
  const [activity, setActivity] = useState('');
  const [documentTask, setDocumentTask] = useState(null);
  const [listening, setListening] = useState(false);
  const [voiceAvailable] = useState(() => typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const activityTimerRef = useRef(null);
  const taskTimersRef = useRef([]);
  const requestInFlightRef = useRef(false);
  const suggestedActions = useMemo(() => GENERAL_ACTIONS, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const query = window.matchMedia('(max-width: 1279px)');
    const update = () => setCompactHistory(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(HISTORY_PREFERENCE_KEY, String(desktopHistoryOpen));
    } catch {
      // Storage can be unavailable in privacy-restricted browsing contexts.
    }
  }, [desktopHistoryOpen]);

  function clearTaskProgressTimers() {
    taskTimersRef.current.forEach(timer => window.clearTimeout(timer));
    taskTimersRef.current = [];
  }

  function advanceTask(stageId, progress, detail) {
    setDocumentTask(current => {
      if (!current || current.status !== 'running' || progress < (current.progress || 0)) return current;
      const activeIndex = current.stages.findIndex(stage => stage.id === stageId);
      return {
        ...current,
        progress,
        detail,
        stages: current.stages.map((stage, index) => ({ ...stage, status: index < activeIndex ? 'completed' : index === activeIndex ? 'active' : 'pending' })),
      };
    });
  }

  function beginTaskProgress(action) {
    clearTaskProgressTimers();
    const generatingQuiz = action === 'GENERATE_QUIZ';
    const editingQuiz = action === 'EDIT_QUIZ';
    const editingLesson = action === 'EDIT_LESSON';
    const transitions = [
      [700, 'context', editingLesson ? 20 : 10, editingLesson ? 'Preparing current lesson...' : editingQuiz ? 'Finding the draft quiz...' : 'Reading approved lesson context...'],
      ...(generatingQuiz ? [[1400, 'request', 25, 'Understanding quiz request...']] : []),
      [2200, 'structure', 40, editingLesson ? 'Locating requested content...' : editingQuiz ? 'Locating the requested question...' : generatingQuiz ? 'Planning questions...' : 'Planning lesson structure...'],
      [3800, 'generate', editingLesson ? 55 : 70, editingLesson ? 'Applying requested changes...' : editingQuiz ? 'Updating quiz content...' : generatingQuiz ? 'Generating quiz questions...' : 'Generating lesson notes...'],
      [6000, 'validate', editingLesson ? 80 : 85, editingLesson ? 'Updating document...' : generatingQuiz || editingQuiz ? 'Validating questions and answers...' : 'Checking formulas...'],
      [8500, 'apply', 95, editingLesson ? 'Rebuilding document layout...' : generatingQuiz ? 'Saving quiz draft...' : 'Almost done...'],
    ];
    taskTimersRef.current = transitions.map(([delay, stage, progress, detail]) => window.setTimeout(() => advanceTask(stage, progress, detail), delay));
  }

  function showActivity(value) {
    window.clearTimeout(activityTimerRef.current);
    setActivity(value);
    activityTimerRef.current = window.setTimeout(() => setActivity(''), 2400);
  }

  function applyConversationResult(result) {
    const nextMessages=result.messages||[];
    setConversations(result.conversations||[]);
    setActiveConversationId(result.activeConversationId||null);
    setMessages(nextMessages);
    setCanUndo(Boolean(result.canUndo));
    setQuizOptions(restoredQuizOptions(nextMessages));
  }

  function upsertConversation(result) {
    const conversation=result?.conversation;
    if(!conversation)return;
    setActiveConversationId(conversation.id);
    setConversations(current => [
      conversation,
      ...current.filter(item => item.id !== conversation.id),
    ].slice(0,30));
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setHistoryError('');
    setConversations([]);
    setActiveConversationId(null);
    setQuizOptions(null);
    getLessonChat(lessonId)
      .then(result => {
        if (active) applyConversationResult(result);
      })
      .catch(nextError => { if (active) { const message=friendly(nextError); setError(message); setHistoryError(message); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [lessonId]);

  useEffect(() => () => { window.clearTimeout(activityTimerRef.current); clearTaskProgressTimers(); }, []);

  useEffect(() => () => recognitionRef.current?.abort?.(), []);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`;
  }, [input]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [documentTask, messages, sending]);

  async function selectConversation(conversationId) {
    if(requestInFlightRef.current || conversationId===activeConversationId)return;
    setLoading(true);
    setError('');
    setHistoryError('');
    try{
      const result=await getLessonChat(lessonId,conversationId);
      applyConversationResult(result);
      setMobileHistoryOpen(false);
    }catch(nextError){
      setHistoryError(nextError.response?.data?.error||'Conversation could not be loaded.');
    }finally{
      setLoading(false);
    }
  }

  function startNewChat() {
    if(requestInFlightRef.current)return;
    setActiveConversationId(null);
    setMessages([]);
    setQuizOptions(null);
    setDocumentTask(null);
    setError('');
    setRetryRequest(null);
    setMobileHistoryOpen(false);
    window.setTimeout(()=>inputRef.current?.focus(),0);
  }

  async function removeConversation() {
    if(!deleteTarget || deletingConversation)return;
    setDeletingConversation(true);
    setHistoryError('');
    try{
      await deleteLessonChatConversation(lessonId,deleteTarget.id);
      const deletingActive=deleteTarget.id===activeConversationId;
      setDeleteTarget(null);
      if(deletingActive){
        const result=await getLessonChat(lessonId);
        applyConversationResult(result);
      }else{
        setConversations(current=>current.filter(item=>item.id!==deleteTarget.id));
      }
      showActivity('Conversation deleted');
    }catch(nextError){
      setHistoryError(nextError.response?.data?.error||'Conversation could not be deleted.');
      setDeleteTarget(null);
    }finally{
      setDeletingConversation(false);
    }
  }

  function startVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Voice input is unavailable in this browser.');
      return;
    }
    recognitionRef.current?.abort?.();
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = () => { setError(''); setListening(true); };
    recognition.onresult = event => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (transcript) setInput(current => `${current}${current ? ' ' : ''}${transcript}`);
    };
    recognition.onerror = () => setError('Voice input could not be captured. You can continue typing your request.');
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
  }

  async function submit(prompt = input, intent, retryMessageId = '') {
    const clean = String(prompt || '').trim();
    if (!clean || requestInFlightRef.current) return;
    const pendingQuizDraft = quizOptions;
    const quizContinuation = isQuizOptionReply(clean, pendingQuizDraft);
    const explicitCreation = explicitQuizGeneration(clean);
    const quizEditing = !explicitCreation && isQuizEditRequest(clean, intent);
    const generateNotes = !explicitCreation && !quizEditing && isGenerateNotesRequest(clean, intent);
    const regenerateNotes = generateNotes && isRegenerateNotesRequest(clean, intent);
    const generateQuiz = quizContinuation || explicitCreation || (!quizEditing && !generateNotes && isGenerateQuizRequest(clean, intent));
    const mode = quizEditing ? 'EDIT_QUIZ' : regenerateNotes ? 'REGENERATE_LESSON' : generateNotes ? 'GENERATE_LESSON' : generateQuiz ? 'GENERATE_QUIZ' : intent || undefined;
    const editing = !quizEditing && !generateNotes && !generateQuiz && isEditRequest(clean, mode);
    const documentAction = generateNotes || editing;
    const taskAction = quizEditing ? 'EDIT_QUIZ' : regenerateNotes ? 'REGENERATE_LESSON' : generateNotes ? 'GENERATE_LESSON' : generateQuiz ? 'GENERATE_QUIZ' : editing ? 'EDIT_LESSON' : '';
    const taskRequest = Boolean(taskAction);
    const optimisticId = retryMessageId || `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    if (!documentAction) setDocumentTask(null);
    requestInFlightRef.current = true;
    setSending(true);
    setOperation(taskAction || 'ASK');
    setActivity('');
    setError('');
    setRetryRequest(null);
    if (!quizContinuation) setQuizOptions(null);
    setInput('');
    const wholeLessonEdit = editing && isWholeLessonEdit(clean);
    const targetMaterialId = documentAction && !generateNotes && !wholeLessonEdit
      ? pageMaterialTarget(clean, documentPageContext, materials) || semanticMaterialTarget(clean, materials, selectedMaterialId)
      : '';
    if (documentAction) {
      onEditStateChange?.({ active: true, targetMaterialId });
    }
    if (taskRequest) {
      setDocumentTask({
        type: quizEditing ? 'quiz_action' : 'document_action',
        action: taskAction,
        title: quizEditing ? 'Updating quiz' : regenerateNotes ? 'Regenerating lesson notes' : generateNotes ? 'Generating lesson notes' : generateQuiz ? 'Generating quiz draft' : 'Updating lesson notes',
        prompt: clean,
        messageId: optimisticId,
        status: 'running',
        progress: taskAction === 'GENERATE_QUIZ' ? 10 : 8,
        detail: 'Starting...',
        stages: documentStages(taskAction),
        error: '',
      });
      beginTaskProgress(taskAction);
    }
    setMessages(current => retryMessageId
      ? current.map(item => item.localId === retryMessageId ? { ...item, pending: true, failed: false } : item)
      : [...current, { role: 'USER', content: clean, createdAt: new Date().toISOString(), pending: true, localId: optimisticId }]);
    try {
      const result = await sendLessonChatMessage(lessonId, {
        message: clean,
        intent: mode,
        selectedMaterialId: targetMaterialId || selectedMaterialId,
        quizDraft: quizContinuation ? pendingQuizDraft : undefined,
        conversationId: activeConversationId || undefined,
        newConversation: !activeConversationId,
      });
      upsertConversation(result);
      setMessages(current => current.map(item => item.localId === optimisticId ? { ...item, pending: false, failed: false } : item));
      const appendResultMessage = () => setMessages(current => [...current, result.message]);
      if (result.requiresQuizOptions) {
        appendResultMessage();
        const draft=result.quizDraft||{};
        setQuizOptions({prompt:result.quizPrompt||clean,difficulty:draft.difficulty||result.difficulty||null,questionCount:draft.questionCount??result.questionCount??null,questionType:draft.questionType||result.questionType||null,missingParameters:result.missingQuizParameters||['questionCount','difficulty','questionType'],instruction:result.message?.content||''});
        setDocumentTask(null);
        showActivity('Quiz options needed');
      } else if (result.materials || result.quiz || result.quizCreated) {
        clearTaskProgressTimers();
        advanceTask('apply', 96, 'Finalizing changes...');
        if (result.materials && result.changedMaterialId) {
          const previewMaterial = result.materials.find(item => item.id === result.changedMaterialId);
          if (previewMaterial?.content?.markdown) {
            onEditStateChange?.({ active: true, targetMaterialId: result.changedMaterialId, previewMarkdown: previewMaterial.content.markdown, previewReady: true });
            if (!reduceMotion) await new Promise(resolve => window.setTimeout(resolve, 480));
          }
        }
        if (result.materials) onMaterialsUpdated?.(result.materials, result.changedMaterialId, result.document, {
          resetPage: ['GENERATE_LESSON', 'REGENERATE_LESSON'].includes(result.documentAction),
        });
        if (result.quiz) onQuizUpdated?.(result.quiz);
        if (result.quizCreated) { setQuizOptions(null); onQuizCreated?.(); }
        setDocumentTask(current => current ? {
          ...current,
          status: 'completed',
          progress: 100,
          detail: taskAction === 'EDIT_LESSON' ? '✓ Lesson updated' : '✓ Update complete',
          stages: current.stages.map(stage => ({ ...stage, status: 'completed' })),
        } : current);
        if (!reduceMotion) await new Promise(resolve => window.setTimeout(resolve, 520));
        setDocumentTask(null);
        appendResultMessage();
        if (result.materials) setCanUndo(Boolean(result.canUndo));
        showActivity(quizEditing ? 'Quiz draft updated' : generateNotes ? 'Lesson notes applied' : generateQuiz ? 'Quiz draft created' : 'Revision applied');
      } else {
        clearTaskProgressTimers();
        if (taskRequest) setDocumentTask(null);
        appendResultMessage();
        showActivity('Response ready');
      }
    } catch (nextError) {
      const message = friendly(nextError, taskRequest);
      setMessages(current => current.map(item => item.localId === optimisticId ? { ...item, pending: false, failed: true } : item));
      if (taskRequest) {
        clearTaskProgressTimers();
        setDocumentTask(current => current ? {
          ...current,
          status: 'failed',
          error: message,
          stages: current.stages.map(stage => stage.status === 'active' ? { ...stage, status: 'failed' } : stage),
        } : current);
      } else {
        setError(message);
        if (nextError.response?.status === 503) {
          setRetryRequest({ prompt: clean, intent: mode, messageId: optimisticId });
        }
      }
      showActivity(taskRequest ? quizEditing ? 'Quiz update failed' : 'Document update failed' : 'Request failed');
    } finally {
      if (documentAction) onEditStateChange?.({ active: false, targetMaterialId: '' });
      requestInFlightRef.current = false;
      setSending(false);
    }
  }

  async function generateQuiz(options) {
    if (requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    setSending(true);
    setOperation('GENERATE_QUIZ');
    setActivity('');
    setError('');
    setDocumentTask({
      type: 'quiz_action',
      action: 'GENERATE_QUIZ',
      title: 'Generating quiz draft',
      prompt: options.prompt,
      options,
      status: 'running',
      progress: 10,
      detail: 'Starting...',
      stages: documentStages('GENERATE_QUIZ'),
      error: '',
    });
    beginTaskProgress('GENERATE_QUIZ');
    try {
      const result = await generateQuizFromLessonChat(lessonId, {
        ...options,
        conversationId: activeConversationId || undefined,
        newConversation: !activeConversationId,
        skipUserMessage: Boolean(activeConversationId),
      });
      upsertConversation(result);
      clearTaskProgressTimers();
      advanceTask('apply', 96, 'Saving quiz draft...');
      setQuizOptions(null);
      setDocumentTask(current => current ? { ...current, status: 'completed', progress: 100, detail: '✓ Update complete', stages: current.stages.map(stage => ({ ...stage, status: 'completed' })) } : current);
      if (!reduceMotion) await new Promise(resolve => window.setTimeout(resolve, 520));
      setDocumentTask(null);
      setMessages(current => [...current, result.message]);
      if (result.quizCreated) onQuizCreated?.();
      showActivity('Quiz draft created');
    } catch (nextError) {
      clearTaskProgressTimers();
      const message = nextError.response?.data?.error || 'Quiz generation could not be completed. Please try again.';
      setDocumentTask(current => current ? { ...current, status: 'failed', error: message, stages: current.stages.map(stage => stage.status === 'active' ? { ...stage, status: 'failed' } : stage) } : current);
      showActivity('Quiz generation failed');
    } finally {
      requestInFlightRef.current = false;
      setSending(false);
    }
  }

  async function undo() {
    if (requestInFlightRef.current || !canUndo) return;
    requestInFlightRef.current = true;
    setSending(true);
    setOperation('EDIT');
    setActivity('');
    setError('');
    try {
      const result = await undoLastLessonEdit(lessonId, {
        conversationId: activeConversationId || undefined,
        newConversation: !activeConversationId,
      });
      upsertConversation(result);
      setMessages(current => [...current, result.message]);
      onMaterialsUpdated?.(result.materials, result.changedMaterialId, result.document);
      setCanUndo(Boolean(result.canUndo));
      showActivity('Previous revision restored');
    } catch (nextError) {
      setError(friendly(nextError, true));
      showActivity('Undo failed');
    } finally {
      requestInFlightRef.current = false;
      setSending(false);
    }
  }

  const avatarState = error ? 'error'
    : sending ? ['EDIT_LESSON', 'GENERATE_LESSON', 'REGENERATE_LESSON', 'EDIT_QUIZ', 'GENERATE_QUIZ'].includes(operation) ? 'responding' : 'thinking'
      : activity ? 'done' : loading ? 'thinking' : 'idle';
  const statusText = loading ? 'Loading...'
    : sending ? ['EDIT_LESSON', 'GENERATE_LESSON', 'REGENERATE_LESSON', 'EDIT_QUIZ', 'GENERATE_QUIZ'].includes(operation) ? 'Updating...' : 'Thinking...'
      : error ? 'Needs attention' : activity ? 'Done' : 'Ready';
  const statusTone = avatarState === 'error' ? 'is-error' : avatarState === 'done' ? 'is-success' : ['thinking', 'responding'].includes(avatarState) ? 'is-working' : '';
  const waitingText = operation === 'GENERATE_QUIZ' ? 'Generating quiz draft...' : 'Thinking...';
  const missingQuizParameters = quizOptions?.missingParameters || [];
  const quizCountValid = Number.isInteger(Number(quizOptions?.questionCount)) && Number(quizOptions?.questionCount) >= 1 && Number(quizOptions?.questionCount) <= 20;
  const quizOptionsComplete = Boolean(quizOptions?.difficulty && quizCountValid && quizOptions?.questionType);

  return <>
    <aside className={`lesson-chat-assistant ${desktopHistoryOpen ? 'is-history-open' : ''}`} aria-labelledby="lesson-assistant-title">
      <LessonChatHistory
        conversations={conversations}
        activeId={activeConversationId}
        search={historySearch}
        onSearch={setHistorySearch}
        loading={loading}
        error={historyError}
        onNew={startNewChat}
        onSelect={selectConversation}
        onDelete={setDeleteTarget}
        desktopOpen={!compactHistory && desktopHistoryOpen}
        onDesktopOpenChange={setDesktopHistoryOpen}
        mobileOpen={mobileHistoryOpen}
        onMobileOpenChange={setMobileHistoryOpen}
      />
      <section className="lesson-chat-conversation" aria-label="Active AI conversation">
        <header className="lesson-chat-heading">
          <AiAssistantAvatar state={avatarState} />
          <span className="lesson-chat-heading-copy">
            <strong id="lesson-assistant-title">AI Lesson Assistant</strong>
            <small>{lessonTitle || 'Approved lesson workspace'}</small>
          </span>
          <span className="lesson-chat-heading-actions">
            <button
              type="button"
              className="lesson-chat-history-toggle"
              aria-label={`${(compactHistory ? mobileHistoryOpen : desktopHistoryOpen) ? 'Close' : 'Open'} chat history`}
              aria-expanded={compactHistory ? mobileHistoryOpen : desktopHistoryOpen}
              aria-controls={compactHistory ? 'lesson-chat-history-drawer' : 'lesson-chat-history-panel'}
              onClick={() => compactHistory ? setMobileHistoryOpen(true) : setDesktopHistoryOpen(open => !open)}
            ><History size={17} aria-hidden="true"/><span>History</span></button>
            <span className={`lesson-chat-status ${statusTone}`} role="status"><i aria-hidden/>{statusText}</span>
          </span>
        </header>

        <div className="lesson-chat-body">
        {error && <div className="lesson-chat-alert"><Alert type="error" onClose={() => { setError(''); setRetryRequest(null); }}>
          {error}
          {retryRequest && <button className="lesson-chat-inline-retry" type="button" disabled={sending} onClick={() => submit(retryRequest.prompt, retryRequest.intent, retryRequest.messageId)}><RotateCcw size={14}/>Retry</button>}
        </Alert></div>}

        <div className="lesson-chat-messages" aria-live="polite" aria-busy={loading || sending}>
          <div className="lesson-chat-transcript">
            <AnimatePresence initial={false}>
              {!loading && !messages.length && <motion.div
                key="lesson-chat-welcome"
                className="lesson-chat-empty"
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: reduceMotion ? 0 : .16, ease: 'easeOut' }}
              >
                <AiAssistantAvatar state="idle" size="lg"/>
                <strong>How can I help with this lesson?</strong>
                <p>Ask naturally to revise the lesson material, generate a quiz, or explain the approved lesson.</p>
                <div className="lesson-chat-actions lesson-chat-empty-actions" aria-label="Suggested lesson actions">
                  {suggestedActions.map(([label, prompt, intent]) => <button key={label} type="button" disabled={sending} onClick={() => submit(prompt, intent)}>{label}</button>)}
                </div>
              </motion.div>}
            </AnimatePresence>
            {loading && <div className="lesson-chat-loading"><AiAssistantAvatar state="thinking" size="sm"/><span>Loading conversation...</span></div>}
            {messages.map((message, index) => {
              const userMessage = message.role === 'USER';
              const author = userMessage ? 'You' : message.messageType === 'EDIT' ? 'Document Editor' : 'Assistant';
              return <motion.article
                key={`${message.localId || message.createdAt}-${index}`}
                className={`lesson-chat-message ${userMessage ? 'is-user' : 'is-assistant'} ${message.pending ? 'is-pending' : ''} ${message.failed ? 'is-failed' : ''}`}
                aria-label={`${author} message`}
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduceMotion ? 0 : .24, ease: 'easeOut' }}
              >
                {!userMessage && <AiAssistantAvatar state={activity && index === messages.length - 1 ? 'done' : 'idle'} size="sm"/>}
                <div className="lesson-chat-message-content">
                  {userMessage && <p className="lesson-chat-message-author">{author}</p>}
                  <GeneratedContent markdown={message.content} assistantText={!userMessage}/>
                  {message.sourceReferences?.length > 0 && <details><summary>Sources · {message.sourceReferences.length}</summary><ul>{message.sourceReferences.map((source, sourceIndex) => <li key={`${source}-${sourceIndex}`}>{source}</li>)}</ul></details>}
                  {message.action === 'QUIZ_CREATED' && <Btn size="sm" variant="secondary" onClick={onReviewQuiz}>Open Quiz Draft</Btn>}
                </div>
              </motion.article>;
            })}
            {quizOptions && <motion.section
              className="lesson-chat-quiz-options"
              aria-label="Quiz generation options"
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : .2, ease: 'easeOut' }}
            >
              <AiAssistantAvatar state="idle" size="sm"/>
              <div className="lesson-chat-quiz-options-content">
                <strong>{missingQuizParameters.length === 1 ? 'Choose quiz detail' : 'Choose quiz details'}</strong>
                <p>{quizOptions.instruction}</p>
                {missingQuizParameters.includes('difficulty') && <div className="lesson-chat-quiz-option-group" role="group" aria-label="Quiz difficulty">
                  <span>Difficulty</span>
                  <div>{['EASY', 'MEDIUM', 'HARD'].map(value => <button key={value} type="button" aria-pressed={quizOptions.difficulty === value} disabled={sending} onClick={() => setQuizOptions(current => ({ ...current, difficulty: value }))}>{value[0] + value.slice(1).toLowerCase()}</button>)}</div>
                </div>}
                {missingQuizParameters.includes('questionCount') && <label className="lesson-chat-quiz-option-group">
                  <span>Questions</span>
                  <Input type="number" min="1" max="20" step="1" inputMode="numeric" className="max-w-28" value={quizOptions.questionCount??''} disabled={sending} onChange={event=>setQuizOptions(current=>({...current,questionCount:event.target.value===''?null:Number(event.target.value)}))}/>
                  <small className="text-muted-foreground">Choose a whole number from 1 to 20.</small>
                </label>}
                {missingQuizParameters.includes('questionType') && <div className="lesson-chat-quiz-option-group" role="group" aria-label="Quiz question type">
                  <span>Question type</span>
                  <div>{[['MULTIPLE_CHOICE','Multiple choice'],['PROBLEM_SOLVING','Problem solving']].map(([value,label])=><button key={value} type="button" aria-pressed={quizOptions.questionType===value} disabled={sending} onClick={()=>setQuizOptions(current=>({...current,questionType:value}))}>{label}</button>)}</div>
                </div>}
                <div className="lesson-chat-quiz-option-actions"><Btn size="sm" disabled={sending||!quizOptionsComplete} onClick={() => generateQuiz(quizOptions)}>Generate Quiz</Btn><button type="button" disabled={sending} onClick={() => setQuizOptions(null)}>Cancel</button></div>
              </div>
            </motion.section>}
            {documentTask && <motion.section
              className={`lesson-chat-task is-${documentTask.status}`}
              aria-label={documentTask.title}
              aria-live="polite"
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : .24, ease: 'easeOut' }}
            >
              <div className="lesson-chat-task-heading">
                <AiAssistantAvatar state={documentTask.status === 'failed' ? 'error' : documentTask.status === 'completed' ? 'done' : 'responding'} size="sm"/>
                <strong>{documentTask.title}</strong>
              </div>
              <div className="lesson-chat-task-progress">
                <div role="progressbar" aria-label={`${documentTask.title} progress`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={documentTask.progress || 0}><span style={{ width: `${documentTask.progress || 0}%` }}/></div>
              </div>
              <div className="lesson-chat-task-status">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span key={`${documentTask.status}-${documentTask.detail}`} initial={reduceMotion ? false : { opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -3 }} transition={{ duration: reduceMotion ? 0 : .18 }}>{documentTask.status === 'failed' ? 'Update stopped' : documentTask.detail || 'Starting...'}</motion.span>
                </AnimatePresence>
                <span>{documentTask.progress || 0}%</span>
              </div>
              {documentTask.status === 'failed' && <div className="lesson-chat-task-error"><p>{documentTask.error || 'The requested update could not be completed.'}</p><button type="button" onClick={() => documentTask.action === 'GENERATE_QUIZ' && documentTask.options ? generateQuiz(documentTask.options) : submit(documentTask.prompt, documentTask.action, documentTask.messageId)}><RotateCcw size={14}/>Retry</button></div>}
            </motion.section>}
            {sending && !documentTask && <div className="lesson-chat-thinking" role="status"><AiAssistantAvatar state={avatarState} size="sm"/><div><strong>{waitingText}</strong></div></div>}
            <div ref={endRef}/>
          </div>
        </div>

        <div className="lesson-chat-compose-region">
          {canUndo && <div className="lesson-chat-tools"><button type="button" disabled={sending} onClick={undo}><Undo2 size={15}/>Undo last AI edit</button></div>}
          <form className="lesson-chat-compose" onSubmit={event => { event.preventDefault(); submit(); }}>
            <label className="sr-only" htmlFor="lesson-assistant-message">Message the AI Lesson Assistant</label>
            <textarea
              ref={inputRef}
              id="lesson-assistant-message"
              rows={1}
              value={input}
              maxLength={2000}
              onChange={event => setInput(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Ask about this lesson or request an edit..."
              aria-describedby="lesson-assistant-hint"
            />
            <div className="lesson-chat-compose-footer">
              <p id="lesson-assistant-hint" className="lesson-chat-compose-hint">Enter to send · Shift+Enter for a new line</p>
              <div className="lesson-chat-compose-actions">
                <button type="button" className={`lesson-chat-mic ${listening ? 'is-listening' : ''}`} aria-label={listening ? 'Stop listening' : 'Use voice input'} aria-pressed={listening} title={voiceAvailable ? 'Use voice input' : 'Voice input unavailable in this browser'} onClick={() => listening ? recognitionRef.current?.stop?.() : startVoiceInput()}><Mic size={18} aria-hidden="true"/></button>
                <button type="submit" className="lesson-chat-send" aria-label="Send message" disabled={!input.trim() || sending}><Send size={17} aria-hidden="true"/></button>
              </div>
            </div>
          </form>
        </div>
        </div>
      </section>
    </aside>
    {deleteTarget && <ConfirmModal
      title="Delete conversation?"
      body="This conversation and its messages will be permanently removed."
      confirmLabel="Delete conversation"
      loading={deletingConversation}
      onConfirm={removeConversation}
      onCancel={() => setDeleteTarget(null)}
    />}
  </>;
}
