import { Input } from '../ui';
import MathAwareEditor from './MathAwareEditor';

export default function QuizProblemSettings({ draft, onChange }) {
  const settings = draft.problemSettings || {};
  const patch = change => onChange({ problemSettings: { ...settings, ...change } });
  return <div className="quiz-problem-settings mt-4 space-y-4 rounded-lg border p-4">
    <label className="block text-sm font-semibold">Maximum points<Input className="mt-2" type="number" min="0.01" max="10000" step="0.01" value={draft.maxPoints ?? 1} onChange={event => onChange({ maxPoints: event.target.value })}/></label>
    <div><h4 className="mb-2 text-sm font-semibold">Solution instructions</h4><MathAwareEditor unified preview={false} label="Solution instructions" value={settings.instructions || ''} onChange={value => patch({ instructions: value })}/></div>
    <div className="quiz-problem-rubric"><h4 className="mb-2 text-sm font-semibold">Expected solution / rubric (instructor only)</h4><MathAwareEditor unified preview={false} label="Expected solution / rubric (instructor only)" value={settings.rubric || ''} onChange={value => patch({ rubric: value })}/></div>
    <p className="text-xs text-muted-foreground">Only the professor assigns official points. AI analysis is optional advisory feedback.</p>
    {[['allowTip','tip','Tip'],['allowFormula','formula','Formula']].map(([toggle,key,label]) => <div key={key}>
      <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={Boolean(settings[toggle])} onChange={event => patch({ [toggle]: event.target.checked })}/>{label} {settings[toggle] ? 'ON' : 'OFF'}</label>
      <div className="mt-2"><MathAwareEditor unified preview={false} label={label + ' (stored before publication)'} value={settings[key] || ''} onChange={value => patch({ [key]: value })}/></div>
    </div>)}
    <p className="text-xs text-muted-foreground">Enabled help must be saved before publishing. Students reveal stored help without calling AI.</p>
  </div>;
}
