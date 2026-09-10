import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Btn, Select } from '../ui';
import { Trash } from '../icons';
import GeneratedContent from './GeneratedContent';
import MathAwareEditor from './MathAwareEditor';
import QuizProblemSettings from './QuizProblemSettings';
import { composeQuizQuestionStem, normalizeQuizDisplayContent } from '../../utils/generatedContent';
import { normalizeLessonMathContent } from '../../utils/mathContent';

function editableQuestion(question) {
  return {
    ...question,
    prompt: composeQuizQuestionStem(question.prompt),
    choices: (question.choices || []).map(normalizeQuizDisplayContent),
    correctAnswer: normalizeQuizDisplayContent(question.correctAnswer),
    explanation: normalizeQuizDisplayContent(question.explanation),
  };
}

function snapshot(question) {
  return JSON.stringify(question);
}

function choicesFor(question) {
  if (question.type === 'TRUE_FALSE') return ['True', 'False'];
  return [...(question.choices || []), '', '', '', ''].slice(0, 4);
}

function MathFieldReview({ label, value }) {
  const needsReview = useMemo(() => normalizeLessonMathContent(value).needsReview.length > 0, [value]);
  if (!needsReview) return null;
  return <Alert type="warning" label="Math review" className="mb-0 mt-2">
    {label} contains math that needs review. Open the editor and correct the expression before saving.
  </Alert>;
}

function QuizQuestionEditor({ quizId, quizStatus, question, questionIndex, initialDraft, busy, onDraftChange, onSave, onDelete }) {
  const preparedQuestion = useMemo(() => editableQuestion(question), [question]);
  const [draft, setDraft] = useState(() => initialDraft || preparedQuestion);
  const draftRef = useRef(draft);
  const [previewOpen, setPreviewOpen] = useState(false);
  const baselineRef = useRef(snapshot(preparedQuestion));

  const commitDraft = useCallback(next => {
    draftRef.current = next;
    setDraft(next);
    onDraftChange(question.id, next);
  }, [onDraftChange, question.id]);

  useEffect(() => {
    const incoming = snapshot(preparedQuestion);
    if (incoming === baselineRef.current) return;
    const dirty = snapshot(draftRef.current) !== baselineRef.current;
    baselineRef.current = incoming;
    if (!dirty) commitDraft(preparedQuestion);
    else setDraft(current => ({ ...current }));
  }, [commitDraft, preparedQuestion]);

  useEffect(() => {
    onDraftChange(question.id, draftRef.current);
  }, [onDraftChange, question.id]);

  const changed = snapshot(draft) !== baselineRef.current;

  function patch(patchValue) {
    commitDraft({ ...draftRef.current, ...patchValue });
  }

  function patchChoice(index, value) {
    const current = draftRef.current;
    const choices = choicesFor(current);
    const previous = choices[index];
    choices[index] = value;
    commitDraft({
      ...current,
      choices,
      correctAnswer: current.correctAnswer === previous ? value : current.correctAnswer,
    });
  }

  return <section className="quiz-editor-question">
    <div className="quiz-editor-question-heading">
      <h3>Question {questionIndex + 1}</h3>
      <span>{draft.type.replaceAll('_', ' ')}</span>
    </div>
    {['DRAFT', 'DISABLED'].includes(quizStatus) ? <>
      <div className="quiz-editor-field">
        <h4>Question stem</h4>
        <MathAwareEditor unified preview={false} label={`Question ${questionIndex + 1}`} value={draft.prompt} onChange={value => patch({ prompt: value })}/>
        <MathFieldReview label="Question stem" value={draft.prompt}/>
      </div>
      <label className="quiz-editor-label">Question type
        <Select className="mt-2" value={draft.type} onChange={event => {
          const type = event.target.value;
          patch({
            type,
            choices: type === 'PROBLEM_SOLVING' ? [] : type === 'TRUE_FALSE' ? ['True', 'False'] : choicesFor(draftRef.current),
            correctAnswer: '',
            ...(type === 'PROBLEM_SOLVING' ? { explanation: '', problemSettings: draftRef.current.problemSettings || {}, maxPoints: draftRef.current.maxPoints || 1 } : {}),
          });
        }}>
          <option value="MULTIPLE_CHOICE">Multiple choice</option>
          <option value="TRUE_FALSE">True / False</option>
          <option value="SHORT_ANSWER">Short answer</option>
          <option value="PROBLEM_SOLVING">Problem Solving / Solution Required</option>
        </Select>
      </label>
      {!['SHORT_ANSWER','PROBLEM_SOLVING'].includes(draft.type) && <fieldset className="mt-4">
        <legend className="quiz-editor-label">Answer choices and correct answer</legend>
        <div className="mt-2 space-y-3">
          {choicesFor(draft).map((choice, index) => <div key={index} className="quiz-choice-editor">
            <label>
              <input type="radio" name={`correct-${draft.id}`} checked={draft.correctAnswer === choice && Boolean(choice)} onChange={() => patch({ correctAnswer: choice })} disabled={!choice}/>
              <strong>{String.fromCharCode(65 + index)}.</strong>
            </label>
            <MathAwareEditor unified preview={false} label={`Choice ${String.fromCharCode(65 + index)}`} value={choice} multiline={false} disabled={draft.type === 'TRUE_FALSE'} onChange={value => patchChoice(index, value)}/>
            <MathFieldReview label={`Choice ${String.fromCharCode(65 + index)}`} value={choice}/>
          </div>)}
        </div>
      </fieldset>}
      {draft.type === 'SHORT_ANSWER' && <div className="quiz-editor-field">
        <h4>Model answer</h4>
        <MathAwareEditor unified preview={false} label="Model answer" value={draft.correctAnswer} multiline={false} onChange={value => patch({ correctAnswer: value })}/>
        <MathFieldReview label="Model answer" value={draft.correctAnswer}/>
      </div>}
      {draft.type === 'PROBLEM_SOLVING' ? <QuizProblemSettings draft={draft} onChange={patch}/> : <div className="quiz-editor-field">
        <h4>Explanation</h4>
        <MathAwareEditor unified preview={false} label={`Question ${questionIndex + 1} explanation`} value={draft.explanation} onChange={value => patch({ explanation: value })}/>
        <MathFieldReview label="Explanation" value={draft.explanation}/>
      </div>}
      {draft.sourceReferences?.length > 0 && <p className="quiz-source-caption"><strong>Instructor source metadata:</strong> {draft.sourceReferences.join(' • ')}</p>}
      <div className="quiz-question-preview-control">
        <button type="button" aria-expanded={previewOpen} aria-controls={`question-preview-${draft.id}`} onClick={() => setPreviewOpen(current => !current)}>{previewOpen ? 'Hide question preview' : 'Preview complete question'}</button>
        {previewOpen && <div id={`question-preview-${draft.id}`} className="quiz-question-combined-preview">
          <strong>Question preview</strong>
          <GeneratedContent markdown={draft.prompt} quizText/>
          {!['SHORT_ANSWER','PROBLEM_SOLVING'].includes(draft.type) && <div>{choicesFor(draft).filter(Boolean).map((choice, index) => <div key={`${choice}-${index}`} className="quiz-published-choice"><strong>{String.fromCharCode(65 + index)}.</strong><GeneratedContent markdown={choice} quizText/></div>)}</div>}
        </div>}
      </div>
      <div className="quiz-editor-actions">
        <span aria-live="polite">{changed ? 'Unsaved changes' : 'Saved'}</span>
        <div>
          <Btn size="sm" variant="danger" disabled={busy} onClick={() => onDelete(quizId, draft)}><Trash size={14}/> Delete</Btn>
          <Btn size="sm" loading={busy} onClick={() => onSave(quizId, draft)}>Save Question</Btn>
        </div>
      </div>
    </> : <>
      <GeneratedContent markdown={draft.prompt} quizText/>
      {!['SHORT_ANSWER','PROBLEM_SOLVING'].includes(draft.type) && <div className="mt-3 grid gap-2">{draft.choices.map((choice, index) => <div key={`${choice}-${index}`} className={`quiz-published-choice ${choice === draft.correctAnswer ? 'is-correct' : ''}`}><strong>{String.fromCharCode(65 + index)}.</strong><GeneratedContent markdown={choice} quizText/></div>)}</div>}
      {draft.type === 'PROBLEM_SOLVING' ? <p className="mt-3 text-sm font-semibold">Handwritten solution · {draft.maxPoints} points · Professor grading required</p> : <p className="mt-3 text-sm font-bold text-emerald-600">Correct answer</p>}
      <GeneratedContent markdown={draft.correctAnswer} quizText/>
      {draft.explanation && <div className="mt-3 text-sm text-slate-600 dark:text-slate-300"><GeneratedContent markdown={draft.explanation} quizText/></div>}
    </>}
  </section>;
}

export default memo(QuizQuestionEditor);
