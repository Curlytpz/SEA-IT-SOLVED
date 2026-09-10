const { randomInt } = require('crypto');

function shuffle(items, pickIndex = randomInt) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = pickIndex(index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function correctAnswerIndex(question) {
  return question.choices.findIndex(choice => choice === question.correctAnswer);
}

function randomizeQuestionOptions(question, pickIndex = randomInt) {
  if (question.type !== 'MULTIPLE_CHOICE') return { ...question };
  const tagged = question.choices.map(choice => ({ choice, correct: choice === question.correctAnswer }));
  if (tagged.filter(option => option.correct).length !== 1) {
    throw new Error('A multiple-choice question must have exactly one matching correct answer before randomization.');
  }
  const randomized = shuffle(tagged, pickIndex);
  return {
    ...question,
    choices: randomized.map(option => option.choice),
    correctAnswer: randomized.find(option => option.correct).choice,
  };
}

function hasUniformCorrectPositions(questions) {
  const positions = questions
    .filter(question => question.type === 'MULTIPLE_CHOICE')
    .map(correctAnswerIndex);
  return positions.length >= 4 && positions.every(position => position === positions[0]);
}

function randomizeMultipleChoiceQuestions(questions, pickIndex = randomInt) {
  let randomized = questions.map(question => randomizeQuestionOptions(question, pickIndex));
  for (let attempt = 0; attempt < 8 && hasUniformCorrectPositions(randomized); attempt += 1) {
    randomized = randomized.map(question => randomizeQuestionOptions(question, pickIndex));
  }
  if (!hasUniformCorrectPositions(randomized)) return randomized;

  const mcqIndexes = randomized
    .map((question, index) => question.type === 'MULTIPLE_CHOICE' ? index : -1)
    .filter(index => index >= 0);
  const questionIndex = mcqIndexes[pickIndex(mcqIndexes.length)];
  const question = randomized[questionIndex];
  const currentIndex = correctAnswerIndex(question);
  const targetIndex = (currentIndex + 1 + pickIndex(question.choices.length - 1)) % question.choices.length;
  const choices = [...question.choices];
  [choices[currentIndex], choices[targetIndex]] = [choices[targetIndex], choices[currentIndex]];
  randomized[questionIndex] = { ...question, choices };
  return randomized;
}

module.exports = {
  correctAnswerIndex,
  randomizeMultipleChoiceQuestions,
  randomizeQuestionOptions,
};