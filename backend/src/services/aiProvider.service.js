const providerGate = require('./providerRequestGate');
const { createAIProviderExecutor } = require('./aiProviderExecutor');
const {
  AI_MAX_CONCURRENT_REQUESTS,
  AI_MAX_PENDING_REQUESTS,
  AI_MAX_PENDING_PER_USER,
  AI_QUEUE_TIMEOUT_MS,
  AI_MAX_RETRIES,
  AI_RETRY_BASE_DELAY_MS,
  GEMINI_SHARED_MIN_REQUEST_INTERVAL_MS,
  GEMINI_SHARED_RATE_LIMIT_BACKOFF_MS,
} = require('../config/env');

const executor = createAIProviderExecutor({
  maxConcurrent: AI_MAX_CONCURRENT_REQUESTS,
  maxPending: AI_MAX_PENDING_REQUESTS,
  maxPendingPerUser: AI_MAX_PENDING_PER_USER,
  queueTimeoutMs: AI_QUEUE_TIMEOUT_MS,
  maxRetries: AI_MAX_RETRIES,
  baseDelayMs: AI_RETRY_BASE_DELAY_MS,
  reserveRequest: () => providerGate.reserveRequest(GEMINI_SHARED_MIN_REQUEST_INTERVAL_MS),
  acquireSlot: providerGate.acquireSlot,
  onRateLimit: delay => providerGate.extendCooldown(Math.max(GEMINI_SHARED_RATE_LIMIT_BACKOFF_MS, delay)),
});

module.exports = executor;
