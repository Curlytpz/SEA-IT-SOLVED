import assert from 'node:assert/strict';
import fs from 'node:fs';
import katex from 'katex';
import mathContentApi from '../../../../shared/mathContent.cjs';
import { DISPLAY_MATH_CASES, INLINE_MATH_CASES, MALFORMED_MATH_CASE } from '../../fixtures/math-rendering-cases.js';
import { rehypeMathRenderingContract, remarkMathRenderingContract, withSafeInlineMathStyle } from '../../utils/mathRenderingContract.js';

const normalizeMath = mathContentApi.createLessonMathNormalizer(katex);

function renderNormalized(markdown, label) {
  const result = normalizeMath(markdown);
  assert.equal(result.needsReview.length, 0, `${label}: valid math was marked for review`);
  const display = [...result.content.matchAll(/\$\$\s*([\s\S]*?)\s*\$\$/g)];
  const withoutDisplay = result.content.replace(/\$\$[\s\S]*?\$\$/g, '');
  const inline = [...withoutDisplay.matchAll(/(^|[^$])\$([^$\n]+)\$(?!\$)/g)];
  assert.ok(display.length + inline.length > 0, `${label}: no canonical math delimiter was produced`);
  display.forEach(match => assert.match(
    katex.renderToString(match[1], { displayMode: true, throwOnError: true, strict: 'ignore' }),
    /class="katex-display"/,
  ));
  inline.forEach(match => assert.match(
    katex.renderToString(match[2], { displayMode: false, throwOnError: true, strict: 'ignore' }),
    /class="katex"/,
  ));
}

INLINE_MATH_CASES.forEach((markdown, index) => renderNormalized(markdown, `inline-${index + 1}`));
DISPLAY_MATH_CASES.forEach(([label, markdown]) => renderNormalized(markdown, label));

const nestedFraction = katex.renderToString(
  String.raw`\frac{\frac{x+1}{x-1}}{\frac{x-2}{x+2}}`,
  { displayMode: true, throwOnError: true, strict: 'ignore' },
);
assert.match(nestedFraction, /class="mfrac"/);
assert.match(nestedFraction, /class="vlist/);

const malformed = normalizeMath(MALFORMED_MATH_CASE);
assert.equal(malformed.needsReview.length, 1);
assert.match(malformed.content, /frac/);
assert.match(malformed.content, /\`/);

assert.equal(withSafeInlineMathStyle(String.raw`x^2+1`), String.raw`x^2+1`);
assert.equal(
  withSafeInlineMathStyle(String.raw`\lim_{x\to-3}\frac{x^2-9}{x^2+2x-3}`),
  String.raw`\displaystyle \lim_{x\to-3}\frac{x^2-9}{x^2+2x-3}`,
);
const markdownTree = { type: 'root', children: [
  { type: 'paragraph', children: [
    { type: 'inlineMath', value: String.raw`\frac{3}{2}` },
    { type: 'inlineMath', value: 'x=2' },
  ] },
] };
remarkMathRenderingContract()(markdownTree);
assert.match(markdownTree.children[0].children[0].value, /^\\displaystyle /);
assert.equal(markdownTree.children[0].children[1].value, 'x=2');

const tree = {
  type: 'root',
  children: [
    {
      type: 'element',
      tagName: 'span',
      properties: { className: ['katex-display'] },
      children: [{ type: 'element', tagName: 'span', properties: { className: ['katex'] }, children: [] }],
    },
    {
      type: 'element',
      tagName: 'span',
      properties: { className: ['katex'] },
      children: [{ type: 'text', value: 'x=2' }],
    },
    {
      type: 'element',
      tagName: 'span',
      properties: { className: ['katex'] },
      children: [{ type: 'text', value: String.raw`\displaystyle \frac{3}{2}` }],
    },
    {
      type: 'element',
      tagName: 'span',
      properties: { className: ['katex-error'] },
      children: [{ type: 'text', value: String.raw`\frac{x}{` }],
    },
  ],
};
rehypeMathRenderingContract({ showReviewFallback: true })(tree);

assert.deepEqual(tree.children[0].properties.className, ['math-block', 'math-scroll']);
assert.equal(tree.children[0].properties.tabIndex, 0);
assert.deepEqual(tree.children[0].children[0].properties.className, ['katex-display']);
assert.deepEqual(tree.children[0].children[0].children[0].properties.className, ['katex']);
assert.deepEqual(tree.children[1].properties.className, ['math-inline']);
assert.deepEqual(tree.children[1].children[0].properties.className, ['katex']);
assert.deepEqual(tree.children[2].properties.className, ['math-inline', 'math-inline-tall']);
assert.match(tree.children[3].properties.className.join(' '), /math-invalid-source/);
assert.equal(tree.children[3].children[0].value, String.raw`\frac{x}{`);

const css = fs.readFileSync(new URL('../../index.css', import.meta.url), 'utf8');
assert.match(css, /\.math-content \.math-block\s*\{[\s\S]*?overflow-x: auto;[\s\S]*?overflow-y: visible;/);
assert.match(css, /\.math-content \.math-block:focus-visible\s*\{/);
assert.doesNotMatch(css, /\.math-content \.math-block > \.katex-display\s*\{/, 'Shared layout must not override the KaTeX display node.');
assert.match(css, /\.math-content \.katex\s*\{[\s\S]*?overflow-wrap: normal;[\s\S]*?word-break: normal;[\s\S]*?white-space: nowrap;/);
assert.doesNotMatch(css, /\.math-content :where\(\.katex, \.katex \*\)/, 'Shared CSS must not override every KaTeX internal span.');
assert.match(css, /\.math-content :where\(p, li\):has\(\.math-inline-tall\)[\s\S]*?line-height: 2\.1;/);
assert.doesNotMatch(css, /\.math-content\s+span\s*\{/);
assert.doesNotMatch(css, /\.generated-doc-markdown\s+span\s*\{/);
assert.doesNotMatch(css, /\.quiz-ai-suggested-feedback[^}]*overflow-y:\s*hidden/);
assert.doesNotMatch(css, /\.math-invalid-hidden/);

const generatedContent = fs.readFileSync(new URL('./GeneratedContent.jsx', import.meta.url), 'utf8');
assert.match(generatedContent, /export const SharedMathMarkdown/);
assert.match(generatedContent, /rehypeMathRenderingContract/);
assert.match(generatedContent, /querySelectorAll\('\.math-inline'\)/);
assert.match(generatedContent, /ResizeObserver/);
assert.match(css, /\.math-content \.math-inline\.is-wide-math\s*\{[\s\S]*?overflow-x: auto;[\s\S]*?overflow-y: visible;/);

for (const file of [
  '../../components/recognition/CompiledLessonRecognition.jsx',
  '../../components/recognition/RecognitionCaptureCard.jsx',
  './QuizSolutionReview.jsx',
  './QuizTutor.jsx',
]) {
  assert.match(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), /GeneratedContent/);
}

const packageJson = JSON.parse(fs.readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));
assert.equal(packageJson.dependencies.katex, '0.16.47');

console.log(`SYSTEM MATH RENDERING CONTRACT: PASS (${INLINE_MATH_CASES.length + DISPLAY_MATH_CASES.length} valid fixtures + malformed fallback)`);
