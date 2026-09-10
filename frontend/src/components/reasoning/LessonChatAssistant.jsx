import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Mic, RotateCcw, Send, Undo2 } from 'lucide-react';
import { Alert, Btn } from '../ui';
import AiAssistantAvatar from './AiAssistantAvatar';
import GeneratedContent from './GeneratedContent';
import '../../../../shared/quizEditTargeting.cjs';
import { generateQuizFromLessonChat, getLessonChat, sendLessonChatMessage, undoLastLessonEdit } from '../../services/lessonChatApi';

const GENERAL_ACTIONS = [
  ['Explain lesson', 'Explain the approved lesson clearly and concisely.', 'ASK'],
  ['Generate notes', 'Generate notes.', 'GENERATE_LESSON'],
  ['Key formulas', 'List and explain the key formulas in this approved lesson.', 'ASK'],
  ['Generate quiz', 'Generate a quiz about this lesson.', 'GENERATE_QUIZ'],
];

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
  return /\b(re-?generate|generate|create|prepare|build|draft)\b[\s\S]{0,48}\b(lesson\s+)?(notes?|materials?|handout)\b|\b(lesson\s+)?(notes?|materials?|handout)\b[\s\S]{0,32}\b(re-?generate|generate|create|prepare|build)\b/i.test(message);
}

function isRegenerateNotesRequest(message, explicitIntent) {
  return explicitIntent === 'REGENERATE_LESSON' || /\bre-?generate\b[\s\S]{0,40}\b(notes?|materials?|handout)\b/i.test(message);
}

function isGenerateQuizRequest(message, explicitIntent) {
  if (['QUIZ', 'GENERATE_QUIZ'].includes(explicitIntent)) return true;
  return /\b(generate|create|make|build)\b[\s\S]{0,40}\b(quiz|questions?)\b|\bquiz\b[\s\S]{0,30}\b(generate|create|make)\b/i.test(message);
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
  const documentTarget = /\b(section|lessons?|lesson\s+notes?|notes?|materials?|document|explanation|samples?|examples?|key\s+takeaways?|summary|common\s+mistakes?|reminders?|key\s+formulas?|formula\s+section|worked\s+examples?|concept\s+explanation|this\s+part|this\s+section|example\s+above)\b/i.test(message);
  return mutation && documentTarget;
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

export default function LessonChatAssistant({ lessonId, lessonTitle, materials, selectedMaterialId, onMaterialsUpdated, onEditStateChange, onQuizCreated, onReviewQuiz, onQuizUpdated }) {
  const reduceMotion = useReducedMotion();
  const [messages, setMessages] = useState([]);
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
    const transitions = [
      [700, 'context', 10, editingQuiz ? 'Finding the draft quiz...' : 'Reading approved lesson context...'],
      ...(generatingQuiz ? [[1400, 'request', 25, 'Understanding quiz request...']] : []),
      [2200, 'structure', 40, editingQuiz ? 'Locating the requested question...' : generatingQuiz ? 'Planning questions...' : 'Planning lesson structure...'],
      [3800, 'generate', 70, editingQuiz ? 'Updating quiz content...' : generatingQuiz ? 'Generating quiz questions...' : 'Generating lesson notes...'],
      [6000, 'validate', 85, generatingQuiz || editingQuiz ? 'Validating questions and answers...' : 'Checking formulas...'],
      [8500, 'apply', 95, generatingQuiz ? 'Saving quiz draft...' : 'Almost done...'],
    ];
    taskTimersRef.current = transitions.map(([delay, stage, progress, detail]) => window.setTimeout(() => advanceTask(stage, progress, detail), delay));
  }

  function showActivity(value) {
    window.clearTimeout(activityTimerRef.current);
    setActivity(value);
    activityTimerRef.current = window.setTimeout(() => setActivity(''), 2400);
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    getLessonChat(lessonId)
      .then(result => {
        if (active) {
          setMessages(result.messages || []);
          setCanUndo(Boolean(result.canUndo));
        }
      })
      .catch(nextError => { if (active) setError(friendly(nextError)); })
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
    const explicitCreation = explicitQuizGeneration(clean);
    const quizEditing = !explicitCreation && isQuizEditRequest(clean, intent);
    const generateNotes = !explicitCreation && !quizEditing && isGenerateNotesRequest(clean, intent);
    const regenerateNotes = generateNotes && isRegenerateNotesRequest(clean, intent);
    const generateQuiz = explicitCreation || (!quizEditing && !generateNotes && isGenerateQuizRequest(clean, intent));
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
    setQuizOptions(null);
    setInput('');
    const wholeLessonEdit = editing && /\b(whole|entire|all sections|full lesson|lesson-wide)\b/i.test(clean);
    const targetMaterialId = documentAction && !generateNotes && !wholeLessonEdit ? semanticMaterialTarget(clean, materials, selectedMaterialId) : '';
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
      const result = await sendLessonChatMessage(lessonId, { message: clean, intent: mode, selectedMaterialId: targetMaterialId || selectedMaterialId });
      setMessages(current => current.map(item => item.localId === optimisticId ? { ...item, pending: false, failed: false } : item));
      const appendResultMessage = () => setMessages(current => [...current, result.message]);
      if (result.requiresQuizOptions) {
        appendResultMessage();
        setQuizOptions({
          prompt: result.quizPrompt || clean,
          difficulty: result.difficulty || 'MEDIUM',
          questionCount: Number(result.questionCount) || 5,
        });
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
        if (result.quizCreated) onQuizCreated?.();
        setDocumentTask(current => current ? {
          ...current,
          status: 'completed',
          progress: 100,
          detail: '✓ Update complete',
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
      const result = await generateQuizFromLessonChat(lessonId, options);
      clearTaskProgressTimers();
      advanceTask('apply', 96, 'Saving quiz draft...');
      setQuizOptions(null);
      setDocumentTask(current => current ? { ...current, status: 'completed', progress: 100, detail: '✓ Update complete', stages: current.stages.map(stage => ({ ...stage, status: 'completed' })) } : current);
      if (!reduceMotion) await new Promise(resolve => window.setTimeout(resolve, 520));
      setDocumentTask(null);
      setMessages(current => [...current.filter(item => !['QUIZ_DIFFICULTY_REQUIRED', 'QUIZ_OPTIONS_REQUIRED'].includes(item.action)), result.message]);
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
      const result = await undoLastLessonEdit(lessonId);
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

  return <>
    <aside className="lesson-chat-assistant" aria-labelledby="lesson-assistant-title">
      <header className="lesson-chat-heading">
        <AiAssistantAvatar state={avatarState} />
        <span className="lesson-chat-heading-copy">
          <strong id="lesson-assistant-title">AI Lesson Assistant</strong>
          <small>{lessonTitle || 'Approved lesson workspace'}</small>
        </span>
        <span className={`lesson-chat-status ${statusTone}`} role="status"><i aria-hidden/>{statusText}</span>
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
                <strong>Choose quiz details</strong>
                <p>How many questions would you like, and what difficulty?</p>
                <div className="lesson-chat-quiz-option-group" role="group" aria-label="Quiz difficulty">
                  <span>Difficulty</span>
                  <div>{['EASY', 'MEDIUM', 'HARD'].map(value => <button key={value} type="button" aria-pressed={quizOptions.difficulty === value} disabled={sending} onClick={() => setQuizOptions(current => ({ ...current, difficulty: value }))}>{value[0] + value.slice(1).toLowerCase()}</button>)}</div>
                </div>
                <div className="lesson-chat-quiz-option-group" role="group" aria-label="Number of quiz questions">
                  <span>Questions</span>
                  <div>{[5, 10, 15].map(value => <button key={value} type="button" aria-pressed={quizOptions.questionCount === value} disabled={sending} onClick={() => setQuizOptions(current => ({ ...current, questionCount: value }))}>{value}</button>)}</div>
                </div>
                <div className="lesson-chat-quiz-option-actions"><Btn size="sm" disabled={sending} onClick={() => generateQuiz(quizOptions)}>Generate Quiz</Btn><button type="button" disabled={sending} onClick={() => setQuizOptions(null)}>Cancel</button></div>
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
    </aside>
  </>;
}
