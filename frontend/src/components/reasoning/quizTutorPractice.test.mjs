import assert from 'node:assert/strict';
import fs from 'node:fs';
import katex from 'katex';

const component = fs.readFileSync(new URL('./QuizTutor.jsx', import.meta.url), 'utf8');
const generatedContent = fs.readFileSync(new URL('./GeneratedContent.jsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../../index.css', import.meta.url), 'utf8');

assert.match(component, /const \[practiceStatus, setPracticeStatus\] = useState\('idle'\)/);
assert.match(component, /const \[activePractice, setActivePractice\] = useState\(null\)/);
assert.match(component, /setPracticeStatus\('loading'\);setActivePractice\(null\)/, 'Old practice must clear before generation.');
assert.match(component, /practiceRequest\.current/, 'Duplicate client requests must be guarded.');
assert.match(component, /Generating your next practice problem\.\.\./);
assert.match(component, /activePractice&&\['ready','answered'\]\.includes\(practiceStatus\)/);
assert.doesNotMatch(component, /tutor\.practices\?\.map/, 'Historical practices must not accumulate in the active view.');
assert.match(generatedContent, /mathFallback/);
assert.match(css, /\.quiz-tutor-practice-skeleton[\s\S]*?\.quiz-tutor-skeleton-options/);
assert.match(css, /\.quiz-tutor-options > button[\s\S]*?min-height:48px/);
assert.match(css, /@media \(max-width:639px\)[\s\S]*?\.quiz-tutor-practice-heading/);

for (const formula of [
  String.raw`\lim_{x \to 2} f(x)`,
  String.raw`\frac{x^2+1}{x-1}`,
  String.raw`\int_0^1 x^2\,dx`,
  String.raw`x^{n+1}`,
]) {
  assert.match(katex.renderToString(formula, { throwOnError: true, strict: 'ignore' }), /class="katex"/);
}

console.log('QUIZ TUTOR ACTIVE PRACTICE UX: PASS');
