import { ClipboardList, ExternalLink } from 'lucide-react';
import { Btn, Card } from '../ui';
import GeneratedContent from './GeneratedContent';
import { quizQuestionTypeLabel } from '../../utils/quizDraftResponse';

export default function QuizDraftPreview({ quiz, onOpen }) {
  const questions = Array.isArray(quiz?.questions) ? quiz.questions : [];
  const types = [...new Set(questions.map(question => quizQuestionTypeLabel(question.type)))];
  const typeLabel = types.length === 1 ? types[0] : types.length > 1 ? 'Mixed question types' : 'Quiz';

  return <Card className="mt-3 overflow-hidden rounded-xl border-border bg-card shadow-sm">
    <header className="flex min-w-0 items-start gap-3 border-b border-border bg-primary-subtle/45 px-4 py-3.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-primary/20 bg-card text-primary-subtle-foreground" aria-hidden="true">
        <ClipboardList size={18}/>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[.625rem] font-extrabold uppercase tracking-[.16em] text-primary-subtle-foreground">Quiz draft</p>
        <h3 className="mt-1 text-base font-bold leading-snug text-foreground">
          <GeneratedContent markdown={quiz.title} quizText inline/>
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">{questions.length} {questions.length === 1 ? 'question' : 'questions'} <span aria-hidden="true">·</span> {typeLabel}</p>
      </div>
      <span className="shrink-0 rounded-md border border-primary/20 bg-card px-2 py-1 text-[.625rem] font-bold uppercase tracking-wide text-primary-subtle-foreground">Draft</span>
    </header>
    <ol className="grid gap-2 px-4 py-3.5" aria-label="Quiz question preview">
      {questions.slice(0, 3).map((question, index) => <li key={question.id || `${question.order}-${index}`} className="grid min-w-0 grid-cols-[1.35rem_minmax(0,1fr)] gap-2 text-sm">
        <span className="pt-px font-bold tabular-nums text-primary-subtle-foreground">{question.order || index + 1}.</span>
        <div className="min-w-0">
          <GeneratedContent markdown={question.prompt} quizText className="line-clamp-2 text-sm leading-relaxed text-foreground"/>
          <span className="mt-0.5 block text-[.6875rem] font-medium text-muted-foreground">{quizQuestionTypeLabel(question.type)}</span>
        </div>
      </li>)}
      {questions.length > 3 && <li className="pl-[2.15rem] text-xs font-medium text-muted-foreground">+{questions.length - 3} more {questions.length - 3 === 1 ? 'question' : 'questions'}</li>}
    </ol>
    {onOpen && <footer className="flex justify-end border-t border-border px-4 py-3">
      <Btn size="sm" variant="secondary" onClick={() => onOpen(quiz.id)}><ExternalLink size={14}/>Open Quiz Draft</Btn>
    </footer>}
  </Card>;
}
