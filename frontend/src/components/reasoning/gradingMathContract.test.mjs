import assert from 'node:assert/strict';
import fs from 'node:fs';
import katex from 'katex';
import mathContentApi from '../../../../shared/mathContent.cjs';

const formulas = [
  String.raw`f(x)`,
  String.raw`x = 2`,
  String.raw`\lim_{x \to 2} f(x)`,
  String.raw`\int \frac{\sin x\left(x\cos x-\sin x\right)}{x^3}\,dx`,
  String.raw`\frac{\frac{x^2+1}{x-1}}{\frac{x+1}{x^2-1}}`,
  String.raw`\sum_{n=1}^{\infty}\frac{1}{n^2}`,
];

for (const formula of formulas) {
  const html = katex.renderToString(formula, { throwOnError: true, strict: 'ignore' });
  assert.match(html, /class="katex"/, formula);
}

const normalizeMath = mathContentApi.createLessonMathNormalizer(katex);
const savedFeedback = normalizeMath(String.raw`The response should evaluate lim\_{x \to 2} f(x), simplify \frac{x^2-4}{x-2}, and compare \int_0^2 f(x)\,dx.`);
assert.match(savedFeedback.content, /\$\\lim_\{x \\to 2\} f\(x\)\$/);
assert.match(savedFeedback.content, /\$\\frac\{x\^2-4\}\{x-2\}\$/);
assert.match(savedFeedback.content, /\$\\int_0\^2 f\(x\)\\,dx\$/);

const css = fs.readFileSync(new URL('../../index.css', import.meta.url), 'utf8');
assert.match(css, /\.math-content \.katex\s*\{[\s\S]*?overflow-wrap: normal;[\s\S]*?word-break: normal;[\s\S]*?white-space: nowrap;/);
assert.match(css, /\.math-content \.math-block[\s\S]*?min-width: 0;[\s\S]*?overflow-x: auto;/);
assert.match(css, /\.quiz-ai-suggestion-grid[\s\S]*?minmax\(180px,260px\) minmax\(0,1fr\)/);
assert.doesNotMatch(css, /\.quiz-ai-suggestion-grid span\s*\{/);
assert.match(css, /\.quiz-ai-suggestion-grid > div > span\s*\{/);
assert.doesNotMatch(css, /\.quiz-ai-suggested-feedback \.math-content :where\(\.katex, \.katex \*\)/, 'Grading must inherit the shared KaTeX safety contract.');
assert.doesNotMatch(css, /\.quiz-ai-suggested-feedback[^}]*overflow-y:\s*hidden/);
assert.match(css, /@media \(max-width:899px\)[\s\S]*?\.quiz-ai-suggestion-grid \{ grid-template-columns: minmax\(0,1fr\); \}/);

const review = fs.readFileSync(new URL('./QuizSolutionReview.jsx', import.meta.url), 'utf8');
assert(!review.includes('Recognized solution (verify against the image)'));
for (const label of ['Recognized!', 'Done Analyze!', 'Reprocess AI Analyzation?']) assert(review.includes(label), label);
for (const label of ['Applied!', 'Apply AI suggestion?', 'Edit Grade', 'Cancel Edit']) assert(review.includes(label), label);
assert(!review.includes("No, I'll Edit"));
assert(!review.includes('Reapply Suggestion'));
assert.match(review, /mathFallback/);
assert.match(review, /setSuggestionApplyStatus\('applied'\)/);
assert.match(review, /current==='applied'\|\|current==='edited'\?'edited':'idle'/);
assert.match(review, /GeneratedContent markdown=\{savedGrade\.feedback\|\|'No feedback provided\.'\}/);
assert.match(review, /setScore\(savedGrade\.score\);[\s\S]*?setFeedback\(savedGrade\.feedback\);[\s\S]*?setIsEditingGrade\(false\)/);

console.log('GRADING MATH/STATUS CONTRACT: PASS');
