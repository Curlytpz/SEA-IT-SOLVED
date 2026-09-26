const AppError = require('../utils/AppError');
const aiProvider = require('./aiProvider.service');

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
    });
  } catch (error) {
    lastError = error;
  }
  if (['AI_QUEUE_FULL', 'AI_USER_QUEUE_FULL', 'AI_QUEUE_TIMEOUT'].includes(lastError?.code)) {
    throw new AppError('AI processing is currently busy. Please try again shortly.', lastError.statusCode || 503, { code: lastError.code });
  }
  if (lastError?.code === 'PROVIDER_RATE_LIMITED') throw new AppError(friendly.rateLimited || 'The AI service is temporarily rate-limited. Please try again shortly.', 429);
  if (lastError?.code === 'INVALID_PROVIDER_OUTPUT') throw new AppError(friendly.invalidOutput || friendly.unavailable || 'AI is temporarily unavailable. Please try again.', 422);
  throw new AppError(friendly.unavailable || 'AI is temporarily unavailable. Please try again.', 503);
}

module.exports = { run };
