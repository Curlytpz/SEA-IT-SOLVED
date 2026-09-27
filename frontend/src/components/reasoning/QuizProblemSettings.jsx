import { Alert, Input } from '../ui';
import MathAwareEditor from './MathAwareEditor';

function ReviewMessage({ issue }) {
  if (!issue) return null;
  return <Alert type="warning" label={issue.label} className="mb-0 mt-2">{issue.reason}. Correct this field, then save the question.</Alert>;
}

export default function QuizProblemSettings({ draft, mathIssues = [], onChange }) {
  const settings = draft.problemSettings || {};
  const patch = change => onChange({ problemSettings: { ...settings, ...change } });
  const issueFor = field => mathIssues.find(issue => issue.field === `problemSettings.${field}`);
  return <div className="quiz-problem-settings mt-4 space-y-4 rounded-lg border p-4">
    <label className="block text-sm font-semibold">Maximum points<Input className="mt-2" type="number" min="0.01" max="10000" step="0.01" value={draft.maxPoints ?? 1} onChange={event => onChange({ maxPoints: event.target.value })}/></label>
    <div className={issueFor('instructions') ? 'has-math-review' : ''}><h4 className="mb-2 text-sm font-semibold">Solution instructions</h4><MathAwareEditor unified preview={false} label="Solution instructions" value={settings.instructions || ''} onChange={value => patch({ instructions: value })}/><ReviewMessage issue={issueFor('instructions')}/></div>
    <div className={`quiz-problem-rubric ${issueFor('rubric') ? 'has-math-review' : ''}`}><h4 className="mb-2 text-sm font-semibold">Expected solution / rubric (instructor only)</h4><MathAwareEditor unified preview={false} label="Expected solution / rubric (instructor only)" value={settings.rubric || ''} onChange={value => patch({ rubric: value })}/><ReviewMessage issue={issueFor('rubric')}/></div>
    <p className="text-xs text-muted-foreground">Only the professor assigns official points. AI analysis is optional advisory feedback.</p>
    {[['allowTip','tip','Tip'],['allowFormula','formula','Formula']].map(([toggle,key,label]) => <div key={key} className={issueFor(key) ? 'has-math-review' : ''}>
      <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={Boolean(settings[toggle])} onChange={event => patch({ [toggle]: event.target.checked })}/>{label} {settings[toggle] ? 'ON' : 'OFF'}</label>
      <div className="mt-2"><MathAwareEditor unified preview={false} label={label + ' (stored before publication)'} value={settings[key] || ''} onChange={value => patch({ [key]: value })}/></div>
      <ReviewMessage issue={issueFor(key)}/>
    </div>)}
    <p className="text-xs text-muted-foreground">Enabled help must be saved before publishing. Students reveal stored help without calling AI.</p>
  </div>;
}
