const { ZodError } = require('zod');

class RecognitionProviderError extends Error {
  constructor(code, message, retryable, cause) {
    super(message);
    this.name = 'RecognitionProviderError';
    this.code = code;
    this.retryable = retryable;
    this.cause = cause;
  }
}

function mapProviderError(error) {
  if (error instanceof RecognitionProviderError) return error;
  if (error?.code === 'NO_RECOGNIZABLE_CONTENT') {
    return new RecognitionProviderError('NO_RECOGNIZABLE_CONTENT', 'No recognizable whiteboard content was found.', false, error);
  }
  if (error instanceof ZodError || error instanceof SyntaxError || error?.code === 'INVALID_PROVIDER_OUTPUT') {
    return new RecognitionProviderError('INVALID_PROVIDER_OUTPUT', 'The recognition service returned an invalid response.', true, error);
  }
  if (error?.name === 'AbortError' || /timeout|timed out/i.test(error?.message || '')) {
    return new RecognitionProviderError('PROVIDER_TIMEOUT', 'The recognition service timed out.', true, error);
  }
  if (error?.code === 'ENOENT') {
    return new RecognitionProviderError('IMAGE_NOT_FOUND', 'The capture image is unavailable.', false, error);
  }

  const status = Number(error?.status || error?.statusCode || error?.response?.status || 0);
  const message = String(error?.message || '');
  if (status === 401 || status === 403 || /api key|credential|permission denied/i.test(message)) {
    return new RecognitionProviderError('PROVIDER_AUTH_FAILED', 'The recognition service is not configured correctly.', false, error);
  }
  if (status === 429) {
    return new RecognitionProviderError('PROVIDER_RATE_LIMITED', 'The recognition service is temporarily busy.', true, error);
  }
  if (status >= 500 || /network|fetch failed|connection|econn/i.test(message)) {
    return new RecognitionProviderError('PROVIDER_UNAVAILABLE', 'The recognition service is temporarily unavailable.', true, error);
  }
  if (/safety|blocked|prohibited/i.test(message)) {
    return new RecognitionProviderError('PROVIDER_BLOCKED', 'The recognition provider could not process this image.', false, error);
  }
  if (status === 415) {
    return new RecognitionProviderError('UNSUPPORTED_INPUT', 'The capture image could not be processed.', false, error);
  }
  if (status === 400) {
    return new RecognitionProviderError('PROVIDER_REQUEST_INVALID', 'The recognition service could not accept the processing request.', false, error);
  }
  return new RecognitionProviderError('RECOGNITION_FAILED', 'The whiteboard could not be processed.', false, error);
}

module.exports = { RecognitionProviderError, mapProviderError };
