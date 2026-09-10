const assert = require('assert/strict');
const { normalizeGeneratedLessonTitle, normalizeGeneratedText } = require('../src/utils/generatedContent');
const { correctAnswerIndex, randomizeMultipleChoiceQuestions } = require('../src/utils/quizOptions');

const headingInput = `1. ### Lesson Summary

Text.

2. ### Detailed Lecture Notes

Text.

3. ### Concept Explanations`;
const headingExpected = `### Lesson Summary

Text.

### Detailed Lecture Notes

Text.

### Concept Explanations`;
assert.equal(normalizeGeneratedText(headingInput, { markdown: true }), headingExpected);
for (const title of [
  '### Lesson Summary',
  '###Lesson Summary',
  '\\### Lesson Summary',
  '1. ### Lesson Summary',
  '1) ### Lesson Summary',
  '**### Lesson Summary**',
]) assert.equal(normalizeGeneratedLessonTitle(title), 'Lesson Summary');
assert.equal(normalizeGeneratedText(String.raw`Use \text{if } x > 0.`, { markdown: true }), String.raw`Use \text{if } x > 0.`);

function mockQuiz(size = 8) {
  return Array.from({ length: size }, (_, index) => ({
    type: 'MULTIPLE_CHOICE',
    prompt: `Question ${index + 1}`,
    choices: [`correct-${index}`, `distractor-b-${index}`, `distractor-c-${index}`, `distractor-d-${index}`],
    correctAnswer: `correct-${index}`,
    explanation: `Explanation ${index + 1}`,
  }));
}

const quizLetters = [];
const optionTrace = [];
for (let quizNumber = 0; quizNumber < 3; quizNumber += 1) {
  const original = mockQuiz();
  const randomized = randomizeMultipleChoiceQuestions(original);
  const letters = [];
  randomized.forEach((question, index) => {
    assert.equal(question.choices.length, 4);
    assert.equal(new Set(question.choices).size, 4);
    assert.deepEqual(new Set(question.choices), new Set(original[index].choices));
    assert.equal(question.choices.filter(choice => choice === question.correctAnswer).length, 1);
    const correctIndex = correctAnswerIndex(question);
    assert.ok(correctIndex >= 0 && correctIndex < 4);
    assert.equal(question.choices[correctIndex], original[index].correctAnswer);
    assert.equal(question.choices[correctIndex].trim().toLowerCase(), question.correctAnswer.trim().toLowerCase());
    const wrongAnswer = question.choices.find(choice => choice !== question.correctAnswer);
    assert.notEqual(wrongAnswer.trim().toLowerCase(), question.correctAnswer.trim().toLowerCase());
    letters.push(String.fromCharCode(65 + correctIndex));
    if (quizNumber === 0 && index < 5) optionTrace.push({
      question: index + 1,
      originalOrder: original[index].choices,
      originalCorrect: original[index].correctAnswer,
      finalOrder: question.choices,
      finalCorrect: question.correctAnswer,
      finalCorrectIndex: correctIndex,
    });
  });
  assert.ok(new Set(letters).size > 1, 'Quiz-level sanity check must reject an all-same correct-answer position.');
  quizLetters.push(letters.join(' '));
}

const forcedPathological = randomizeMultipleChoiceQuestions(mockQuiz(5), () => 0);
assert.ok(new Set(forcedPathological.map(correctAnswerIndex)).size > 1, 'Fallback must break a pathological uniform result.');

console.log('Heading normalization:');
console.log(headingExpected);
console.log('First five option traces:');
optionTrace.forEach(item => console.log(JSON.stringify(item)));
quizLetters.forEach((letters, index) => console.log(`Quiz ${index + 1}: ${letters}`));
console.log(`Verified ${quizLetters.length * 8} randomized MCQs and correct-answer grading pairs.`);