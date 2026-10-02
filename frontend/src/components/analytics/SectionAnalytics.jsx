import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Card, CircularGauge, LoadingState, Meter, StatusChip } from '../ui';
import { getSectionAnalytics } from '../../services/phase6Api';
import GeneratedContent from '../reasoning/GeneratedContent';
import { analyticsHeadingClassName } from './analyticsStyles';
import { formatDisplayName } from '../../utils/displayName';
import { ChevronRight } from 'lucide-react';

const percent = value => value == null ? '—' : `${Math.round(value * 10) / 10}%`;
function Bar({ value }) {
  return <Meter value={value} className="mt-2 h-2" label="Performance"/>;
}

function Metric({ label, value }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function ScoreRange({ lowest, highest, median, average, submitted }) {
  const values = [lowest, highest, median, average].map(Number);
  const hasRange = submitted >= 2 && Number.isFinite(values[0]) && Number.isFinite(values[1]);
  if (!hasRange) {
    const oneScore = submitted === 1 && Number.isFinite(Number(average)) ? percent(average) : null;
    return <div className="tactile-inset-well grid min-h-24 content-center gap-1 px-4 py-3">
      <p className="text-[13px] font-semibold text-foreground">Score range</p>
      <p className="text-[12px] leading-5 text-muted-foreground">{submitted === 0 ? 'No submitted scores yet.' : oneScore ? `One submitted score: ${oneScore}.` : 'One submitted score; a range is not available yet.'}</p>
    </div>;
  }

  const low = Math.max(0, Math.min(100, Number(lowest)));
  const high = Math.max(low, Math.min(100, Number(highest)));
  const medianPosition = Number.isFinite(Number(median)) ? Math.max(0, Math.min(100, Number(median))) : null;
  const averagePosition = Number.isFinite(Number(average)) ? Math.max(0, Math.min(100, Number(average))) : null;
  const label = `Scores range from ${percent(low)} to ${percent(high)}${medianPosition == null ? '' : `, median ${percent(medianPosition)}`}.`;

  return <div className="tactile-inset-well min-h-24 px-4 py-3" role="img" aria-label={label}>
    <div className="flex items-center justify-between gap-3 text-[12px] font-semibold text-muted-foreground"><span>Score range</span><span>{percent(low)}–{percent(high)}</span></div>
    <div className="relative mt-3 h-3 rounded-full bg-[var(--surface-2)] shadow-[var(--sh-inset)]">
      <span className="absolute inset-y-[3px] rounded-full bg-gradient-to-r from-teal-400 to-teal-500 transition-[left,width] duration-500 motion-reduce:transition-none" style={{ left: `${low}%`, width: `${Math.max(1, high - low)}%` }} />
      {medianPosition != null && <span className="absolute -top-1 h-5 w-0.5 -translate-x-1/2 rounded-full bg-foreground/70" style={{ left: `${medianPosition}%` }}><span className="sr-only">Median {percent(medianPosition)}</span></span>}
    </div>
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted-foreground"><span>Median {medianPosition == null ? '—' : percent(medianPosition)}</span><span>Class average {averagePosition == null ? '—' : percent(averagePosition)}</span></div>
  </div>;
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
  return <div className="grid gap-5">
    <section aria-labelledby="analytics-overview-title">
      <Card className="tactile-raised-card p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-3 min-[820px]:flex-row min-[820px]:items-start">
          <div><h2 id="analytics-overview-title" className="text-[22px] font-[650] leading-tight tracking-[-.02em] text-foreground">Class overview</h2><p className="mt-1 text-sm text-muted-foreground">{overview.submitted} of {overview.enrolled} students have submitted</p></div>
          <StatusChip status={overview.enrolled === 0 ? 'INFO' : overview.submitted >= overview.enrolled ? 'READY' : 'PENDING'} label={overview.enrolled === 0 ? 'No students enrolled' : overview.submitted >= overview.enrolled ? 'Everyone has submitted' : `${Math.max(0, overview.enrolled - overview.submitted)} not submitted yet`} />
        </div>
        <div className="mt-5 grid items-stretch gap-5 min-[820px]:grid-cols-[132px_minmax(0,1fr)_minmax(11rem,.58fr)] min-[820px]:items-center">
          <CircularGauge value={overview.submissionRate} label="Submission rate" ariaLabel={`${overview.submitted} of ${overview.enrolled} students submitted (${percent(overview.submissionRate)})`} strokeWidth={12} bare className="h-[132px] w-[132px] justify-self-center min-[820px]:justify-self-start" center={<><strong className="text-[26px] font-[650] leading-none tabular-nums text-foreground">{overview.submitted}/{overview.enrolled}</strong><span className="mt-1 text-[12px] leading-none text-muted-foreground">students</span></>} />
          <ScoreRange lowest={overview.lowestPercentage} highest={overview.highestPercentage} median={overview.medianPercentage} average={overview.averagePercentage} submitted={overview.submitted} />
          <Link to={`/instructor/sections/${sectionId}?tab=students`} className="tactile-inset-well group flex min-h-24 items-center justify-between gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"><span><span className="block text-[13px] font-semibold text-muted-foreground">Students</span><strong className="mt-1 block text-[30px] font-[650] leading-none tracking-[-.03em] tabular-nums text-foreground">{overview.enrolled}</strong></span><ChevronRight size={18} aria-hidden="true" className="text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:transform-none"/></Link>
        </div>
      </Card>
    </section>

    <Card className="p-4">
        <div className={analyticsHeadingClassName}><div><h3>Quiz performance</h3><p>Published assessments, ordered by availability.</p></div></div>
      {data.quizzes.length ? <div className="mt-[.8rem] grid gap-1">{data.quizzes.map(quiz => <article key={quiz.id} className="grid min-h-[58px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-[.35rem] border-t border-border px-[.15rem] py-[.7rem] first:border-t-0 min-[521px]:grid-cols-[minmax(0,1fr)_auto_auto] min-[521px]:gap-4">
        <div className="grid min-w-0 gap-[.15rem]"><strong className="truncate text-[.84rem] text-slate-800 dark:text-foreground"><GeneratedContent markdown={quiz.title} quizText inline/></strong><span className="text-[.72rem] text-muted-foreground">{quiz.submissions ?? 0} submissions · {percent(quiz.averagePercentage)} average</span></div>
        <StatusChip status={quiz.status}/>
        <Link className="col-span-full inline-flex min-h-11 items-center text-[.76rem] font-bold text-primary-subtle-foreground underline underline-offset-[3px] min-[521px]:col-auto" to={`/instructor/quizzes/${quiz.id}/analytics`} state={{ returnTo: `/instructor/sections/${sectionId}?tab=analytics` }}>Open analytics</Link>
      </article>)}</div> : <p className="px-0 pb-1 pt-5 text-center text-[.82rem] text-muted-foreground">No published quizzes yet.</p>}
    </Card>

    <div className="grid items-start gap-5 min-[901px]:grid-cols-2">
      <Card className="p-4">
        <div className={analyticsHeadingClassName}><div><h3>Topic performance</h3><p>Concept-level results prioritized for quick review.</p></div></div>
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
        <div className={analyticsHeadingClassName}><div><h3>Student results</h3><p>Students with the lowest averages appear first.</p></div></div>
        {students.length ? <div className="mt-3 grid gap-[.15rem]">{students.map(student => <article key={student.studentId} className="border-t border-border px-[.1rem] py-3 first:border-t-0">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm text-foreground"><div className="grid min-w-0"><strong className="truncate">{formatDisplayName(student.name)}</strong><span className="text-xs text-muted-foreground">{student.studentNumber || 'No student number'}</span></div><strong>{percent(student.averagePercentage)}</strong></div>
          <dl className="mt-2 grid grid-cols-2 gap-3 [&_dt]:text-xs [&_dt]:text-muted-foreground [&_dd]:mt-[.1rem] [&_dd]:text-sm [&_dd]:font-bold [&_dd]:text-foreground"><Metric label="Quizzes" value={student.recentScores.length}/><Metric label="Missed" value={student.questionsMissed}/></dl>
          <details className="mt-1 text-xs text-muted-foreground"><summary className="flex min-h-10 cursor-pointer items-center font-semibold text-primary-subtle-foreground">Performance details</summary><ul>{student.recentScores.map(score => <li className="flex justify-between gap-4 py-1" key={score.attemptId}><span><GeneratedContent markdown={score.quizTitle} quizText inline/></span><strong>{percent(score.percentage)}</strong></li>)}</ul></details>
        </article>)}</div> : <p className="px-0 pb-1 pt-5 text-center text-[.82rem] text-muted-foreground">No submitted attempts yet.</p>}
      </Card>
    </div>


    {data.comparableSectionCount > 1 ? <Card className="p-4">
      <details>
        <summary className="flex min-h-[52px] cursor-pointer items-center justify-between gap-4"><span className="grid gap-[.15rem] text-foreground"><strong>Section Comparison</strong><small className="text-[.72rem] font-medium text-muted-foreground">Compare performance across {data.comparableSectionCount} sections</small></span><span className="text-xs font-bold text-primary-subtle-foreground">View comparison</span></summary>
        {data.sectionComparison.length ? <div className="mt-[.8rem] -mx-2 max-w-[calc(100%+1rem)] overflow-x-auto px-2 sm:mx-0 sm:max-w-full sm:px-0 [&_table]:w-full [&_table]:min-w-[620px] [&_table]:text-[.76rem] [&_th]:border-b [&_th]:border-border [&_th]:p-[.7rem] [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border/60 [&_td]:p-[.7rem] dark:[&_td]:text-slate-200"><table><thead><tr><th>Concept</th><th>Section</th><th>Lessons assessed</th><th>Latest performance</th></tr></thead><tbody>{data.sectionComparison.map((item, index) => <tr key={`${item.topic}-${item.sectionId}-${index}`}><td><GeneratedContent markdown={item.topic} quizText inline/></td><td>{item.sectionName}</td><td>{item.lessonsWithAssessments}</td><td>{percent(item.latestPerformance)}</td></tr>)}</tbody></table></div> : <p className="px-0 pb-1 pt-5 text-center text-[.82rem] text-muted-foreground">Insufficient comparable assessment data.</p>}
      </details>
    </Card> : null}
  </div>;
}
