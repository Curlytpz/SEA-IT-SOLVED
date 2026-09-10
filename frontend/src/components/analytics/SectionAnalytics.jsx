import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Card, LoadingState, StatCard } from '../ui';
import { getSectionAnalytics } from '../../services/phase6Api';

const percent = value => value == null ? '—' : `${Math.round(value * 10) / 10}%`;
const performanceColor = value => value == null ? 'bg-muted-foreground' : value < 50 ? 'bg-warning' : value < 75 ? 'bg-info' : 'bg-success';

function Bar({ value }) {
  return <div className="analytics-performance-bar" aria-hidden="true"><span className={performanceColor(value)} style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }}/></div>;
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

  return <div className="analytics-overview-page">
    <section aria-labelledby="analytics-overview-title">
      <div className="analytics-heading-row"><div><h2 id="analytics-overview-title">Class overview</h2><p>The current assessment picture for this section.</p></div><span>{overview.submitted} submitted · Median {percent(overview.medianPercentage)}</span></div>
      <div className="analytics-primary-metrics"><StatCard value={overview.enrolled} label="Students"/><StatCard value={percent(overview.submissionRate)} label="Submission Rate"/><StatCard value={percent(overview.averagePercentage)} label="Class Average"/><StatCard value={scoreRange} label="Score Range"/></div>
    </section>

    <Card className="analytics-panel">
      <div className="analytics-heading-row"><div><h3>Quiz Performance</h3><p>Published assessments, ordered by availability.</p></div></div>
      {data.quizzes.length ? <div className="analytics-quiz-list">{data.quizzes.map(quiz => <article key={quiz.id}>
        <div><strong>{quiz.title}</strong><span>{quiz.submissions ?? 0} submissions · {percent(quiz.averagePercentage)} average</span></div>
        <span className={`analytics-status is-${String(quiz.status || '').toLowerCase()}`}>{String(quiz.status || '').replaceAll('_', ' ').toLowerCase()}</span>
        <Link to={`/instructor/quizzes/${quiz.id}/analytics`} state={{ returnTo: `/instructor/sections/${sectionId}?tab=analytics` }}>View analytics</Link>
      </article>)}</div> : <p className="analytics-empty">No published quizzes yet.</p>}
    </Card>

    <div className="analytics-priority-grid">
      <Card className="analytics-panel">
        <div className="analytics-heading-row"><div><h3>Topic Performance</h3><p>Concept-level results prioritized for quick review.</p></div></div>
        {topics.length ? <div className="analytics-topic-groups">
          <div className="analytics-topic-lists" id="topic-performance-lists">
          {visibleNeedsAttention.length ? <section className="analytics-topic-group" aria-labelledby="needs-attention-title">
            <h4 id="needs-attention-title">Needs Attention</h4>
            <ol className="analytics-topic-list">{visibleNeedsAttention.map(item => <li key={item.topic}>
              <div><span>{item.topic}</span><strong>{percent(item.percentage)}</strong></div>
              <Bar value={item.percentage}/>
              <small>{item.correct} correct of {item.scored} scored responses</small>
            </li>)}</ol>
          </section> : null}
          {visibleDoingWell.length ? <section className="analytics-topic-group" aria-labelledby="doing-well-title">
            <h4 id="doing-well-title">Doing Well</h4>
            <ol className="analytics-topic-list">{visibleDoingWell.map(item => <li key={item.topic}>
              <div><span>{item.topic}</span><strong>{percent(item.percentage)}</strong></div>
              <Bar value={item.percentage}/>
              <small>{item.correct} correct of {item.scored} scored responses</small>
            </li>)}</ol>
          </section> : null}
          </div>
          {hasMoreTopics ? <button type="button" className="analytics-topic-toggle" aria-expanded={showAllTopics} aria-controls="topic-performance-lists" onClick={() => setShowAllTopics(value => !value)}>{showAllTopics ? 'Show fewer topics' : 'View all topics'}</button> : null}
        </div> : <p className="analytics-empty">No classified assessment topics yet.</p>}
      </Card>

      <Card className="analytics-panel">
        <div className="analytics-heading-row"><div><h3>Student Results</h3><p>Students with the lowest averages appear first.</p></div></div>
        {students.length ? <div className="analytics-student-list">{students.map(student => <article key={student.studentId}>
          <div className="analytics-student-summary"><div><strong>{student.name}</strong><span>{student.studentNumber || 'No student number'}</span></div><strong>{percent(student.averagePercentage)}</strong></div>
          <dl><Metric label="Quizzes completed" value={student.recentScores.length}/><Metric label="Questions missed" value={student.questionsMissed}/></dl>
          <details><summary>View performance</summary><ul>{student.recentScores.map(score => <li key={score.attemptId}><span>{score.quizTitle}</span><strong>{percent(score.percentage)}</strong></li>)}</ul></details>
        </article>)}</div> : <p className="analytics-empty">No submitted attempts yet.</p>}
      </Card>
    </div>


    {data.comparableSectionCount > 1 ? <Card className="analytics-panel analytics-comparison-panel">
      <details>
        <summary><span><strong>Section Comparison</strong><small>Compare performance across {data.comparableSectionCount} sections</small></span><span>View comparison</span></summary>
        {data.sectionComparison.length ? <div className="responsive-table analytics-compact-table"><table><thead><tr><th>Concept</th><th>Section</th><th>Lessons assessed</th><th>Latest performance</th></tr></thead><tbody>{data.sectionComparison.map((item, index) => <tr key={`${item.topic}-${item.sectionId}-${index}`}><td>{item.topic}</td><td>{item.sectionName}</td><td>{item.lessonsWithAssessments}</td><td>{percent(item.latestPerformance)}</td></tr>)}</tbody></table></div> : <p className="analytics-empty">Insufficient comparable assessment data.</p>}
      </details>
    </Card> : null}
  </div>;
}
