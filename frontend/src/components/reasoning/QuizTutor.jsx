import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { Alert, Btn, Card, LoadingIndicator, StatusChip } from "../ui";
import { Skeleton } from "../ui/skeleton";
import GeneratedContent from "./GeneratedContent";
import QuizOption from "./QuizOption";
import {
  checkQuizTutorPractice,
  generateQuizTutor,
  generateQuizTutorPractice,
  getQuizTutor,
} from "../../services/phase6Api";

const errorText = (error, fallback) => error.response?.data?.error || fallback;

function PracticeSkeleton() {
  return (
    <div
      className="quiz-tutor-practice-skeleton"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="quiz-tutor-skeleton-heading">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="quiz-tutor-skeleton-question">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-11/12" />
        <Skeleton className="h-5 w-3/5" />
      </div>
      <div className="quiz-tutor-skeleton-options">
        {[0, 1, 2, 3].map((index) => (
          <div key={index}>
            <Skeleton className="h-7 w-7 rounded-full" />
            <Skeleton className={`h-4 ${index % 2 ? "w-3/4" : "w-5/6"}`} />
          </div>
        ))}
      </div>
      <Skeleton className="h-10 w-36" />
      <p>Generating your next practice problem...</p>
    </div>
  );
}

function PracticeQuestion({
  attemptId,
  practice,
  onUpdate,
  onGenerateAnother,
  practiceRemaining,
}) {
  const [choice, setChoice] = useState(practice.studentAnswer || "");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const result = practice.answered ? practice : null;

  async function check() {
    if (!choice || checking || result) return;
    setChecking(true);
    setError("");
    try {
      onUpdate(await checkQuizTutorPractice(attemptId, practice.id, choice));
    } catch (requestError) {
      setError(errorText(requestError, "Your answer could not be checked."));
    } finally {
      setChecking(false);
    }
  }

  const correctIndex = result
    ? practice.choices.findIndex((item) => item === result.correctAnswer)
    : -1;
  return (
    <article className="quiz-tutor-practice-card">
      <header>
        <p>Practice {practice.order}</p>
        <span>
          <GeneratedContent
            markdown={practice.topic}
            quizText
            audience="student"
            inline
          />
        </span>
      </header>
      <div className="quiz-tutor-practice-question">
        <GeneratedContent
          markdown={practice.question}
          quizText
          audience="student"
          mathFallback
        />
      </div>
      <div
        className="quiz-tutor-options"
        role="group"
        aria-label={`Practice ${practice.order} answer choices`}
      >
        {practice.choices.map((item, index) => (
          <QuizOption
            key={`${practice.id}-${index}`}
            label={String.fromCharCode(65 + index)}
            selected={choice === item}
            correct={Boolean(result) && item === result.correctAnswer}
            studentWrong={
              Boolean(result) && choice === item && !result.isCorrect
            }
            disabled={Boolean(result) || checking}
            onClick={() => setChoice(item)}
          >
            <GeneratedContent
              markdown={item}
              quizText
              audience="student"
              mathFallback
            />
          </QuizOption>
        ))}
      </div>
      {!result && (
        <div className="quiz-tutor-check-action">
          <Btn
            className="w-full disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            disabled={!choice || checking}
            aria-disabled={!choice || checking}
            loading={checking}
            loadingText="Checking answer"
            onClick={check}
          >
            Check Answer
          </Btn>
        </div>
      )}
      {error && (
        <Alert type="error" className="mt-4 mb-0">
          {error}
        </Alert>
      )}
      {result && (
        <section
          className={`quiz-tutor-practice-review ${result.isCorrect ? "is-correct" : "is-review"}`}
          aria-label="Practice review"
        >
          <p>Review</p>
          <h4>{result.isCorrect ? "Correct." : "Not quite."}</h4>
          {!result.isCorrect && (
            <div>
              <h5>Correct answer</h5>
              <div className="quiz-tutor-correct-answer">
                <strong>
                  {correctIndex >= 0
                    ? `${String.fromCharCode(65 + correctIndex)}.`
                    : ""}
                </strong>
                <GeneratedContent
                  markdown={result.correctAnswer}
                  quizText
                  audience="student"
                  mathFallback
                />
              </div>
            </div>
          )}
          <div>
            <h5>Why</h5>
            <GeneratedContent
              markdown={result.explanation}
              quizText
              audience="student"
              mathFallback
            />
          </div>
          <div>
            <h5>Key concept</h5>
            <GeneratedContent
              markdown={practice.topic}
              quizText
              audience="student"
              mathFallback
            />
          </div>
          <footer>
            <span>Practice questions remaining: {practiceRemaining}</span>
            {practiceRemaining > 0 ? (
              <Btn onClick={onGenerateAnother}>Generate Another Practice</Btn>
            ) : (
              <strong>Practice limit reached</strong>
            )}
          </footer>
        </section>
      )}
    </article>
  );
}

function MistakeCard({ mistake, question }) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = `quiz-tutor-details-${mistake.questionId}`;
  const hasSolution = Boolean(question?.correctAnswer || question?.explanation);
  return (
    <article className="tactile-raised-card flex h-full flex-col p-5 sm:p-6">
      <p className="text-[13px] font-semibold text-primary-subtle-foreground">
        Question {mistake.questionOrder}
      </p>
      <h3 className="mt-2 text-base font-bold text-foreground">
        What went wrong
      </h3>
      <GeneratedContent
        markdown={mistake.mistakeSummary}
        quizText
        audience="student"
        className="mt-1 text-sm leading-6 text-muted-foreground"
      />
      <h4 className="mt-4 text-sm font-bold text-foreground">Key concept</h4>
      <div className="mt-1 text-sm leading-6 text-muted-foreground">
        <GeneratedContent
          markdown={mistake.keyConcept}
          quizText
          audience="student"
        />
      </div>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={() => setExpanded((value) => !value)}
        className="mt-auto inline-flex min-h-11 items-center justify-between gap-3 border-t border-border pt-4 text-left text-sm font-semibold text-primary-subtle-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <span>{expanded ? "Hide details" : "Show details"}</span>
        <ChevronDown
          size={17}
          aria-hidden="true"
          className={
            "transition-transform motion-reduce:transition-none " +
            (expanded ? "rotate-180" : "")
          }
        />
      </button>
      {expanded && (
        <div
          id={detailsId}
          className="mt-3 border-t border-border pt-4 text-sm leading-6 text-muted-foreground"
        >
          <h4 className="text-sm font-bold text-foreground">
            Try this approach
          </h4>
          <ol className="mt-2 space-y-2">
            {mistake.recommendedSteps.map((step, index) => (
              <li
                key={`${mistake.questionId}-${index}`}
                className="flex min-w-0 gap-3"
              >
                <span className="font-bold text-primary-subtle-foreground">
                  {index + 1}.
                </span>
                <GeneratedContent
                  markdown={step}
                  quizText
                  audience="student"
                  className="min-w-0"
                />
              </li>
            ))}
          </ol>
          <div className="mt-4">
            <GeneratedContent
              markdown={mistake.explanation}
              quizText
              audience="student"
            />
          </div>
          {hasSolution && (
            <div className="mt-4 border-t border-border pt-4 text-foreground">
              <p className="mb-1 text-[13px] font-semibold text-muted-foreground">
                View correct solution
              </p>
              {question.correctAnswer && (
                <>
                  <p className="mb-1 text-[13px] font-semibold text-muted-foreground">
                    Correct answer
                  </p>
                  <GeneratedContent
                    markdown={question.correctAnswer}
                    quizText
                    audience="student"
                  />
                </>
              )}
              {question.explanation && (
                <div className="mt-3 text-muted-foreground">
                  <GeneratedContent
                    markdown={question.explanation}
                    quizText
                    audience="student"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export default function QuizTutor({ attemptId, attempt, questions }) {
  const [tutor, setTutor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [practiceStatus, setPracticeStatus] = useState("idle");
  const [activePractice, setActivePractice] = useState(null);
  const [practiceError, setPracticeError] = useState("");
  const [error, setError] = useState("");
  const practiceRequest = useRef(false);

  const applyTutor = useCallback((value) => {
    setTutor(value);
    if (value?.status !== "READY") {
      setActivePractice(null);
      setPracticeStatus("idle");
      setPracticeError("");
      return;
    }
    if (value.practiceStatus === "PROCESSING") {
      setActivePractice(null);
      setPracticeStatus("loading");
      setPracticeError("");
      return;
    }
    if (value.practiceStatus === "FAILED") {
      setActivePractice(null);
      setPracticeStatus("error");
      setPracticeError(
        value.practiceFailure ||
          "Unable to generate the next practice problem.",
      );
      return;
    }
    const practices = value.practices || [];
    const latest =
      value.activePractice || practices[practices.length - 1] || null;
    setActivePractice(latest);
    setPracticeStatus(
      latest ? (latest.answered ? "answered" : "ready") : "idle",
    );
    setPracticeError("");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      applyTutor(await getQuizTutor(attemptId));
    } catch (requestError) {
      setError(errorText(requestError, "AI Tutor could not load right now."));
    } finally {
      setLoading(false);
    }
  }, [applyTutor, attemptId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    getQuizTutor(attemptId)
      .then((value) => {
        if (active) applyTutor(value);
      })
      .catch((requestError) => {
        if (active)
          setError(
            errorText(requestError, "AI Tutor could not load right now."),
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [applyTutor, attemptId, attempt.status]);

  async function analyze() {
    if (analyzing) return;
    setAnalyzing(true);
    setError("");
    try {
      applyTutor(await generateQuizTutor(attemptId));
    } catch (requestError) {
      setError(
        errorText(
          requestError,
          "AI Tutor couldn't generate your review right now.",
        ),
      );
    } finally {
      setAnalyzing(false);
    }
  }

  async function createPractice() {
    if (practiceRequest.current || !tutor?.practiceRemaining) return;
    practiceRequest.current = true;
    setPracticeStatus("loading");
    setActivePractice(null);
    setPracticeError("");
    try {
      const result = await generateQuizTutorPractice(attemptId);
      setTutor((current) => ({
        ...current,
        activePractice: result.practice,
        practiceStatus: "READY",
        practiceRemaining: result.practiceRemaining,
        practiceLimit: result.practiceLimit,
      }));
      setActivePractice(result.practice);
      setPracticeStatus("ready");
    } catch (requestError) {
      setPracticeError(
        errorText(
          requestError,
          "Unable to generate the next practice problem.",
        ),
      );
      setPracticeStatus("error");
    } finally {
      practiceRequest.current = false;
    }
  }

  function updatePractice(updated) {
    setActivePractice(updated);
    setPracticeStatus("answered");
    setTutor((current) => ({
      ...current,
      activePractice: updated,
      practices: (current.practices || []).map((item) =>
        item.id === updated.id ? updated : item,
      ),
    }));
  }

  if (loading)
    return (
      <Card className="tactile-raised-card mt-4 p-5">
        <LoadingIndicator text="Loading AI Tutor…" />
      </Card>
    );
  return (
    <Card className="tactile-raised-card mt-4 overflow-hidden">
      <div className="p-5 sm:p-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="flex items-center gap-2 text-[13px] font-semibold text-primary-subtle-foreground">
              <Sparkles size={15} />
              AI quiz tutor
            </p>
            <h2 className="mt-2 text-xl font-bold text-foreground">
              Personalized help from your final result
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              Review concepts you found difficult, then practice one focused
              question at a time.
            </p>
          </div>
          {tutor?.status === "READY" && (
            <StatusChip status="READY" label="Analysis ready" />
          )}
        </div>
        {tutor?.status === "READY" && (
          <p className="mt-4 text-[13px] leading-5 text-muted-foreground">
            AI-generated feedback. It may contain mistakes; check with your
            instructor.
          </p>
        )}
        {error && (
          <Alert
            type="error"
            title="AI Tutor couldn't complete that request"
            className="mt-5 mb-0"
            onClose={() => setError("")}
            actions={
              !tutor || tutor.status === "AVAILABLE" ? (
                <Btn
                  size="sm"
                  variant="secondary"
                  onClick={tutor ? analyze : load}
                >
                  Try Again
                </Btn>
              ) : undefined
            }
          >
            {error}
          </Alert>
        )}

        {tutor?.status === "AWAITING_REVIEW" && (
          <Alert
            type="pending"
            label="Pending final result"
            title="AI Tutor is not available yet"
            className="mt-5 mb-0"
          >
            {tutor.message}
          </Alert>
        )}
        {tutor?.status === "ALL_CORRECT" && (
          <Alert
            type="success"
            label="Excellent work"
            title="All answers correct"
            className="mt-5 mb-0"
          >
            {tutor.message}
          </Alert>
        )}
        {tutor?.status === "PROCESSING" && (
          <div className="mt-5 rounded-xl bg-surface-subtle p-5">
            <LoadingIndicator text="Analyzing your quiz…" />
            <p className="mt-2 text-sm text-muted-foreground">
              Only one analysis is generated for this attempt.
            </p>
            <Btn size="sm" variant="secondary" className="mt-4" onClick={load}>
              Check status
            </Btn>
          </div>
        )}
        {tutor?.status === "AVAILABLE" && (
          <div className="mt-5 rounded-xl border border-border bg-surface-subtle p-5">
            <p className="text-sm leading-6 text-muted-foreground">
              Get focused guidance based only on questions you missed. Your quiz
              is not analyzed until you choose to begin.
            </p>
            <Btn
              className="mt-4 w-full sm:w-auto"
              loading={analyzing}
              loadingText="Analyzing your quiz"
              onClick={analyze}
            >
              <Sparkles size={16} />
              {analyzing ? "Analyzing…" : "Analyze My Mistakes"}
            </Btn>
          </div>
        )}
      </div>

      {tutor?.status === "READY" && (
        <div className="border-t border-border bg-surface-subtle/50 p-5 sm:p-6">
          <section>
            <h3 className="text-base font-bold text-foreground">Your review</h3>
            <GeneratedContent
              markdown={tutor.report.summary}
              quizText
              audience="student"
              className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground"
            />
            {tutor.report.weakTopics?.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {tutor.report.weakTopics.map((topic) => (
                  <span
                    key={topic}
                    className="rounded-full border border-primary/20 bg-primary-subtle px-3 py-1 text-[12px] font-semibold text-primary-subtle-foreground"
                  >
                    <GeneratedContent
                      markdown={topic}
                      quizText
                      audience="student"
                      inline
                    />
                  </span>
                ))}
              </div>
            )}
          </section>
          <div className="mt-6 grid auto-rows-fr gap-4 lg:grid-cols-2">
            {tutor.report.mistakes.map((mistake) => (
              <MistakeCard
                key={mistake.questionId}
                mistake={mistake}
                question={questions.find(
                  (item) => item.id === mistake.questionId,
                )}
              />
            ))}
          </div>
          {tutor.report.recommendedReview?.length > 0 && (
            <section className="mt-6 border-t border-border pt-5">
              <h3 className="text-sm font-bold text-foreground">
                Recommended review
              </h3>
              <ul className="mt-3 flex flex-wrap gap-2 text-sm text-muted-foreground">
                {tutor.report.recommendedReview.map((topic) => (
                  <li
                    key={topic}
                    className="rounded-full bg-surface-elevated px-3 py-1.5 text-[13px] font-semibold"
                  >
                    <GeneratedContent
                      markdown={topic}
                      quizText
                      audience="student"
                      inline
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="quiz-tutor-practice-section">
            <div className="quiz-tutor-practice-heading">
              <div>
                <h3>Focused practice</h3>
                <p>Practice questions remaining: {tutor.practiceRemaining}</p>
              </div>
              {practiceStatus === "idle" && tutor.practiceRemaining > 0 && (
                <Btn onClick={createPractice}>Generate Practice</Btn>
              )}
            </div>
            <div className="quiz-tutor-active-practice">
              {practiceStatus === "loading" && <PracticeSkeleton />}
              {practiceStatus === "error" && (
                <div className="quiz-tutor-practice-error" role="alert">
                  <h4>Unable to generate the next practice problem.</h4>
                  <p>{practiceError}</p>
                  <Btn variant="secondary" onClick={createPractice}>
                    Try Again
                  </Btn>
                </div>
              )}
              {activePractice &&
                ["ready", "answered"].includes(practiceStatus) && (
                  <PracticeQuestion
                    key={activePractice.id}
                    attemptId={attemptId}
                    practice={activePractice}
                    onUpdate={updatePractice}
                    onGenerateAnother={createPractice}
                    practiceRemaining={tutor.practiceRemaining}
                  />
                )}
              {practiceStatus === "idle" && tutor.practiceRemaining <= 0 && (
                <p className="quiz-tutor-practice-limit">
                  You've completed the available AI practice for this quiz.
                </p>
              )}
            </div>
          </section>
        </div>
      )}
    </Card>
  );
}
