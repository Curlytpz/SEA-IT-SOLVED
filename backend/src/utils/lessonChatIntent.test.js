const assert = require('node:assert/strict');
const {
  explicitQuizGeneration, quizIntent, quizEditIntent, generateNotesIntent, editIntent, questionCount, quizDifficulty,
  extractQuizParameters, emptyQuizDraft, prepareQuizDraft, quizClarificationMessage, wholeLessonEditIntent,
} = require('./lessonChatIntent');

assert.equal(generateNotesIntent('Generate notes.'), true);
assert.equal(generateNotesIntent('Regenerate the lesson.'), true);
assert.equal(editIntent('Make page 4 simpler.'), 'EDIT');
assert.equal(editIntent('Make the explanation about limits on page 4 simpler.'), 'EDIT');
assert.equal(wholeLessonEditIntent('Edit the lesson material and change all of it; make it simple.'), true);
assert.equal(wholeLessonEditIntent('Make all of the existing lesson notes simpler.'), true);
assert.equal(wholeLessonEditIntent('Make the worked example simpler.'), false);
assert.equal(quizIntent('Generate 5 easy quiz questions.'), true);
assert.equal(questionCount('Generate 5 easy quiz questions.'), 5);
assert.equal(quizDifficulty('Generate 5 easy quiz questions.'), 'EASY');
assert.equal(questionCount('Generate 10 medium questions about limits.'), 10);
assert.equal(quizDifficulty('Generate 10 medium questions about limits.'), 'MEDIUM');
assert.equal(questionCount('Make a hard quiz with 8 questions.'), 8);
assert.equal(quizDifficulty('Make a hard quiz with 8 questions.'), 'HARD');
assert.deepEqual(extractQuizParameters('generate a new quiz but just make it a 1 problem solving'), { questionCount:1, difficulty:null, questionType:'PROBLEM_SOLVING' });
assert.deepEqual(extractQuizParameters('one problem-solving question'), { questionCount:1, difficulty:null, questionType:'PROBLEM_SOLVING' });
assert.deepEqual(extractQuizParameters('make a hard multiple choice quiz'), { questionCount:null, difficulty:'HARD', questionType:'MULTIPLE_CHOICE' });
assert.deepEqual(extractQuizParameters('make 10 hard multiple choice questions'), { questionCount:10, difficulty:'HARD', questionType:'MULTIPLE_CHOICE' });
assert.deepEqual(extractQuizParameters('make a medium 15-item multiple choice quiz'), { questionCount:15, difficulty:'MEDIUM', questionType:'MULTIPLE_CHOICE' });
assert.deepEqual(extractQuizParameters('give me 3 hard problem solving problems'), { questionCount:3, difficulty:'HARD', questionType:'PROBLEM_SOLVING' });
assert.equal(explicitQuizGeneration('make a hard multiple choice quiz'), true);
assert.equal(explicitQuizGeneration('make 10 hard multiple choice questions'), true);
assert.equal(explicitQuizGeneration('make a medium 15-item multiple choice quiz'), true);
assert.equal(explicitQuizGeneration('make quiz 2 harder'), false);
assert.deepEqual(prepareQuizDraft('5 easy questions').missingParameters, ['questionType']);
assert.deepEqual(prepareQuizDraft('create 20 questions').missingParameters, ['difficulty','questionType']);
assert.equal(quizIntent('give me 3 hard problem solving problems'), true);

const difficultyOnly = prepareQuizDraft('generate a new quiz but just make it a 1 problem solving');
assert.deepEqual(difficultyOnly.missingParameters, ['difficulty']);
assert.equal(quizClarificationMessage(difficultyOnly.missingParameters), 'What difficulty would you like?');
const countOnly = prepareQuizDraft('make a hard multiple choice quiz');
assert.deepEqual(countOnly.missingParameters, ['questionCount']);
assert.match(quizClarificationMessage(countOnly.missingParameters), /How many questions/);
const complete = prepareQuizDraft('make 10 hard multiple choice questions');
assert.deepEqual(complete.missingParameters, []);
const allMissing = prepareQuizDraft('make a quiz');
assert.deepEqual(allMissing.missingParameters, ['questionCount','difficulty','questionType']);
const continued = prepareQuizDraft('10', countOnly.draft);
assert.deepEqual(continued.draft, { questionCount:10, difficulty:'HARD', questionType:'MULTIPLE_CHOICE' });
assert.deepEqual(continued.missingParameters, []);
const invalid = prepareQuizDraft('make 30 hard multiple choice questions');
assert.equal(invalid.invalidQuestionCount, 30);
assert.deepEqual(invalid.missingParameters, ['questionCount']);
assert.match(quizClarificationMessage(invalid.missingParameters, invalid.invalidQuestionCount), /supports 1–20/);
assert.deepEqual(emptyQuizDraft(), { questionCount:null, difficulty:null, questionType:null });
assert.equal(editIntent('Add another example to Worked Example.'), 'EDIT');
assert.equal(quizEditIntent('Make quiz 1 question 2 harder.'), true);
assert.equal(quizEditIntent('Add another question.'), true);
assert.equal(quizEditIntent('Remove question 5.'), true);

console.log('lesson chat intent routing: PASS');
