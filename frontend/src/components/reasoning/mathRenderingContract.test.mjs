import assert from 'node:assert/strict';
import fs from 'node:fs';
import katex from 'katex';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
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

const RECOGNITION_MATH_CASES = [
  '\\lim\\_{x\\to 1^-} P(x)=0.49',
  '\\lim\\_{x\\to 1^+} P(x)=0.86',
  '\\frac{1}{x}',
  '\\sqrt{x}',
  '\\sum\\_{n=1}^{\\infty} x\\_n',
  '\\int\\_0^1 f(x)\\\\,dx',
];
RECOGNITION_MATH_CASES.forEach((markdown, index) => renderNormalized(markdown, 'recognition-' + (index + 1)));

const malformedRecognition = '\\lim\\_{x\\to 1^-} P(x)=$.49';
const repairedRecognition = normalizeMath(malformedRecognition);
assert.equal(repairedRecognition.needsReview.length, 0, 'Recoverable OCR decimal artifacts must not fall back to raw LaTeX.');
assert.match(repairedRecognition.content, /P\(x\)=0\.49/);
assert.doesNotMatch(repairedRecognition.content, /\\$\\.49|\u00A2/);
assert.equal(
  mathContentApi.normalizeRecognitionNumericArtifacts('\\lim\\_{x\\to 1^+} P(x)=\u00A2.86'),
  '\\lim\\_{x\\to 1^+} P(x)=0.86',
);
assert.equal(
  mathContentApi.normalizeRecognitionNumericArtifacts('The kit costs $5.49.'),
  'The kit costs $5.49.',
  'Ordinary currency must not be changed.',
);
assert.equal(
  mathContentApi.normalizeRecognitionNumericArtifacts('The item costs 50¢.'),
  'The item costs 50¢.',
  'A cent sign in ordinary prose must remain unchanged.',
);
assert.equal(
  mathContentApi.normalizeRecognitionNumericArtifacts(String.raw`x \to ¢`, { mathContext: true }),
  String.raw`x \to \mathrm{c}`,
  'A stray cent glyph inside recognized math must use a KaTeX-supported variable.',
);
const strayCentMath = normalizeMath(String.raw`$x \to ¢$`);
assert.equal(strayCentMath.needsReview.length, 0);
assert.doesNotMatch(strayCentMath.content, /¢/);
assert.match(strayCentMath.content, /\\mathrm\{c\}/);

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

const css = [
  new URL('../../index.css', import.meta.url),
  new URL('../../styles/learning-workspaces.css', import.meta.url),
].map(file => fs.readFileSync(file, 'utf8')).join('\n');
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
assert.match(generatedContent, /math-content-inline/);
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

const tutorSource = fs.readFileSync(new URL('./QuizTutor.jsx', import.meta.url), 'utf8');
assert.match(tutorSource, /markdown=\{step\}/, 'Tutor steps must use shared math rendering.');
assert.doesNotMatch(tutorSource, /<span>\{step\}<\/span>/, 'Tutor steps must not render raw LaTeX.');

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { default: GeneratedContent } = await server.ssrLoadModule('/src/components/reasoning/GeneratedContent.jsx');
  const render = (markdown, options = {}) => renderToStaticMarkup(createElement(GeneratedContent, { markdown, ...options }));
  const visibleText = html => html
    .replace(/<annotation\b[^>]*>[\s\S]*?<\/annotation>/g, '')
    .replace(/<[^>]*>/g, '');
  const renderedCases = [
    String.raw`$f(c)$`,
    String.raw`$\lim_{x \to c} f(x)$`,
    String.raw`$\frac{\sin x}{x}$`,
    String.raw`$x^2 + y^2 = z^2$`,
    String.raw`$\int_0^1 x^2\,dx$`,
    String.raw`$$\frac{-b \pm \sqrt{b^2-4ac}}{2a}$$`,
    String.raw`The value of $f(c)$ differs from $\lim_{x \to c} f(x)$.`,
    String.raw`Distinguish between the value of a function $f(c)$ and the limit $\lim_{x \to c} f(x)$.`,
    String.raw`- Study $\frac{\sin x}{x}$ and **explain** the limit.`,
    String.raw`1. Evaluate $\lim_{x \to c} f(x)$.`,
    String.raw`**Important:** $f(c)$ and $\lim_{x \to c} f(x)$ need not agree.`,
    String.raw`Both $f(c)$ and $\frac{\sin x}{x}$ appear here.`,
    String.raw`\(f(c)\) and \[\frac{\sin x}{x}\]`,
  ];
  renderedCases.forEach((source, index) => {
    const html = render(source, { audience: 'student' });
    assert.match(html, /class="katex"/, `rendered-${index}: KaTeX output missing`);
    assert.doesNotMatch(visibleText(html), /\$\$?|\\(?:lim|frac|int|sin)\b/, `rendered-${index}: raw math is visible`);
  });
  const malformedRecognitionHtml = render('$$\\n' + malformedRecognition + '\\n$$');
  assert.match(malformedRecognitionHtml, /class="katex"/, 'Malformed recognition must recover into KaTeX output.');
  assert.doesNotMatch(visibleText(malformedRecognitionHtml), /\\$\\.49|\u00A2|\\\\(?:lim|to)\\b/, 'Raw malformed recognition must not be visible.');
  const inline = render(String.raw`Study $f(c)$`, { inline: true });
  assert.match(inline, /class="katex"/);
  assert.doesNotMatch(inline, /<p(?:\s|>)/, 'Compact math labels must not insert block paragraphs.');
  const table = render(String.raw`| Quantity | Value |
| --- | --- |
| Limit | $\lim_{x \to c} f(x)$ |`);
  assert.match(table, /class="math-table-scroll"/);
  assert.match(table, /<table>/);
  assert.match(table, /class="katex"/);
  const wideDisplay = render(DISPLAY_MATH_CASES.find(([label]) => label === 'long-mobile-overflow')[1]);
  assert.match(wideDisplay, /class="math-block math-scroll"/, 'Wide display math must scroll locally.');
  assert.doesNotThrow(() => render(String.raw`Malformed $\frac{x}{$ stays readable.`));
  const currency = render('The kit costs $5 and the book costs $10.');
  assert.match(visibleText(currency), /\$5 and the book costs \$10/, 'Ordinary prices must stay ordinary text.');
  const escapedCurrency = render(String.raw`The kit costs \$5 and the book costs \$10.`);
  assert.match(visibleText(escapedCurrency), /\$5 and the book costs \$10/, 'Escaped prices must stay ordinary text.');
  assert.match(render(String.raw`Study \$f(c)\$ next.`), /class="katex"/, 'Escaped AI math delimiters must render.');
  assert.doesNotMatch(render('Use `$f(c)$` as a literal example.'), /class="katex"/, 'Inline code must not be converted into math.');
  const literalDelimiter = render('Use `\\(x\\)` as literal notation.');
  assert.match(literalDelimiter, /<code>\\\(x\\\)<\/code>/, 'Inline code delimiters must retain their source.');
  const fencedMath = render('Literal:\n\n```tex\n\\(x\\)\n```\n\nDone.');
  assert.doesNotMatch(fencedMath, /class="katex"/, 'Fenced code must not be converted into math.');
  assert.match(fencedMath, /\\\(x\\\)/, 'Fenced code delimiters must retain their source.');
  const linkedSource = render('See https://example.test/notes/x^2 and contact tutor@example.test.');
  assert.match(linkedSource, /https:\/\/example\.test\/notes\/x\^2/, 'URLs must not be rewritten as math.');
  assert.match(linkedSource, /tutor@example\.test/, 'Email addresses must remain intact.');
} finally {
  await server.close();
}

const packageJson = JSON.parse(fs.readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));
assert.equal(packageJson.dependencies.katex, '0.16.47');

console.log(`SYSTEM MATH RENDERING CONTRACT: PASS (${INLINE_MATH_CASES.length + DISPLAY_MATH_CASES.length} valid fixtures + rendered Markdown/KaTeX and malformed fallback)`);
