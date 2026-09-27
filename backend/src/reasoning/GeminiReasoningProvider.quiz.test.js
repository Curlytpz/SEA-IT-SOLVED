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
  assert.equal(request.config.maxOutputTokens, 4096);
  assert.deepEqual(request.config.thinkingConfig, { thinkingBudget: 512 });
});

test('hanging quiz request is actually aborted by the provider timeout', async () => {
  const provider = new GeminiReasoningProvider({ apiKey: 'test-key', model: 'test-model', timeoutMs: 20 });
  let suppliedSignal;
  provider.client = { models: { generateContent: input => {
    suppliedSignal = input.config.abortSignal;
    return new Promise((_resolve, reject) => {
      suppliedSignal.addEventListener('abort', () => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    });
  } } };
  const startedAt = Date.now();
  await assert.rejects(
    provider.generateQuiz([], { questionCount: 5, difficulty: 'MEDIUM' }),
    error => error.code === 'PROVIDER_TIMEOUT' && error.retryable === true,
  );
  assert.equal(suppliedSignal.aborted, true);
  assert.ok(Date.now() - startedAt < 500, 'provider timeout must bound the hanging request');
});
