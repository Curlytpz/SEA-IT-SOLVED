import { useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { useParams } from "react-router-dom";
import DashboardLayout from "../../layouts/DashboardLayout";
import {
  Alert,
  BackButton,
  Badge,
  Btn,
  Card,
  CircularGauge,
  LoadingState,
  StatusChip,
  Textarea,
} from "../../components/ui";
import { ArrowLeft } from "../../components/icons";
import GeneratedContent from "../../components/reasoning/GeneratedContent";
import {
  quizAttemptProgress,
  isQuestionAnswered,
} from "../../utils/quizAttemptProgress";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../../components/ui/dialog";
import QuizSolutionUpload from "../../components/reasoning/QuizSolutionUpload";
import {
  getQuizAttempt,
  saveQuizAnswer,
  submitQuizAttempt,
} from "../../services/phase6Api";
import {
  studentQuizInstructions,
  studentQuizTitle,
} from "../../utils/quizDisplay";
import QuizTutor from "../../components/reasoning/QuizTutor";
import QuizOption from "../../components/reasoning/QuizOption";

export default function StudentQuizAttempt() {
  const { attemptId } = useParams();
  const [data, setData] = useState(null),
    [answers, setAnswers] = useState({}),
    [current, setCurrent] = useState(0),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [submitting, setSubmitting] = useState(false),
    [confirm, setConfirm] = useState(false),
    [error, setError] = useState("");
  const [uploading, setUploading] = useState(false),
    [solutionDrafts, setSolutionDrafts] = useState({}),
    [unanswered, setUnanswered] = useState([]),
    [checking, setChecking] = useState(false);
  const answersRef = useRef({});
  const submitLock = useRef(false),
    checkLock = useRef(false),
    saveQueue = useRef(Promise.resolve());
  const dirty = useRef(new Set()),
    timers = useRef(new Map());
  useEffect(() => {
    let active = true;
    getQuizAttempt(attemptId)
      .then((value) => {
        if (active) {
          setData(value);
          answersRef.current = Object.fromEntries(
            value.questions.map((q) => [q.id, q.answer || ""]),
          );
          setAnswers(answersRef.current);
        }
      })
      .catch(
        (e) =>
          active &&
          setError(e.response?.data?.error || "Unable to load this quiz."),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
      timers.current.forEach(clearTimeout);
    };
  }, [attemptId]);
  const submitted =
    data && ["SUBMITTED", "GRADED"].includes(data.attempt.status);
  const progressState = useMemo(
    () =>
      quizAttemptProgress(
        data?.questions.map((q) => ({ ...q, answer: answers[q.id] })) || [],
      ),
    [data, answers],
  );
  const answered = progressState.answered;
  function saveOne(questionId, value) {
    setSaving(true);
    const request = saveQueue.current.then(async () => {
      try {
        await saveQuizAnswer(attemptId, questionId, value);
        if (answersRef.current[questionId] === value)
          dirty.current.delete(questionId);
        return true;
      } catch (e) {
        dirty.current.add(questionId);
        setError(e.response?.data?.error || "Your answer could not be saved.");
        return false;
      }
    });
    saveQueue.current = request;
    request.finally(() => {
      if (saveQueue.current === request) setSaving(false);
    });
    return request;
  }
  function choose(question, value) {
    if (submitted || checking || submitting) return;
    answersRef.current = { ...answersRef.current, [question.id]: value };
    setAnswers(answersRef.current);
    dirty.current.add(question.id);
    clearTimeout(timers.current.get(question.id));
    timers.current.set(
      question.id,
      setTimeout(
        () => saveOne(question.id, value),
        question.type === "SHORT_ANSWER" ? 650 : 120,
      ),
    );
  }
  async function flush() {
    timers.current.forEach(clearTimeout);
    await saveQueue.current;
    const ids = [...dirty.current];
    if (ids.length) {
      const saved = await Promise.all(
        ids.map((id) => saveOne(id, answersRef.current[id] || "")),
      );
      if (saved.some((value) => !value)) throw new Error("ANSWER_SAVE_FAILED");
    }
  }
  async function submit(confirmUnanswered = false) {
    if (submitLock.current || uploading) return;
    submitLock.current = true;
    setSubmitting(true);
    setError("");
    try {
      await flush();
      const result = await submitQuizAttempt(attemptId, confirmUnanswered);
      setData(result);
      setAnswers(
        Object.fromEntries(result.questions.map((q) => [q.id, q.answer || ""])),
      );
      setConfirm(false);
      setCurrent(0);
    } catch (e) {
      setError(e.response?.data?.error || "The quiz could not be submitted.");
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }
  async function prepareSubmit() {
    if (checkLock.current || submitLock.current || uploading) return;
    checkLock.current = true;
    setChecking(true);
    setError("");
    try {
      await flush();
      const latest = await getQuizAttempt(attemptId);
      setData(latest);
      const missing = quizAttemptProgress(latest.questions).unanswered;
      setUnanswered(missing);
      setConfirm(true);
    } catch (e) {
      setError(
        e.response?.data?.error ||
          "Unable to check saved answers. Please retry.",
      );
    } finally {
      checkLock.current = false;
      setChecking(false);
    }
  }
  if (loading)
    return (
      <DashboardLayout>
        <LoadingState text="Opening quiz…" />
      </DashboardLayout>
    );
  if (!data)
    return (
      <DashboardLayout>
        <Alert>{error}</Alert>
      </DashboardLayout>
    );
  const question = data.questions[current];
  const progress = progressState.percent;
  const resultPercent =
    data.attempt.maxScore && data.attempt.score != null
      ? (data.attempt.score / data.attempt.maxScore) * 100
      : 0;
  return (
    <DashboardLayout>
      <BackButton to={`/student/lessons/${data.attempt.lessonId}`}>
        Back to lesson
      </BackButton>
      <div className="mx-auto max-w-5xl">
        {error && <Alert onClose={() => setError("")}>{error}</Alert>}
        <Card className="tactile-raised-card">
          <header className="border-b border-border p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-primary-subtle-foreground dark:text-primary">
                  <GeneratedContent
                    markdown={data.attempt.lessonTitle}
                    audience="student"
                    inline
                  />
                </p>
                <h1 className="mt-1 text-xl font-bold text-foreground sm:text-2xl">
                  <GeneratedContent
                    markdown={studentQuizTitle(
                      data.attempt.quizTitle,
                      data.attempt.lessonTitle,
                    )}
                    quizText
                    audience="student"
                    inline
                  />
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  <GeneratedContent
                    markdown={studentQuizInstructions(
                      data.attempt.quizInstructions,
                      data.questions.length,
                    )}
                    quizText
                    audience="student"
                    inline
                  />
                </p>
              </div>
              <Badge status={data.attempt.status} />
            </div>
            {!submitted && (
              <div className="mt-6">
                <div className="mb-2 flex items-center justify-between text-xs font-semibold text-muted-foreground">
                  <span>
                    {answered} of {data.questions.length} answered
                  </span>
                  <span>{Math.round(progress)}% complete</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
          </header>
          {question ? (
            <div className="grid gap-6 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_11rem] lg:gap-8">
              <div className="flex min-w-0 flex-col sm:min-h-[34rem]">
                <div className="mb-5 flex items-center justify-between gap-3 text-sm font-semibold text-muted-foreground dark:text-muted-foreground">
                  <span>
                    Question {current + 1}{" "}
                    <span className="font-normal text-muted-foreground">
                      of {data.questions.length}
                    </span>
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">
                    {saving
                      ? "Saving…"
                      : dirty.current.size
                        ? "Unsaved changes"
                        : "All changes saved"}
                  </span>
                </div>
                <p className="mb-4 text-sm font-medium text-muted-foreground">
                  {question.type === "PROBLEM_SOLVING"
                    ? "Problem Solving"
                    : question.type === "SHORT_ANSWER"
                      ? "Written Response"
                      : question.type === "TRUE_FALSE"
                        ? "True / False"
                        : "Multiple Choice"}{" "}
                  · {question.maxPoints ?? 1} points
                </p>
                <div className="min-w-0 max-w-[72ch] break-words [&_.generated-doc-markdown]:font-sans [&_.generated-doc-markdown]:text-[clamp(1.08rem,2vw,1.35rem)] [&_.generated-doc-markdown]:font-[650] [&_.generated-doc-markdown]:leading-[1.7] [&_.generated-doc-markdown]:text-foreground">
                  <GeneratedContent
                    markdown={question.prompt}
                    quizText
                    audience="student"
                  />
                </div>
                {question.type === "PROBLEM_SOLVING" ? (
                  <QuizSolutionUpload
                    key={question.id}
                    attemptId={attemptId}
                    question={question}
                    submitted={submitted}
                    file={solutionDrafts[question.id] || null}
                    onFile={(file) =>
                      setSolutionDrafts((value) => ({
                        ...value,
                        [question.id]: file,
                      }))
                    }
                    onBusy={setUploading}
                    onUploaded={(questionId, solution) =>
                      setData((value) => ({
                        ...value,
                        questions: value.questions.map((item) =>
                          item.id === questionId ? { ...item, solution } : item,
                        ),
                      }))
                    }
                  />
                ) : question.type === "SHORT_ANSWER" ? (
                  <Textarea
                    className="mt-6 min-h-36 text-base leading-7"
                    value={answers[question.id] || ""}
                    disabled={submitted || checking || submitting}
                    onChange={(e) => choose(question, e.target.value)}
                    onBlur={() => {
                      if (dirty.current.has(question.id))
                        saveOne(question.id, answers[question.id] || "");
                    }}
                    placeholder="Enter your answer"
                  />
                ) : (
                  <div className="mt-6 grid gap-3">
                    {question.choices.map((choice, index) => {
                      const selected = answers[question.id] === choice;
                      const correct =
                        submitted && question.correctAnswer === choice;
                      const studentWrong =
                        submitted && selected && question.isCorrect === false;
                      return (
                        <QuizOption
                          key={`${choice}-${index}`}
                          label={String.fromCharCode(65 + index)}
                          selected={selected}
                          correct={correct}
                          studentWrong={studentWrong}
                          disabled={submitted || checking || submitting}
                          onClick={() => choose(question, choice)}
                        >
                          <GeneratedContent
                            markdown={choice}
                            quizText
                            audience="student"
                          />
                        </QuizOption>
                      );
                    })}
                  </div>
                )}
                {submitted && (
                  <div className="mt-6 max-w-[70ch] rounded-[20px] border border-[var(--edge)] bg-surface-subtle p-5">
                    {question.isCorrect === true ? (
                      <StatusChip status="READY" label="Correct" />
                    ) : question.isCorrect === false ? (
                      <StatusChip status="ERROR" label="Incorrect" />
                    ) : (
                      <p className="text-sm font-semibold text-muted-foreground">
                        {question.pointsAwarded == null
                          ? "Awaiting professor review"
                          : `Official score: ${question.pointsAwarded} / ${question.maxPoints}`}
                      </p>
                    )}
                    {question.instructorFeedback && (
                      <div className="mt-3">
                        <p className="text-sm font-bold">Instructor feedback</p>
                        <GeneratedContent
                          markdown={question.instructorFeedback}
                          audience="student"
                        />
                      </div>
                    )}
                    {question.type !== "PROBLEM_SOLVING" &&
                      question.isCorrect !== null && (
                        <>
                          <p className="mt-4 border-t border-border pt-3 text-[13px] font-semibold text-foreground">
                            Correct answer
                          </p>
                          <GeneratedContent
                            markdown={question.correctAnswer}
                            quizText
                            audience="student"
                          />
                          {question.explanation && (
                            <div className="mt-4 max-w-[70ch] text-sm leading-6 text-muted-foreground">
                              <p className="mb-1 text-[13px] font-semibold text-muted-foreground">
                                Explanation
                              </p>
                              <GeneratedContent
                                markdown={question.explanation}
                                quizText
                                audience="student"
                              />
                            </div>
                          )}
                        </>
                      )}
                  </div>
                )}
                <nav className="mt-8 flex flex-col-reverse gap-3 border-t border-border pt-4 sm:mt-auto sm:flex-row sm:items-center dark:border-border">
                  <Btn
                    variant="secondary"
                    className="sm:mr-auto"
                    disabled={
                      current === 0 || uploading || checking || submitting
                    }
                    onClick={() => setCurrent((i) => i - 1)}
                  >
                    <ArrowLeft size={15} />
                    Previous
                  </Btn>
                  {current < data.questions.length - 1 ? (
                    <Btn
                      disabled={uploading || checking || submitting}
                      onClick={async () => {
                        try {
                          await flush();
                          setCurrent((i) => i + 1);
                        } catch {}
                      }}
                    >
                      Next
                    </Btn>
                  ) : !submitted ? (
                    <Btn
                      variant="success"
                      disabled={uploading}
                      onClick={prepareSubmit}
                    >
                      {checking || submitting ? (
                        <>
                          <LoaderCircle size={16} className="animate-spin" />
                          {submitting ? "Submitting…" : "Checking answers…"}
                        </>
                      ) : (
                        "Submit Quiz"
                      )}
                    </Btn>
                  ) : null}
                </nav>
              </div>
              <aside
                className="self-start border-t border-border pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0 dark:border-border"
                aria-label="Quiz questions"
              >
                <p className="text-[13px] font-semibold text-muted-foreground">
                  Questions
                </p>
                <div className="mt-3 grid grid-cols-5 gap-2 lg:grid-cols-3">
                  {data.questions.map((item, index) => {
                    const isCurrent = index === current;
                    const isAnswered = isQuestionAnswered({
                      ...item,
                      answer: answers[item.id],
                    });
                    const stateClass = isCurrent
                      ? "border-primary bg-primary text-primary-foreground hover:border-primary hover:bg-primary/90 hover:text-primary-foreground"
                      : isAnswered
                        ? "border-success/25 bg-success-subtle text-success-subtle-foreground hover:border-success/35 hover:text-success-subtle-foreground dark:border-success/25 dark:bg-success-subtle dark:text-success-subtle-foreground"
                        : "border-input bg-surface-elevated text-muted-foreground hover:border-primary hover:text-primary-subtle-foreground";
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={uploading}
                        aria-label={`Question ${index + 1}: ${isAnswered ? "answered" : "unanswered"}${isCurrent ? ", current" : ""}`}
                        aria-current={isCurrent ? "step" : undefined}
                        onClick={async () => {
                          if (isCurrent) return;
                          try {
                            await flush();
                            setCurrent(index);
                          } catch {}
                        }}
                        className={`grid aspect-square min-h-10 min-w-10 place-items-center rounded-lg border text-[.78rem] font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${stateClass}`}
                      >
                        {isAnswered ? "✓ " : ""}
                        {index + 1}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  {answered} answered
                  <br />
                  {data.questions.length - answered} unanswered
                </p>
              </aside>
            </div>
          ) : (
            <div className="p-8 text-center">This quiz has no questions.</div>
          )}
        </Card>
        {submitted && (
          <Card className="tactile-raised-card mt-4 p-5 sm:px-6">
            <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
              <CircularGauge
                value={resultPercent}
                label="Quiz result"
                ariaLabel={
                  "Quiz result: " +
                  (data.attempt.score ?? 0) +
                  " out of " +
                  data.attempt.maxScore
                }
                strokeWidth={12}
                bare
                className="h-28 w-28"
                center={
                  <>
                    <strong className="text-[22px] font-[650] leading-none tabular-nums text-foreground">
                      {data.attempt.score ?? "—"}/{data.attempt.maxScore}
                    </strong>
                    <span className="mt-1 text-[12px] text-muted-foreground">
                      score
                    </span>
                  </>
                }
              />
              <div>
                <p className="text-[13px] font-semibold text-muted-foreground">
                  Quiz result
                </p>
                <p className="mt-1 text-base font-semibold text-foreground">
                  {data.attempt.status === "SUBMITTED"
                    ? "Awaiting professor review — final score is not yet available"
                    : data.attempt.percentage + "%"}
                </p>
              </div>
            </div>
          </Card>
        )}
        {submitted && (
          <QuizTutor
            attemptId={attemptId}
            attempt={data.attempt}
            questions={data.questions}
          />
        )}
      </div>
      {confirm && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !submitting) setConfirm(false);
          }}
        >
          <DialogContent>
            <DialogTitle>
              {unanswered.length
                ? "You still have unanswered questions"
                : "Submit your quiz?"}
            </DialogTitle>
            <DialogDescription>
              {unanswered.length
                ? `${unanswered.length} questions have not been answered yet. Questions: ${unanswered.map((index) => index + 1).join(", ")}. Review them before submitting, or submit the quiz with those questions left unanswered.`
                : "Are you sure about your answers? Once submitted, you cannot change them."}
            </DialogDescription>
            {unanswered.some(
              (index) => data.questions[index]?.type === "PROBLEM_SOLVING",
            ) && (
              <Alert type="warning" label="Submission note" className="mb-0">
                Missing handwritten solutions will remain unanswered and await
                instructor review.
              </Alert>
            )}
            {error && (
              <Alert type="error" className="mb-0">
                {error}
              </Alert>
            )}
            <DialogFooter>
              <Btn
                variant="secondary"
                disabled={submitting}
                onClick={() => {
                  setConfirm(false);
                  if (unanswered.length) setCurrent(unanswered[0]);
                }}
              >
                {unanswered.length ? "Review Unanswered" : "Review Answers"}
              </Btn>
              <Btn
                variant="success"
                disabled={submitting}
                onClick={() => submit(unanswered.length > 0)}
              >
                {submitting ? (
                  <>
                    <LoaderCircle size={16} className="animate-spin" />
                    Submitting…
                  </>
                ) : unanswered.length ? (
                  "Submit Anyway"
                ) : (
                  "Submit Quiz"
                )}
              </Btn>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </DashboardLayout>
  );
}
