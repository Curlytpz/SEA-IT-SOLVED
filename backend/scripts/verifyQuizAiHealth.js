const {
  GEMINI_API_KEY,
  GEMINI_QUIZ_MODEL,
  GEMINI_QUIZ_TIMEOUT_MS,
} = require('../src/config/env');

function safeStatus(error) {
  return error?.status || error?.statusCode || error?.response?.status || 'UNKNOWN';
}

async function main() {
  console.log(`[QuizAI] Model: ${GEMINI_QUIZ_MODEL}`);
  console.log(`[QuizAI] API key configured: ${GEMINI_API_KEY ? 'YES' : 'NO'}`);
  if (!GEMINI_API_KEY) {
    console.log('QUIZ AI HEALTH: FAIL');
    process.exitCode = 1;
    return;
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_QUIZ_TIMEOUT_MS);
  console.log('[QuizAI] Request started');
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const response = await client.models.generateContent({
      model: GEMINI_QUIZ_MODEL,
      contents: 'Reply with exactly OK.',
      config: { abortSignal: controller.signal, maxOutputTokens: 32 },
    });
    const passed = String(response.text || '').trim().toUpperCase().includes('OK');
    console.log('[QuizAI] Provider status: 200');
    console.log('[QuizAI] Error category: NONE');
    console.log(`[QuizAI] Duration ms: ${Date.now() - startedAt}`);
    console.log(`QUIZ AI HEALTH: ${passed ? 'PASS' : 'FAIL'}`);
    if (!passed) process.exitCode = 1;
  } catch (error) {
    const timedOut = error?.name === 'AbortError' || /timeout|timed out/i.test(String(error?.message || ''));
    console.log(`[QuizAI] Provider status: ${safeStatus(error)}`);
    console.log(`[QuizAI] Error category: ${timedOut ? 'PROVIDER_TIMEOUT' : 'PROVIDER_ERROR'}`);
    console.log(`[QuizAI] Duration ms: ${Date.now() - startedAt}`);
    console.log('QUIZ AI HEALTH: FAIL');
    process.exitCode = 1;
  } finally {
    clearTimeout(timer);
  }
}

main();
