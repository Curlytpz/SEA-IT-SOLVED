const { ZodError } = require('zod');

const UNAVAILABLE_MESSAGE = 'Audio transcription is unavailable. The recording could not be processed. Retry transcription or continue reviewing the available lesson sources.';
function publicTranscriptionError(code) {
  if (code === 'NO_RECOGNIZABLE_SPEECH') return 'No recognizable speech was found in this recording. You can retry or continue reviewing the available lesson sources.';
  return UNAVAILABLE_MESSAGE;
}

class TranscriptionProviderError extends Error {
  constructor(code, message, retryable, cause) {
    super(message);
    this.name = 'TranscriptionProviderError';
    this.code = code;
    this.retryable = retryable;
    this.cause = cause;
  }
}

function providerDetails(error) {
  const messages = [];
  let current = error;
  for (let depth = 0; current && depth < 6; depth += 1) {
    const status = Number(current.status || current.statusCode || current.response?.status || 0);
    if (current.message) messages.push(String(current.message));
    if (status >= 100 && status <= 599) return { status, message: messages.join(' ') };
    current = current.cause;
  }
  const message = messages.join(' ');
  const match = message.match(/(?:http(?:\s+status)?|status(?:\s+code)?|["']?code["']?)\s*[:=]?\s*([45]\d\d)\b/i);
  return { status: match ? Number(match[1]) : 0, message };
}

function mapTranscriptionError(error) {
  if (error instanceof TranscriptionProviderError) return error;
  if (error?.code === 'NO_RECOGNIZABLE_SPEECH') return new TranscriptionProviderError('NO_RECOGNIZABLE_SPEECH', 'No recognizable speech was found in this recording.', false, error);
  if (error instanceof ZodError || error instanceof SyntaxError || error?.code === 'INVALID_PROVIDER_OUTPUT') return new TranscriptionProviderError('INVALID_PROVIDER_OUTPUT', 'The transcription service returned an invalid response.', false, error);
  const details = providerDetails(error);
  const code = String(error?.code || '').toUpperCase();
  if (error?.name === 'AbortError' || code === 'ABORT_ERR' || /timeout|timed out|operation was aborted/i.test(details.message)) return new TranscriptionProviderError('PROVIDER_TIMEOUT', 'The transcription service timed out.', true, error);
  if (error?.code === 'UNSUPPORTED_AUDIO') return new TranscriptionProviderError('UNSUPPORTED_AUDIO', 'The lesson recording format could not be transcribed.', false, error);
  if (error?.code === 'FFMPEG_NOT_FOUND') return new TranscriptionProviderError('AUDIO_CONVERSION_UNAVAILABLE', 'Audio conversion is not configured on the server.', false, error);
  if (error?.code === 'AUDIO_CONVERSION_FAILED') return new TranscriptionProviderError('AUDIO_CONVERSION_FAILED', 'The lesson recording could not be prepared for transcription.', false, error);
  if (error?.code === 'ENOENT') return new TranscriptionProviderError('AUDIO_NOT_FOUND', 'The lesson recording is unavailable.', false, error);
  const { status, message } = details;
  if (status === 401 || /invalid api key|api key.*invalid|unauthenticated|invalid credential/i.test(message)) return new TranscriptionProviderError('AUTHENTICATION_ERROR', 'The transcription service credentials are invalid.', false, error);
  if (status === 403 || /permission denied|forbidden|insufficient permission/i.test(message)) return new TranscriptionProviderError('PERMISSION_ERROR', 'The transcription service is not permitted to use this resource.', false, error);
  if (status === 404) return new TranscriptionProviderError('MODEL_NOT_FOUND', 'The configured transcription model is unavailable.', false, error);
  if (status === 429 || /rate.?limit|resource exhausted|too many requests/i.test(message)) return new TranscriptionProviderError('PROVIDER_RATE_LIMITED', 'The transcription service is temporarily busy.', true, error);
  if (status >= 500 || /network|fetch failed|connection|econn|enotfound|eai_again|socket hang up/i.test(message)) return new TranscriptionProviderError('PROVIDER_UNAVAILABLE', 'The transcription service is temporarily unavailable.', true, error);
  if (/safety|blocked|prohibited/i.test(message)) return new TranscriptionProviderError('PROVIDER_BLOCKED', 'The transcription provider could not process this recording.', false, error);
  if ([400, 413, 415, 422].includes(status)) return new TranscriptionProviderError('UNSUPPORTED_AUDIO', 'The lesson recording format could not be transcribed.', false, error);
  return new TranscriptionProviderError('TRANSCRIPTION_FAILED', 'The lesson recording could not be transcribed.', false, error);
}

module.exports = { TranscriptionProviderError, mapTranscriptionError, publicTranscriptionError };
