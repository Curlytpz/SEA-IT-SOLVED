import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Card, LoadingState, StatCard } from '../ui';
import { getSectionAnalytics } from '../../services/phase6Api';
import GeneratedContent from '../reasoning/GeneratedContent';
import { analyticsHeadingClassName, analyticsMetricsClassName } from './analyticsStyles';

const percent = value => value == null ? '—' : `${Math.round(value * 10) / 10}%`;
const performanceColor = value => value == null ? 'bg-muted-foreground' : value < 50 ? 'bg-warning' : value < 75 ? 'bg-info' : 'bg-success';
const statusColor = value => value === 'PUBLISHED'
  ? 'text-success-subtle-foreground dark:text-success-subtle-foreground'
  : value === 'CLOSED'
    ? 'text-yellow-700 dark:text-warning-subtle-foreground'
    : 'text-slate-600 dark:text-muted-foreground';

function Bar({ value }) {
  return <div className="mt-[.4rem] h-[.35rem] overflow-hidden rounded-[.2rem] bg-slate-200 dark:bg-skeleton-highlight" aria-hidden="true"><span className={`block h-full ${performanceColor(value)}`} style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }}/></div>;
}

function Metric({ label, value }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}


export default function SectionAnalytics({ sectionId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [showAllTopics, setShowAllTopics] = useState(false);

  useEffect(() => {
    let active = true;
    setData(null);
    setError('');
    getSectionAnalytics(sectionId)
      .then(value => { if (active) setData(value); })
      .catch(requestError => { if (active) setError(requestError.response?.data?.error || 'Unable to load analytics.'); });
    return () => { active = false; };
  }, [sectionId]);

  const topics = useMemo(() => [...(data?.topics || [])].sort((left, right) => (left.percentage ?? 101) - (right.percentage ?? 101)), [data?.topics]);
  const students = useMemo(() => [...(data?.students || [])].sort((left, right) => (left.averagePercentage ?? 101) - (right.averagePercentage ?? 101)), [data?.students]);
  const needsAttention = topics.filter(topic => topic.percentage == null || topic.percentage < 75);
  const doingWell = topics.filter(topic => topic.percentage != null && topic.percentage >= 75).reverse();
  const visibleNeedsAttention = showAllTopics ? needsAttention : needsAttention.slice(0, 3);
  const visibleDoingWell = showAllTopics ? doingWell : doingWell.slice(0, 3);
  const hasMoreTopics = needsAttention.length > 3 || doingWell.length > 3;

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <LoadingState text="Calculating student performance…"/>;

  const overview = data.overview;
  const scoreRange = overview.lowestPercentage == null && overview.highestPercentage == null
    ? '—'
    : `${percent(overview.lowestPercentage)} – ${percent(overview.highestPercentage)}`;

  return <div className="grid gap-5">
    <section aria-labelledby="analytics-overview-title">
      <div className={analyticsHeadingClassName}><div><h2 id="analytics-overview-title">Class overview</h2><p>The current assessment picture for this section.</p></div><span>{overview.submitted} submitted · Median {percent(overview.medianPercentage)}</span></div>
      <div className={analyticsMetricsClassName}><StatCard value={overview.enrolled} label="Students"/><StatCard value={percent(overview.submissionRate)} label="Submission Rate"/><StatCard value={percent(overview.averagePercentage)} label="Class Average"/><StatCard value={scoreRange} label="Score Range"/></div>
    </section>

    <Card className="p-4">
      <div className={analyticsHeadingClassName}><div><h3>Quiz Performance</h3><p>Published assessments, ordered by availability.</p></div></div>
      {data.quizzes.length ? <div className="mt-[.8rem] grid gap-1">{data.quizzes.map(quiz => <article key={quiz.id} className="grid min-h-[58px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-[.35rem] border-t border-border px-[.15rem] py-[.7rem] first:border-t-0 min-[521px]:grid-cols-[minmax(0,1fr)_auto_auto] min-[521px]:gap-4">
        <div className="grid min-w-0 gap-[.15rem]"><strong className="truncate text-[.84rem] text-slate-800 dark:text-foreground"><GeneratedContent markdown={quiz.title} quizText inline/></strong><span className="text-[.72rem] text-muted-foreground">{quiz.submissions ?? 0} submissions · {percent(quiz.averagePercentage)} average</span></div>
        <span className={`text-[.7rem] font-bold capitalize ${statusColor(quiz.status)}`}>{String(quiz.status || '').replaceAll('_', ' ').toLowerCase()}</span>
        <Link className="col-span-full inline-flex min-h-11 items-center text-[.76rem] font-bold text-primary-subtle-foreground underline underline-offset-[3px] min-[521px]:col-auto" to={`/instructor/quizzes/${quiz.id}/analytics`} state={{ returnTo: `/instructor/sections/${sectionId}?tab=analytics` }}>View analytics</Link>
      </article>)}</div> : <p className="px-0 pb-1 pt-5 text-center text-[.82rem] text-muted-foreground">No published quizzes yet.</p>}
    </Card>

    <div className="grid items-start gap-5 min-[901px]:grid-cols-2">
      <Card className="p-4">
        <div className={analyticsHeadingClassName}><div><h3>Topic Performance</h3><p>Concept-level results prioritized for quick review.</p></div></div>
        {topics.length ? <div className="mt-[.85rem] grid gap-4">
          <div className="grid gap-4" id="topic-performance-lists">
          {visibleNeedsAttention.length ? <section aria-labelledby="needs-attention-title">
            <h4 id="needs-attention-title" className="text-[.78rem] font-extrabold tracking-[.01em] text-foreground">Needs Attention</h4>
            <ol className="mt-[.35rem] grid gap-[.15rem]">{visibleNeedsAttention.map(item => <li key={item.topic} className="border-t border-border px-[.1rem] py-[.7rem] first:border-t-0">
              <div className="flex min-w-0 justify-between gap-4 text-[.8rem] text-slate-700 dark:text-foreground"><span><GeneratedContent markdown={item.topic} quizText inline/></span><strong>{percent(item.percentage)}</strong></div>
              <Bar value={item.percentage}/>
              <small className="mt-[.3rem] block text-[.68rem] text-muted-foreground">{item.correct} correct of {item.scored} scored responses</small>
            </li>)}</ol>
          </section> : null}
          {visibleDoingWell.length ? <section aria-labelledby="doing-well-title">
            <h4 id="doing-well-title" className="text-[.78rem] font-extrabold tracking-[.01em] text-foreground">Doing Well</h4>
            <ol className="mt-[.35rem] grid gap-[.15rem]">{visibleDoingWell.map(item => <li key={item.topic} className="border-t border-border px-[.1rem] py-[.7rem] first:border-t-0">
              <div className="flex min-w-0 justify-between gap-4 text-[.8rem] text-slate-700 dark:text-foreground"><span><GeneratedContent markdown={item.topic} quizText inline/></span><strong>{percent(item.percentage)}</strong></div>
              <Bar value={item.percentage}/>
              <small className="mt-[.3rem] block text-[.68rem] text-muted-foreground">{item.correct} correct of {item.scored} scored responses</small>
            </li>)}</ol>
          </section> : null}
          </div>
          {hasMoreTopics ? <button type="button" className="min-h-11 justify-self-start rounded-[.55rem] px-[.65rem] py-2 text-[.78rem] font-[750] text-primary-subtle-foreground underline-offset-[.2rem] hover:bg-primary-subtle hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:hover:bg-primary/10" aria-expanded={showAllTopics} aria-controls="topic-performance-lists" onClick={() => setShowAllTopics(value => !value)}>{showAllTopics ? 'Show fewer topics' : 'View all topics'}</button> : null}
        </div> : <p className="px-0 pb-1 pt-5 text-center text-[.82rem] text-muted-foreground">No classified assessment topics yet.</p>}
      </Card>

      <Card className="p-4">
        <div className={analyticsHeadingClassName}><div><h3>Student Results</h3><p>Students with the lowest averages appear first.</p></div></div>
        {students.length ? <div className="mt-3 grid gap-[.15rem]">{students.map(student => <article key={student.studentId} className="border-t border-border px-[.1rem] py-[.7rem] first:border-t-0">
          <div className="flex min-w-0 justify-between gap-4 text-[.8rem] text-slate-700 dark:text-foreground"><div className="grid min-w-0"><strong>{student.name}</strong><span className="text-[.68rem] text-muted-foreground">{student.studentNumber || 'No student number'}</span></div><strong>{percent(student.averagePercentage)}</strong></div>
          <dl className="mt-[.55rem] grid grid-cols-2 gap-3 [&_dt]:text-[.65rem] [&_dt]:text-muted-foreground [&_dd]:mt-[.1rem] [&_dd]:text-[.8rem] [&_dd]:font-bold [&_dd]:text-slate-700 dark:[&_dd]:text-slate-200"><Metric label="Quizzes completed" value={student.recentScores.length}/><Metric label="Questions missed" value={student.questionsMissed}/></dl>
          <details className="mt-[.4rem] text-[.72rem] text-slate-600 dark:text-muted-foreground"><summary className="flex min-h-11 cursor-pointer items-center font-bold text-primary-subtle-foreground">View performance</summary><ul>{student.recentScores.map(score => <li className="flex justify-between gap-4 py-1" key={score.attemptId}><span><GeneratedContent markdown={score.quizTitle} quizText inline/></span><strong>{percent(score.percentage)}</strong></li>)}</ul></details>
        </article>)}</div> : <p className="px-0 pb-1 pt-5 text-center text-[.82rem] text-muted-foreground">No submitted attempts yet.</p>}
      </Card>
    </div>


    {data.comparableSectionCount > 1 ? <Card className="p-4">
      <details>
        <summary className="flex min-h-[52px] cursor-pointer items-center justify-between gap-4"><span className="grid gap-[.15rem] text-foreground"><strong>Section Comparison</strong><small className="text-[.72rem] font-medium text-muted-foreground">Compare performance across {data.comparableSectionCount} sections</small></span><span className="text-xs font-bold text-primary-subtle-foreground">View comparison</span></summary>
        {data.sectionComparison.length ? <div className="mt-[.8rem] -mx-2 max-w-[calc(100%+1rem)] overflow-x-auto px-2 sm:mx-0 sm:max-w-full sm:px-0 [&_table]:w-full [&_table]:min-w-[620px] [&_table]:text-[.76rem] [&_th]:border-b [&_th]:border-border [&_th]:p-[.7rem] [&_th]:text-left [&_th]:uppercase [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border/60 [&_td]:p-[.7rem] dark:[&_td]:text-slate-200"><table><thead><tr><th>Concept</th><th>Section</th><th>Lessons assessed</th><th>Latest performance</th></tr></thead><tbody>{data.sectionComparison.map((item, index) => <tr key={`${item.topic}-${item.sectionId}-${index}`}><td><GeneratedContent markdown={item.topic} quizText inline/></td><td>{item.sectionName}</td><td>{item.lessonsWithAssessments}</td><td>{percent(item.latestPerformance)}</td></tr>)}</tbody></table></div> : <p className="px-0 pb-1 pt-5 text-center text-[.82rem] text-muted-foreground">Insufficient comparable assessment data.</p>}
      </details>
    </Card> : null}
  </div>;
}
