const AppError = require('../utils/AppError');
const providerGate = require('./providerRequestGate');
const {
  GEMINI_SHARED_MIN_REQUEST_INTERVAL_MS,
  GEMINI_SHARED_RATE_LIMIT_BACKOFF_MS,
  GEMINI_INTERACTIVE_MAX_ATTEMPTS,
} = require('../config/env');

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function providerStatus(error) {
  let current = error;
  for (let depth = 0; current && depth < 4; depth += 1) {
    const status = Number(current.status || current.statusCode || current.response?.status || 0);
    if (status) return status;
    current = current.cause;
  }
  return 'UNKNOWN';
}

async function run(operation, messages = {}, diagnostics = {}) {
  const friendly = typeof messages === 'string' ? { unavailable: messages } : messages;
  const label = String(diagnostics.label || 'Gemini').replace(/[^A-Za-z0-9_-]/g, '') || 'Gemini';
  const model = diagnostics.model ? String(diagnostics.model) : '';
  const statusLabel = label === 'QuizAI' ? 'Provider status' : 'Provider HTTP/status';
  let lastError;
  for (let attempt = 1; attempt <= GEMINI_INTERACTIVE_MAX_ATTEMPTS; attempt += 1) {
    const delay = await providerGate.reserveRequest(GEMINI_SHARED_MIN_REQUEST_INTERVAL_MS);
    if (delay > 0) await wait(delay);
    const startedAt = Date.now();
    if (model) console.info(`[${label}] Model: ${model}`);
    console.info(`[${label}] Request started`);
    console.info(`[${label}] Attempt: ${attempt}/${GEMINI_INTERACTIVE_MAX_ATTEMPTS}`);
    try {
      const result = await operation({ attempt, maxAttempts: GEMINI_INTERACTIVE_MAX_ATTEMPTS });
      console.info(`[${label}] ${statusLabel}: 200`);
      console.info(`[${label}] Error category: NONE`);
      console.info(`[${label}] Duration ms: ${Date.now() - startedAt}`);
      console.info(`[${label}] Retry scheduled: NO`);
      return result;
    }
    catch (error) {
      lastError = error;
      const retryScheduled = Boolean(error.retryable && attempt < GEMINI_INTERACTIVE_MAX_ATTEMPTS);
      console.warn(`[${label}] ${statusLabel}: ${providerStatus(error)}`);
      console.warn(`[${label}] Error category: ${error.code || 'UNKNOWN'}`);
      console.warn(`[${label}] Duration ms: ${Date.now() - startedAt}`);
      console.warn(`[${label}] Retry scheduled: ${retryScheduled ? 'YES' : 'NO'}`);
      if (error.code === 'PROVIDER_RATE_LIMITED') await providerGate.extendCooldown(GEMINI_SHARED_RATE_LIMIT_BACKOFF_MS).catch(() => {});
      if (!error.retryable || attempt === GEMINI_INTERACTIVE_MAX_ATTEMPTS) break;
    }
  }
  if (lastError?.code === 'PROVIDER_RATE_LIMITED') throw new AppError(friendly.rateLimited || 'The AI service is temporarily rate-limited. Please try again shortly.', 429);
  if (lastError?.code === 'INVALID_PROVIDER_OUTPUT') throw new AppError(friendly.invalidOutput || friendly.unavailable || 'AI is temporarily unavailable. Please try again.', 422);
  throw new AppError(friendly.unavailable || 'AI is temporarily unavailable. Please try again.', 503);
}

module.exports = { run };
