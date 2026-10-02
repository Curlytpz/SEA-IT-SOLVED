import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import DashboardLayout from "../../layouts/DashboardLayout";
import {
  Alert,
  BackButton,
  Card,
  CircularGauge,
  EmptyState,
  LoadingState,
  PageHeader,
  StatusChip,
} from "../../components/ui";
import { Chart, Check, CircleX } from "../../components/icons";
import GeneratedContent from "../../components/reasoning/GeneratedContent";
import { getQuizAnalytics } from "../../services/phase6Api";
import {
  safeSectionReturnPath,
  sectionOriginFromState,
  sectionOriginState,
  sectionReturnPath,
} from "../../utils/instructorLessonNavigation";
import { formatDisplayName } from "../../utils/displayName";

const percent = (value) =>
  value == null ? "—" : Math.round(value * 10) / 10 + "%";

function safeInstructorReturnPath(value) {
  const path = String(value || "");
  return /^\/instructor\/lessons\/[^/?#]+\/review(?:[?#].*)?$/.test(path) ||
    safeSectionReturnPath(path) ||
    /^\/instructor\/sections\/[^/?#]+(?:\?tab=analytics)?$/.test(path)
    ? path
    : "";
}

function responseRate(value, total) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, (Number(value || 0) / total) * 100));
}

function ScoreHistogram({ ranges, average, median }) {
  const highestCount = Math.max(
    0,
    ...ranges.map((range) => Number(range.count) || 0),
  );
  const hasScores = highestCount > 0;
  const summary = hasScores
    ? "Score distribution: " +
      ranges.map((range) => range.label + " has " + range.count).join(", ") +
      ". Class average " +
      percent(average) +
      "; median " +
      percent(median) +
      "."
    : "No submitted scores yet.";

  return (
    <div
      role="img"
      aria-label={summary}
      className="tactile-inset-well min-w-0 p-4 sm:p-[18px]"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-semibold text-muted-foreground">
          Score distribution
        </p>
        <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
          <span>
            <i
              aria-hidden="true"
              className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-primary"
            />
            Average {percent(average)}
          </span>
          <span>
            <i
              aria-hidden="true"
              className="mr-1 inline-block h-1.5 w-1.5 rounded-full border border-foreground/60"
            />
            Median {percent(median)}
          </span>
        </div>
      </div>
      {hasScores ? (
        <div
          aria-hidden="true"
          className="mt-4 grid h-36 grid-cols-5 items-end gap-2 sm:gap-3"
        >
          {ranges.map((range) => {
            const height = Math.max(
              range.count > 0 ? 8 : 0,
              (Number(range.count || 0) / highestCount) * 100,
            );
            return (
              <div
                key={range.label}
                className="grid h-full min-w-0 grid-rows-[1.25rem_minmax(0,1fr)_1.25rem] items-end text-center"
              >
                <strong className="text-[13px] tabular-nums text-foreground">
                  {range.count}
                </strong>
                <div className="flex h-full items-end justify-center rounded-t-xl bg-[var(--surface-2)] px-1 shadow-[var(--sh-inset)]">
                  <span
                    className="w-full rounded-t-lg bg-gradient-to-t from-[#14b8a6] to-[#2dd4bf] transition-[height] duration-300 motion-reduce:transition-none"
                    style={{ height: height + "%" }}
                  />
                </div>
                <span className="pt-2 text-[11px] font-semibold text-muted-foreground">
                  {range.label}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No submitted scores yet.
        </p>
      )}
      <p className="sr-only">{summary}</p>
    </div>
  );
}

function QuestionList({ questions, selectedId, onSelect }) {
  if (!questions.length) {
    return <EmptyState icon={<Chart />} title="No questions" />;
  }

  return (
    <div
      role="listbox"
      aria-label="Questions ordered by correct rate"
      className="space-y-2"
    >
      {questions.map((question) => {
        const isSelected = selectedId === question.id;
        const requiresAttention =
          question.percentageCorrect != null &&
          question.percentageCorrect < 100;
        const rate =
          question.percentageCorrect == null ? 0 : question.percentageCorrect;
        return (
          <button
            key={question.id}
            type="button"
            role="option"
            aria-selected={isSelected}
            onClick={() => onSelect(question.id)}
            className={
              "block w-full min-w-0 rounded-2xl border p-3.5 text-left transition-[border-color,background-color,transform] hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[.99] motion-reduce:transform-none motion-reduce:transition-none " +
              (isSelected
                ? "border-primary bg-primary/[.08] shadow-[0_0_0_1px_hsl(var(--primary)/.14)]"
                : "border-transparent bg-surface-subtle/55 hover:border-border")
            }
          >
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0 text-sm text-foreground">
                <strong>Question {question.order}</strong>
                {question.topic ? (
                  <>
                    <span aria-hidden="true"> · </span>
                    <GeneratedContent
                      markdown={question.topic}
                      quizText
                      inline
                    />
                  </>
                ) : null}
              </span>
              <strong className="shrink-0 text-sm tabular-nums text-foreground">
                {question.percentageCorrect == null
                  ? "Not scored"
                  : percent(question.percentageCorrect)}
              </strong>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--surface-2)] shadow-[var(--sh-inset)]">
              <span
                className="block h-full min-w-[2px] rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
                style={{ width: rate + "%" }}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
              <span>
                {question.correct} correct · {question.incorrect ?? 0} incorrect
              </span>
              {requiresAttention ? (
                <StatusChip
                  status="warning"
                  label="Needs attention"
                  className="min-h-6 px-2 py-0 text-[11px]"
                />
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function TopicList({ topics }) {
  if (!topics.length) {
    return (
      <p className="py-8 text-sm text-muted-foreground">
        No grounded topic metadata is available.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {topics.map((topic) => (
        <div
          key={topic.topic}
          className="tactile-inset-well flex min-w-0 items-center justify-between gap-4 p-4"
        >
          <div className="min-w-0">
            <p className="font-semibold text-foreground">
              <GeneratedContent markdown={topic.topic} quizText inline />
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {topic.correct} correct of {topic.scored} scored responses
            </p>
          </div>
          <strong className="shrink-0 tabular-nums text-foreground">
            {percent(topic.percentage)}
          </strong>
        </div>
      ))}
    </div>
  );
}

function QuestionDrilldown({ question }) {
  if (!question) {
    return (
      <p className="py-8 text-sm text-muted-foreground">Select a question.</p>
    );
  }

  const totalResponses = Number(question.answered || 0);
  const mostSelectedIncorrect = question.mostSelectedIncorrect?.label;

  return (
    <div className="min-w-0">
      <p className="text-[13px] font-semibold text-primary-subtle-foreground">
        Question {question.order}
      </p>
      <div className="mt-2 max-w-[70ch] text-base font-semibold leading-7 text-foreground">
        <GeneratedContent markdown={question.prompt} />
      </div>
      <dl className="mt-5 grid grid-cols-3 gap-2">
        <Mini label="Correct" value={question.correct} />
        <Mini label="Incorrect" value={question.incorrect ?? "—"} />
        <Mini
          label="Correct rate"
          value={percent(question.percentageCorrect)}
        />
      </dl>
      {question.responseDistribution?.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-foreground">
            Response distribution
          </h3>
          <div className="mt-3 space-y-2">
            {question.responseDistribution.map((item) => {
              const share = responseRate(item.count, totalResponses);
              const isMostSelectedIncorrect =
                !item.isCorrect && item.label === mostSelectedIncorrect;
              return (
                <div
                  key={item.label}
                  className={
                    "rounded-xl border p-3 " +
                    (item.isCorrect
                      ? "border-primary/35 bg-primary/[.06]"
                      : "border-border bg-surface-subtle/45")
                  }
                >
                  <div className="flex min-w-0 items-start gap-2">
                    {item.isCorrect ? (
                      <Check
                        size={16}
                        className="mt-0.5 shrink-0 text-primary"
                      />
                    ) : isMostSelectedIncorrect ? (
                      <CircleX
                        size={16}
                        className="mt-0.5 shrink-0 text-destructive"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/60"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <p className="font-semibold text-foreground">
                          {item.label}
                        </p>
                        <span className="text-[12px] tabular-nums text-muted-foreground">
                          {item.count}{" "}
                          {item.count === 1 ? "student" : "students"} ·{" "}
                          {percent(share)}
                        </span>
                      </div>
                      <div className="mt-1.5 text-sm leading-6 text-foreground">
                        <GeneratedContent markdown={item.choice} />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {item.isCorrect ? (
                          <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary-subtle-foreground">
                            <Check size={13} aria-hidden="true" />
                            Correct answer
                          </span>
                        ) : null}
                        {isMostSelectedIncorrect ? (
                          <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-destructive">
                            <CircleX size={13} aria-hidden="true" />
                            Most selected incorrect
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)] shadow-[var(--sh-inset)]">
                        <span
                          className={
                            "block h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none " +
                            (item.isCorrect
                              ? "bg-primary"
                              : "bg-muted-foreground/65")
                          }
                          style={{ width: share + "%" }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function InstructorQuizAnalytics() {
  const { quizId } = useParams();
  const location = useLocation();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [analysisMode, setAnalysisMode] = useState("question");

  useEffect(() => {
    getQuizAnalytics(quizId)
      .then((value) => {
        const firstQuestion = [...(value.questions || [])].sort(
          (first, second) =>
            (first.percentageCorrect ?? Infinity) -
            (second.percentageCorrect ?? Infinity),
        )[0];
        setData(value);
        setSelectedId(firstQuestion?.id || "");
      })
      .catch((requestError) =>
        setError(
          requestError.response?.data?.error || "Unable to load analytics.",
        ),
      )
      .finally(() => setLoading(false));
  }, [quizId]);

  const sortedQuestions = useMemo(
    () =>
      [...(data?.questions || [])].sort(
        (first, second) =>
          (first.percentageCorrect ?? Infinity) -
          (second.percentageCorrect ?? Infinity),
      ),
    [data],
  );
  const selected = useMemo(
    () =>
      data?.questions.find((question) => question.id === selectedId) || null,
    [data, selectedId],
  );

  if (loading) {
    return (
      <DashboardLayout>
        <LoadingState text="Calculating quiz analytics…" />
      </DashboardLayout>
    );
  }
  if (!data) {
    return (
      <DashboardLayout>
        <Alert>{error}</Alert>
      </DashboardLayout>
    );
  }

  const overview = data.overview;
  const origin = safeInstructorReturnPath(
    location.state?.from || location.state?.returnTo,
  );
  const lessonFallback = data.quiz.lessonId
    ? "/instructor/lessons/" + data.quiz.lessonId + "/review?view=workspace"
    : "";
  const backTo =
    origin ||
    lessonFallback ||
    "/instructor/sections/" + data.quiz.sectionId + "?tab=analytics";
  const returnsToLesson = backTo.startsWith("/instructor/lessons/");
  const higherLevelOrigin =
    sectionOriginFromState(location.state) ||
    sectionReturnPath(data.quiz.sectionId, "reviews");
  const lessonBackState = sectionOriginState(
    location.state,
    higherLevelOrigin,
    {
      focusQuizId: data.quiz.id,
    },
  );
  const lowestQuestion = sortedQuestions.find(
    (question) => question.percentageCorrect != null,
  );
  const summary = lowestQuestion
    ? "Class average " +
      percent(overview.averagePercentage) +
      ". Lowest: Question " +
      lowestQuestion.order +
      " at " +
      percent(lowestQuestion.percentageCorrect) +
      "."
    : "No scored responses are available yet.";

  return (
    <DashboardLayout>
      <BackButton
        to={backTo}
        replace
        state={returnsToLesson ? lessonBackState : undefined}
      >
        {returnsToLesson ? "Back to Lesson Workspace" : "Back to Analytics"}
      </BackButton>
      <PageHeader
        title={
          <span className="text-[28px] font-[650] leading-[1.2] tracking-[-.02em]">
            Quiz:{" "}
            <GeneratedContent markdown={data.quiz.title} quizText inline />
          </span>
        }
        subtitle={data.quiz.sectionName + " · Student performance analytics"}
      />
      <p className="-mt-3 mb-6 text-[13px] leading-6 text-muted-foreground">
        {summary}
      </p>
      {error ? <Alert>{error}</Alert> : null}

      <section aria-labelledby="overview-title">
        <Card className="tactile-raised-card p-5 sm:p-7">
          <div className="grid items-center gap-6 min-[900px]:grid-cols-[auto_minmax(0,1fr)_minmax(10rem,.34fr)]">
            <div className="flex justify-center min-[900px]:justify-start">
              <CircularGauge
                bare
                className="h-[132px] w-[132px]"
                strokeWidth={12}
                value={overview.submissionRate}
                ariaLabel={
                  overview.submitted +
                  " of " +
                  overview.enrolled +
                  " students submitted"
                }
                center={
                  <>
                    <strong className="text-[26px] font-[650] leading-none tracking-[-.03em] tabular-nums text-foreground">
                      {overview.submitted}/{overview.enrolled}
                    </strong>
                    <span className="mt-1 text-[12px] leading-none text-muted-foreground">
                      submitted
                    </span>
                  </>
                }
              />
            </div>
            <div className="min-w-0">
              <h2
                id="overview-title"
                className="text-[22px] font-[650] leading-[1.2] tracking-[-.02em] text-foreground"
              >
                Quiz overview
              </h2>
              <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                Submission and score summary for this assessment.
              </p>
              <div className="mt-5">
                <ScoreHistogram
                  ranges={data.scoreDistribution}
                  average={overview.averagePercentage}
                  median={overview.medianPercentage}
                />
              </div>
            </div>
            <Link
              to={
                "/instructor/sections/" + data.quiz.sectionId + "?tab=students"
              }
              aria-label={"Open " + overview.enrolled + " students"}
              className="tactile-inset-well flex min-h-24 min-w-0 flex-col justify-between p-4 text-left transition-transform duration-200 hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[.98] motion-reduce:transform-none motion-reduce:transition-none"
            >
              <span className="flex items-center justify-between gap-2 text-[13px] font-semibold text-muted-foreground">
                Students <ChevronRight size={16} aria-hidden="true" />
              </span>
              <strong className="text-[30px] font-[650] leading-none tracking-[-.03em] tabular-nums text-foreground">
                {overview.enrolled}
              </strong>
            </Link>
          </div>
        </Card>
      </section>

      <section aria-labelledby="question-analysis-title" className="mt-5">
        <Card className="tactile-raised-card p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2
                id="question-analysis-title"
                className="text-[22px] font-[650] leading-[1.2] tracking-[-.02em] text-foreground"
              >
                Question analysis
              </h2>
              <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                Review response patterns without duplicating the topic list.
              </p>
            </div>
            <div
              role="tablist"
              aria-label="Analysis view"
              className="flex min-h-10 rounded-2xl bg-[var(--surface-2)] p-1 shadow-[var(--sh-inset)]"
            >
              {[
                ["question", "By question"],
                ["topic", "By topic"],
              ].map(([mode, label]) => {
                const active = analysisMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setAnalysisMode(mode)}
                    className={
                      "min-h-8 rounded-xl px-3 text-[13px] font-semibold transition-[background-color,box-shadow,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                      (active
                        ? "bg-surface-elevated text-foreground shadow-[var(--neu-shadow-raised-sm)]"
                        : "text-muted-foreground hover:text-foreground")
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {analysisMode === "question" ? (
            <div className="mt-6 grid min-w-0 gap-6 min-[900px]:grid-cols-[minmax(16rem,.72fr)_minmax(0,1.28fr)]">
              <QuestionList
                questions={sortedQuestions}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
              <div className="min-w-0 border-t border-border pt-6 min-[900px]:border-l min-[900px]:border-t-0 min-[900px]:pl-6 min-[900px]:pt-0">
                <QuestionDrilldown question={selected} />
              </div>
            </div>
          ) : (
            <div className="mt-6">
              <TopicList topics={data.topics} />
            </div>
          )}
        </Card>
      </section>

      <section aria-labelledby="student-results-title" className="mt-5">
        <Card className="tactile-raised-card overflow-hidden p-0">
          <div className="p-5 sm:px-7 sm:pt-7">
            <h2
              id="student-results-title"
              className="text-[22px] font-[650] leading-[1.2] tracking-[-.02em] text-foreground"
            >
              Student results
            </h2>
            <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
              Submitted assessment results.
            </p>
          </div>
          {data.students.length ? (
            <div className="mt-5 overflow-x-auto border-t border-border">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-5 py-3 text-[12px] font-semibold text-muted-foreground sm:px-7">
                      Student
                    </th>
                    <th className="px-4 py-3 text-[12px] font-semibold text-muted-foreground">
                      Score
                    </th>
                    <th className="px-4 py-3 text-[12px] font-semibold text-muted-foreground">
                      Percentage
                    </th>
                    <th className="px-4 py-3 text-[12px] font-semibold text-muted-foreground">
                      Missed
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.students.map((student) => (
                    <tr key={student.id} className="h-14 text-foreground">
                      <td className="px-5 py-3 sm:px-7">
                        <div className="font-semibold">
                          {formatDisplayName(student.name)}
                        </div>
                        <div className="mt-0.5 text-[12px] text-muted-foreground">
                          {student.studentNumber || "No student number"}
                        </div>
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {student.score}/{student.maxScore}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {percent(student.percentage)}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {student.questionsMissed}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground sm:px-7">
              No submissions yet.
            </p>
          )}
        </Card>
      </section>
    </DashboardLayout>
  );
}

function Mini({ label, value }) {
  return (
    <div className="tactile-inset-well min-w-0 p-3">
      <dt className="text-[12px] font-semibold text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-lg font-[650] leading-none tabular-nums text-foreground">
        {value}
      </dd>
    </div>
  );
}
