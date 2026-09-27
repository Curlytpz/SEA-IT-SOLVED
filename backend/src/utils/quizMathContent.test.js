const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeQuizMathContent } = require('./quizMathContent');

function valid(value) {
  const result = normalizeQuizMathContent(value, { maxLength: 10000 });
  assert.deepEqual(result.needsReview, []);
  return result.content;
}

test('prose decimal currency is preserved without becoming a math delimiter', () => {
  assert.equal(valid('It costs $0.49 to mail a letter.'), 'It costs \\$0.49 to mail a letter.');
  assert.equal(valid('$0.49 to mail a letter'), '\\$0.49 to mail a letter');
});

test('mixed prose, currency, and supported inline math remain valid', () => {
  const content = valid('It costs $0.49 as $x \\to 1$.');
  assert.equal(content, 'It costs \\$0.49 as $x \\to 1$.');
});

test('valid limit and inline expressions pass', () => {
  assert.match(valid('Evaluate $\\lim_{x \\to 1} f(x)$.'), /\\lim_\{x \\to 1\}/);
  assert.equal(valid('What happens as $x \\to 1$?'), 'What happens as $x \\to 1$?');
});

test('unsupported raw control sequences and unmatched delimiters remain reviewable', () => {
  assert.ok(normalizeQuizMathContent('What happens as \\xapproaches1?', { maxLength: 10000 }).needsReview.some(issue => issue.reason === 'UNSUPPORTED_LATEX_COMMAND'));
  assert.ok(normalizeQuizMathContent('What happens as $x \\to 1?', { maxLength: 10000 }).needsReview.some(issue => issue.reason === 'UNMATCHED_MATH_DELIMITER'));
  assert.ok(normalizeQuizMathContent('What happens as \\(x \\to 1?', { maxLength: 10000 }).needsReview.some(issue => issue.reason === 'UNMATCHED_MATH_DELIMITER'));
});

test('safe duplicate backslashes and line artifacts are repaired before validation', () => {
  const duplicate = valid(String.raw`Evaluate $\\lim_{x \\to 1} f(x)$.`);
  assert.match(duplicate, /\\lim_\{x \\to 1\}/);
  assert.doesNotMatch(duplicate, /\\\\lim/);
  const lineArtifact = valid('The postage is \\\\\n$0.49 for one ounce.');
  assert.equal(lineArtifact, 'The postage is\n\\$0.49 for one ounce.');
});

test('Post Office quiz fixture produces valid mixed prose and math', () => {
  const source = 'For the "Post Office" step function, it costs $0.49 to mail a 1-oz letter. What are the left-hand and right-hand limits as $x \\to 1$?';
  const content = valid(source);
  assert.match(content, /costs \\\$0\.49/);
  assert.match(content, /\$x \\to 1\$/);
  assert.doesNotMatch(content, /xapproaches|\\\\\\/);
});
