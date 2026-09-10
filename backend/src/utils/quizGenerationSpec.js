const AppError = require('./AppError');

const TYPES = {
  MULTIPLE_CHOICE: 'multiple[-\\s]+choice|mcqs?',
  TRUE_FALSE: 'true\\s*(?:/|or|-)\\s*false',
  PROBLEM_SOLVING: 'problem[-\\s]+solving|solution[-\\s]+required',
};

// Parse only new-quiz specifications. Existing-question targeting is intentionally untouched.
function quizGenerationSpec(prompt = '', count) {
  const types = Array(count).fill(null), counts = {};
  let remaining = String(prompt || ''), specified = false;
  const assign = (position, type) => {
    if (!Number.isInteger(position) || position < 1 || position > count) throw new AppError('A requested question position is outside the new quiz.', 422);
    if (types[position-1] && types[position-1] !== type) throw new AppError('Conflicting types were requested for question ' + position + '.', 422);
    types[position-1] = type; specified = true;
  };
  for (const [type, expression] of Object.entries(TYPES)) {
    const positions = new RegExp('\\bquestions?\\s+((?:\\d+)(?:(?:\\s*,\\s*(?:and\\s+)?|\\s+(?:and|&)\\s+)\\d+)*)\\s+(?:(?:should|must)\\s+be\\s+|(?:are|as|to)\\s+)?(?:' + expression + ')\\b', 'gi');
    remaining = remaining.replace(positions, (_match, numbers) => {
      numbers.match(/\d+/g).map(Number).forEach(position => assign(position,type));
      return '';
    });
  }
  for (const [type, expression] of Object.entries(TYPES)) {
    const quantity = new RegExp('\\b(\\d+)\\s+(?:' + expression + ')\\b', 'gi');
    for (const match of remaining.matchAll(quantity)) {
      const amount = Number(match[1]);
      if (amount > count || (counts[type] != null && counts[type] !== amount)) throw new AppError('The requested question-type counts conflict with the quiz size.', 422);
      counts[type] = amount; specified = true;
    }
    if (new RegExp('\\ball\\s+(?:questions?\\s+(?:(?:should|must)\\s+be\\s+)?)?(?:' + expression + ')\\b', 'i').test(remaining)) {
      for (let position=1;position<=count;position++) assign(position,type);
    }
  }
  if (Object.values(counts).reduce((sum,value)=>sum+value,0) > count) throw new AppError('Requested question-type counts exceed the quiz size.', 422);
  for (const [type, amount] of Object.entries(counts)) {
    const assigned = types.filter(value=>value===type).length;
    if (assigned > amount) throw new AppError('Explicit positions exceed the requested count for ' + type + '.', 422);
    for (let left=amount-assigned;left>0;left--) {
      const slot=types.indexOf(null);
      if(slot<0)throw new AppError('Question counts and positions cannot fit in this quiz.',422);
      types[slot]=type;
    }
  }
  // Respect exact counts, even if MCQ itself has a specified count.
  const filler = ['MULTIPLE_CHOICE','TRUE_FALSE'].find(type=>counts[type]==null);
  if(types.includes(null) && !filler)throw new AppError('Specify the type of the remaining questions.',422);
  const questionTypes = specified ? types.map(type=>type||filler) : null;
  let allowTip=false,allowFormula=false;
  for(const clause of String(prompt).matchAll(/\b(enable|disable|include|provide|with|without)\b([^.!?\n]*)/gi)){
    const enabled=!/^(disable|without)$/i.test(clause[1]);
    if(/\b(?:tips?|hints?)\b/i.test(clause[2]))allowTip=enabled;
    if(/\b(?:formulas?|references?)\b/i.test(clause[2]))allowFormula=enabled;
  }
  return { questionTypes, allowTip, allowFormula };
}
module.exports = { quizGenerationSpec };
