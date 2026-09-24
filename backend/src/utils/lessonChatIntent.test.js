const assert = require('node:assert/strict');
const {
  explicitQuizGeneration, quizIntent, quizEditIntent, generateNotesIntent, editIntent, questionCount, quizDifficulty,
  extractQuizParameters, emptyQuizDraft, prepareQuizDraft, quizClarificationMessage, wholeLessonEditIntent,
} = require('./lessonChatIntent');
const { requestedQuizChange, quizEditPlan } = require('../../../shared/quizEditTargeting.cjs');

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
const mixedCreationPrompt = 'Generate Quiz 4 multiple choice and 1 problem solving';
assert.equal(explicitQuizGeneration(mixedCreationPrompt), true);
assert.equal(quizEditIntent(mixedCreationPrompt), false);
assert.equal(quizEditIntent(mixedCreationPrompt, 'GENERATE_QUIZ'), false);
assert.equal(quizIntent(mixedCreationPrompt), true);
assert.equal(questionCount(mixedCreationPrompt), 5);
assert.deepEqual(extractQuizParameters(mixedCreationPrompt), { questionCount:5, difficulty:null, questionType:'MIXED' });
assert.deepEqual(prepareQuizDraft(mixedCreationPrompt).missingParameters, ['difficulty']);
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
assert.equal(requestedQuizChange('on question 5 add tip and formula'), 'enable_tip_and_formula');
assert.equal(requestedQuizChange('on question 5 add formula'), 'enable_formula');
assert.equal(requestedQuizChange('turn off the tip and formula on question 5'), 'disable_tip_and_formula');
assert.deepEqual(quizEditPlan('on question 5 add tip and formula', { questionCount:5 }), {
  quizNumber:1,
  targetQuestionNumbers:[5],
  requestedQuestionCount:null,
  requestedChange:'enable_tip_and_formula',
  changeInstruction:'enable_tip_and_formula',
  usesRecentTargets:false,
  operation:'update_question',
});

console.log('lesson chat intent routing: PASS');
