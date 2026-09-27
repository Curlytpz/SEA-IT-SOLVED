const assert = require('node:assert/strict');
const test = require('node:test');
const GeminiReasoningProvider = require('./GeminiReasoningProvider');

test('quiz prompt explicitly separates prose currency from delimited LaTeX', async () => {
  let request;
  const provider = new GeminiReasoningProvider({ apiKey: 'test-key', model: 'test-model', timeoutMs: 1000 });
  provider.client = { models: { generateContent: async input => {
    request = input;
    return { text: JSON.stringify({ title: 'Quiz', instructions: 'Answer.', questions: [] }) };
  } } };
  await provider.generateQuiz([], { questionCount: 1, difficulty: 'EASY' });
  const instruction = request.contents[0].parts[0].text;
  assert.match(instruction, /normal prose as plain text/i);
  assert.match(instruction, /\$0\.49 is money, not a math delimiter/i);
  assert.ok(instruction.includes(String.raw`$x \to 1$`));
  assert.match(instruction, /unsupported control sequence/i);
  assert.equal(request.config.responseMimeType, 'application/json');
  assert.equal(request.config.responseJsonSchema.properties.questions.items.properties.prompt.type, 'string');
});
