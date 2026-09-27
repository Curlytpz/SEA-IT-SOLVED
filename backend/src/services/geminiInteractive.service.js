const AppError = require('../utils/AppError');
const aiProvider = require('./aiProvider.service');

function mapInteractiveFailure(lastError, friendly = {}) {
  if (['AI_QUEUE_FULL', 'AI_USER_QUEUE_FULL', 'AI_QUEUE_TIMEOUT'].includes(lastError?.code)) {
    return new AppError('AI processing is currently busy. Please try again shortly.', lastError.statusCode || 503, { code: lastError.code });
  }
  if (lastError?.code === 'PROVIDER_RATE_LIMITED') return new AppError(friendly.rateLimited || 'The AI service is temporarily rate-limited. Please try again shortly.', 429, { code: 'PROVIDER_RATE_LIMITED' });
  if (lastError?.code === 'PROVIDER_TIMEOUT') return new AppError(friendly.timeout || 'The AI request timed out. Please try again.', 504, { code: friendly.timeoutCode || 'PROVIDER_TIMEOUT' });
  if (lastError?.code === 'INVALID_PROVIDER_OUTPUT') return new AppError(friendly.invalidOutput || friendly.unavailable || 'AI is temporarily unavailable. Please try again.', 422, { code: friendly.invalidOutputCode || 'INVALID_PROVIDER_OUTPUT' });
  return new AppError(friendly.unavailable || 'AI is temporarily unavailable. Please try again.', 503, { code: friendly.unavailableCode || lastError?.code || 'PROVIDER_UNAVAILABLE' });
}

async function run(operation, messages = {}, diagnostics = {}) {
  const friendly = typeof messages === 'string' ? { unavailable: messages } : messages;
  const label = String(diagnostics.label || 'Gemini').replace(/[^A-Za-z0-9_-]/g, '') || 'Gemini';
  const model = diagnostics.model ? String(diagnostics.model) : '';
  let lastError;
  try {
    return await aiProvider.run(operation, {
      provider: 'GEMINI',
      model,
      operationType: diagnostics.operationType || label,
      jobId: diagnostics.jobId || null,
      userId: diagnostics.userId || null,
      maxRetries: Number.isInteger(diagnostics.maxRetries) ? diagnostics.maxRetries : undefined,
    });
  } catch (error) {
    lastError = error;
  }
  throw mapInteractiveFailure(lastError, friendly);
}

module.exports = { run, mapInteractiveFailure };
