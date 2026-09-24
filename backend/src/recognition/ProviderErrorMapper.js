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

function providerHttpStatus(error) {
  let current = error;
  const messages = [];
  for (let depth = 0; current && depth < 6; depth += 1) {
    const status = Number(current.status || current.statusCode || current.response?.status || 0);
    if (status >= 100 && status <= 599) return status;
    if (current.message) messages.push(String(current.message));
    current = current.cause;
  }
  const message = messages.join(' ');
  const match = message.match(/(?:http(?:\s+status)?|status(?:\s+code)?|["']?code["']?)\s*[:=]?\s*([45]\d\d)\b/i);
  return match ? Number(match[1]) : 0;
}

function errorMessages(error) {
  const messages = [];
  let current = error;
  for (let depth = 0; current && depth < 6; depth += 1) {
    if (current.message) messages.push(String(current.message));
    current = current.cause;
  }
  return messages.join(' ');
}

function mapProviderError(error) {
  if (error instanceof RecognitionProviderError) return error;
  if (error?.code === 'NO_RECOGNIZABLE_CONTENT') {
    return new RecognitionProviderError('NO_RECOGNIZABLE_CONTENT', 'No recognizable whiteboard content was found.', false, error);
  }
  if (error instanceof ZodError || error instanceof SyntaxError || error?.code === 'INVALID_PROVIDER_OUTPUT') {
    return new RecognitionProviderError('INVALID_PROVIDER_OUTPUT', 'The recognition service returned an invalid response.', false, error);
  }
  const status = providerHttpStatus(error);
  const message = errorMessages(error);
  const code = String(error?.code || '').toUpperCase();

  if (error?.name === 'AbortError' || code === 'ABORT_ERR' || /timeout|timed out|operation was aborted/i.test(message)) {
    return new RecognitionProviderError('PROVIDER_TIMEOUT', 'The recognition service timed out.', true, error);
  }
  if (code === 'MODEL_LOAD_ERROR' || (code === 'ENOENT' && /model|onnx|weights/i.test(message))) {
    return new RecognitionProviderError('MODEL_LOAD_ERROR', 'The recognition model could not be loaded.', false, error);
  }
  if (code === 'ENOENT') {
    return new RecognitionProviderError('IMAGE_NOT_FOUND', 'The capture image is unavailable.', false, error);
  }
  if (status === 401 || /invalid api key|api key.*invalid|unauthenticated|invalid credential/i.test(message)) {
    return new RecognitionProviderError('AUTHENTICATION_ERROR', 'The recognition service credentials are invalid.', false, error);
  }
  if (status === 403 || /permission denied|forbidden|insufficient permission/i.test(message)) {
    return new RecognitionProviderError('PERMISSION_ERROR', 'The recognition service is not permitted to use this resource.', false, error);
  }
  if (status === 404) {
    return new RecognitionProviderError('MODEL_NOT_FOUND', 'The configured recognition model is unavailable.', false, error);
  }
  if (status === 429 || /rate.?limit|resource exhausted|too many requests/i.test(message)) {
    return new RecognitionProviderError('PROVIDER_RATE_LIMITED', 'The recognition service is temporarily busy.', true, error);
  }
  if (status >= 500 || /network|fetch failed|connection|econn|enotfound|eai_again|socket hang up/i.test(message)) {
    return new RecognitionProviderError('PROVIDER_UNAVAILABLE', 'The recognition service is temporarily unavailable.', true, error);
  }
  if (/safety|blocked|prohibited/i.test(message)) {
    return new RecognitionProviderError('PROVIDER_BLOCKED', 'The recognition provider could not process this image.', false, error);
  }
  if ([413, 415, 422].includes(status) || /invalid image|unsupported (?:image|mime|media)|corrupt image/i.test(message)) {
    return new RecognitionProviderError('INVALID_INPUT', 'The capture image could not be processed.', false, error);
  }
  if (status === 400) {
    return new RecognitionProviderError('PROVIDER_REQUEST_INVALID', 'The recognition service could not accept the processing request.', false, error);
  }
  return new RecognitionProviderError('RECOGNITION_FAILED', 'The whiteboard could not be processed.', false, error);
}

module.exports = { RecognitionProviderError, mapProviderError, providerHttpStatus };
