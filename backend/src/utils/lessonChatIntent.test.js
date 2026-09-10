const assert = require('node:assert/strict');
const { quizIntent, quizEditIntent, generateNotesIntent, editIntent, questionCount, quizDifficulty } = require('./lessonChatIntent');

assert.equal(generateNotesIntent('Generate notes.'), true);
assert.equal(quizIntent('Generate 5 easy quiz questions.'), true);
assert.equal(questionCount('Generate 5 easy quiz questions.'), 5);
assert.equal(quizDifficulty('Generate 5 easy quiz questions.'), 'EASY');
assert.equal(questionCount('Generate 10 medium questions about limits.'), 10);
assert.equal(quizDifficulty('Generate 10 medium questions about limits.'), 'MEDIUM');
assert.equal(questionCount('Make a hard quiz with 8 questions.'), 8);
assert.equal(quizDifficulty('Make a hard quiz with 8 questions.'), 'HARD');
assert.equal(editIntent('Add another example to Worked Example.'), 'EDIT');
assert.equal(quizEditIntent('Make quiz 1 question 2 harder.'), true);
assert.equal(quizEditIntent('Add another question.'), true);
assert.equal(quizEditIntent('Remove question 5.'), true);

console.log('lesson chat intent routing: PASS');
