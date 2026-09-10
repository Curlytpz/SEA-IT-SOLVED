const {
  GEMINI_API_KEY,
  GEMINI_CHAT_MODEL,
  GEMINI_INTERACTIVE_TIMEOUT_MS,
} = require('../src/config/env');

function safeStatus(error) {
  return error?.status || error?.statusCode || error?.response?.status || 'UNKNOWN';
}

async function main() {
  console.log(`[Gemini] Model: ${GEMINI_CHAT_MODEL}`);
  console.log(`[Gemini] API key configured: ${GEMINI_API_KEY ? 'YES' : 'NO'}`);
  if (!GEMINI_API_KEY) {
    console.log('GEMINI HEALTH: FAIL');
    process.exitCode = 1;
    return;
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_INTERACTIVE_TIMEOUT_MS);
  console.log('[Gemini] Request started');
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const response = await client.models.generateContent({
      model: GEMINI_CHAT_MODEL,
      contents: 'Reply with exactly OK.',
      config: {
        abortSignal: controller.signal,
        maxOutputTokens: 256,
      },
    });
    const passed = Boolean(String(response.text || '').trim());
    console.log('[Gemini] Provider HTTP/status: 200');
    console.log(`[Gemini] Duration ms: ${Date.now() - startedAt}`);
    console.log(`GEMINI HEALTH: ${passed ? 'PASS' : 'FAIL'}`);
    if (!passed) process.exitCode = 1;
  } catch (error) {
    const timedOut = error?.name === 'AbortError' || /timeout|timed out/i.test(String(error?.message || ''));
    console.log(`[Gemini] Provider HTTP/status: ${safeStatus(error)}`);
    console.log(`[Gemini] Error category: ${timedOut ? 'PROVIDER_TIMEOUT' : 'PROVIDER_ERROR'}`);
    console.log(`[Gemini] Duration ms: ${Date.now() - startedAt}`);
    console.log('GEMINI HEALTH: FAIL');
    process.exitCode = 1;
  } finally {
    clearTimeout(timer);
  }
}

main();
