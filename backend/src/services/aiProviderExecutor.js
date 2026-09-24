const NON_RETRYABLE_CODES = new Set([
  'AUTHENTICATION_ERROR', 'PROVIDER_AUTH_FAILED', 'PERMISSION_ERROR', 'MODEL_NOT_FOUND',
  'MODEL_LOAD_ERROR', 'INVALID_INPUT', 'UNSUPPORTED_AUDIO', 'PROVIDER_REQUEST_INVALID',
  'INVALID_PROVIDER_OUTPUT', 'PROVIDER_BLOCKED', 'NO_RECOGNIZABLE_CONTENT',
  'NO_RECOGNIZABLE_SPEECH', 'IMAGE_NOT_FOUND', 'AUDIO_NOT_FOUND', 'OWNERSHIP_MISMATCH',
]);
const RETRYABLE_CODES = new Set([
  'PROVIDER_RATE_LIMITED', 'RATE_LIMITED', 'PROVIDER_TIMEOUT', 'PROVIDER_UNAVAILABLE',
  'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND', 'ABORT_ERR',
]);

function errorChain(error) {
  const chain = [];
  let current = error;
  for (let depth = 0; current && depth < 6; depth += 1) {
    chain.push(current);
    current = current.cause;
  }
  return chain;
}

function providerStatus(error) {
  for (const current of errorChain(error)) {
    const status = Number(current.status || current.statusCode || current.response?.status || 0);
    if (status >= 100 && status <= 599) return status;
  }
  return 0;
}

function headerValue(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) || headers.get(name.toLowerCase()) || '';
  return headers[name] || headers[name.toLowerCase()] || '';
}

function retryAfterMilliseconds(error, now = Date.now()) {
  for (const current of errorChain(error)) {
    const raw = headerValue(current.response?.headers || current.headers, 'Retry-After');
    if (raw === '' || raw == null) continue;
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
    const date = Date.parse(String(raw));
    if (Number.isFinite(date)) return Math.max(0, date - now);
  }
  return null;
}

function classifyProviderError(error) {
  const status = providerStatus(error);
  const codes = errorChain(error).map(item => String(item.code || '').toUpperCase()).filter(Boolean);
  const message = errorChain(error).map(item => String(item.message || '')).join(' ');
  if (status === 429 || codes.some(code => ['PROVIDER_RATE_LIMITED', 'RATE_LIMITED'].includes(code))) {
    return { retryable: true, category: 'RATE_LIMITED', status };
  }
  if ([400, 401, 403, 404, 413, 415, 422].includes(status) || codes.some(code => NON_RETRYABLE_CODES.has(code))) {
    return { retryable: false, category: codes[0] || `HTTP_${status}`, status };
  }
  if (status === 408 || status >= 500 || codes.some(code => RETRYABLE_CODES.has(code)) || /timeout|timed out|network|fetch failed|socket hang up|connection reset/i.test(message)) {
    return { retryable: true, category: codes[0] || (status ? `HTTP_${status}` : 'TRANSIENT'), status };
  }
  return { retryable: error?.retryable === true, category: codes[0] || 'UNKNOWN', status };
}

function safeText(value) {
  return String(value || '')
    .replace(/AIza[A-Za-z0-9_-]{20,}/g, '[REDACTED_API_KEY]')
    .replace(/([?&](?:key|api_key)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s,}]+/gi, '$1[REDACTED]')
    .slice(0, 500);
}

function createAIProviderExecutor({
  maxConcurrent = 2,
  maxRetries = 2,
  baseDelayMs = 1000,
  maxDelayMs = 120000,
  reserveRequest = async () => 0,
  acquireSlot = async () => async () => {},
  onRateLimit = async () => {},
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  random = Math.random,
  logger = console,
} = {}) {
  const pending = [];
  let active = 0;

  function drain() {
    while (active < maxConcurrent && pending.length) {
      const item = pending.shift();
      active += 1;
      Promise.resolve()
        .then(item.task)
        .then(item.resolve, item.reject)
        .finally(() => {
          active -= 1;
          drain();
        });
    }
  }

  function schedule(task) {
    return new Promise((resolve, reject) => {
      pending.push({ task, resolve, reject });
      drain();
    });
  }

  async function runAttempt(operation, context, attempt, totalAttempts) {
    const reservedDelay = await reserveRequest();
    if (reservedDelay > 0) await sleep(reservedDelay);
    const release = await acquireSlot(maxConcurrent);
    const startedAt = Date.now();
    logger.info('[AIProvider] Request started', {
      provider: context.provider,
      model: context.model,
      operationType: context.operationType,
      jobId: context.jobId,
      attempt,
      totalAttempts,
    });
    try {
      const result = await operation({ attempt, maxAttempts: totalAttempts });
      logger.info('[AIProvider] Request finished', {
        provider: context.provider,
        model: context.model,
        operationType: context.operationType,
        jobId: context.jobId,
        attempt,
        status: 200,
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      try { error.providerDurationMs = Date.now() - startedAt; } catch (_) {}
      throw error;
    } finally {
      await release();
    }
  }

  async function run(operation, context = {}) {
    const retries = Number.isInteger(context.maxRetries) ? context.maxRetries : maxRetries;
    const totalAttempts = retries + 1;
    const safeContext = {
      provider: String(context.provider || 'GEMINI'),
      model: String(context.model || ''),
      operationType: String(context.operationType || 'AI_REQUEST'),
      jobId: context.jobId ? String(context.jobId) : null,
    };
    let lastError;
    for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
      try {
        return await schedule(() => runAttempt(operation, safeContext, attempt, totalAttempts));
      } catch (error) {
        lastError = error;
        const classification = classifyProviderError(error);
        const retryScheduled = classification.retryable && attempt < totalAttempts;
        let retryInMs = null;
        if (retryScheduled) {
          const providerDelay = retryAfterMilliseconds(error);
          const exponential = Math.min(maxDelayMs, baseDelayMs * (2 ** (attempt - 1)));
          const jitter = Math.floor(exponential * 0.25 * random());
          retryInMs = Math.max(providerDelay || 0, exponential + jitter);
        }
        logger.warn('[AIProvider] Request failed', {
          provider: safeContext.provider,
          model: safeContext.model,
          operationType: safeContext.operationType,
          jobId: safeContext.jobId,
          attempt,
          totalAttempts,
          status: classification.status || null,
          category: classification.category,
          name: error?.name || null,
          code: error?.code || null,
          message: safeText(error?.message),
          durationMs: error?.providerDurationMs ?? null,
          retryScheduled,
          retryInMs,
        });
        if (classification.category === 'RATE_LIMITED') {
          await Promise.resolve(onRateLimit(retryInMs || retryAfterMilliseconds(error) || baseDelayMs)).catch(() => {});
        }
        if (!retryScheduled) {
          try {
            error.providerRetriesExhausted = classification.retryable;
            error.providerAttemptCount = attempt;
          } catch (_) {}
          throw error;
        }
        await sleep(retryInMs);
      }
    }
    throw lastError;
  }

  return {
    run,
    stats: () => ({ active, queued: pending.length, maxConcurrent }),
  };
}

module.exports = {
  createAIProviderExecutor,
  classifyProviderError,
  providerStatus,
  retryAfterMilliseconds,
};
