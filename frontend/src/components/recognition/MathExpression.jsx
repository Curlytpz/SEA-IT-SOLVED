import GeneratedContent from '../reasoning/GeneratedContent';

export default function MathExpression({ latex }) {
  const expression = String(latex || '').trim();
  return <div className="max-w-full min-w-0 text-foreground" role="math" aria-label={`Mathematical expression: ${expression}`}>
    <GeneratedContent markdown={`$$\n${expression}\n$$`}/>
  </div>;
}
