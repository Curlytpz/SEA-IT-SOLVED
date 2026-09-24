import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Btn, Card, Select } from '../ui';
import { getInstructorReviewQueue } from '../../services/phase6Api';
import { instructorReviewState } from './instructorReviewState';
import GeneratedContent from './GeneratedContent';

export default function InstructorReviewQueue() {
  const [review, setReview] = useState(null);
  const [error, setError] = useState('');
  const [section, setSection] = useState('');

  async function load() {
    try {
      setReview(await getInstructorReviewQueue());
      setError('');
    } catch {
      setError('Unable to load pending reviews.');
    }
  }

  useEffect(() => { load(); }, []);

  const rows = Array.isArray(review?.rows) ? review.rows : [];
  const state = review ? instructorReviewState(review) : 'loading';
  const sections = [...new Map(rows.map(row => [row.sectionId, row.sectionName])).entries()];

  return <Card className="mb-6 p-5">
    <h2 className="font-bold">Solutions Awaiting Review</h2>
    {error ? <Alert type="error" label="Review queue" className="mb-0 mt-3" actions={<Btn variant="secondary" size="sm" onClick={load}>Retry</Btn>}>{error}</Alert>
      : state === 'loading' ? <p className="mt-2 text-sm text-muted-foreground">Loading reviews…</p>
      : state === 'empty' ? <Alert type="info" label="Review status" title="No student solutions yet." className="mb-0 mt-3">Submitted problem-solving responses will appear here when students begin sending their work.</Alert>
      : state === 'reviewed' ? <Alert type="success" label="Review status" className="mb-0 mt-3">All submitted problem-solving responses have been reviewed.</Alert>
      : state === 'unavailable' ? <Alert type="error" label="Review status" className="mb-0 mt-3" actions={<Btn variant="secondary" size="sm" onClick={load}>Retry</Btn>}>Unable to determine the current review status.</Alert>
      : <>
        <p className="mt-2 text-sm text-muted-foreground">{rows.reduce((sum, row) => sum + row.pending, 0)} manual responses · {rows.length} quizzes · {sections.length} sections</p>
        <Select className="mt-3 max-w-xs" aria-label="Filter reviews by section" value={section} onChange={event => setSection(event.target.value)}>
          <option value="">All sections</option>
          {sections.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </Select>
        <ul className="mt-4 divide-y divide-slate-200 dark:divide-border">
          {rows.filter(row => !section || row.sectionId === section).map(row => <li key={row.quizId} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="text-sm font-semibold"><GeneratedContent markdown={row.title} quizText inline /></p>
              <p className="text-xs text-muted-foreground">{row.sectionName} · {row.pending} responses awaiting review</p>
            </div>
            <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-primary-subtle-foreground dark:text-primary" to={`/instructor/quizzes/${row.quizId}/attempts`}>Review Solutions →</Link>
          </li>)}
        </ul>
      </>}
  </Card>;
}
