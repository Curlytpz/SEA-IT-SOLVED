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

function mapTranscriptionError(error) {
  if (error instanceof TranscriptionProviderError) return error;
  if (error?.code === 'NO_RECOGNIZABLE_SPEECH') return new TranscriptionProviderError('NO_RECOGNIZABLE_SPEECH', 'No recognizable speech was found in this recording.', false, error);
  if (error instanceof ZodError || error instanceof SyntaxError || error?.code === 'INVALID_PROVIDER_OUTPUT') return new TranscriptionProviderError('INVALID_PROVIDER_OUTPUT', 'The transcription service returned an invalid response.', true, error);
  if (error?.name === 'AbortError' || /timeout|timed out/i.test(error?.message || '')) return new TranscriptionProviderError('PROVIDER_TIMEOUT', 'The transcription service timed out.', true, error);
  if (error?.code === 'UNSUPPORTED_AUDIO') return new TranscriptionProviderError('UNSUPPORTED_AUDIO', 'The lesson recording format could not be transcribed.', false, error);
  if (error?.code === 'FFMPEG_NOT_FOUND') return new TranscriptionProviderError('AUDIO_CONVERSION_UNAVAILABLE', 'Audio conversion is not configured on the server.', false, error);
  if (error?.code === 'AUDIO_CONVERSION_FAILED') return new TranscriptionProviderError('AUDIO_CONVERSION_FAILED', 'The lesson recording could not be prepared for transcription.', false, error);
  if (error?.code === 'ENOENT') return new TranscriptionProviderError('AUDIO_NOT_FOUND', 'The lesson recording is unavailable.', false, error);
  const status = Number(error?.status || error?.statusCode || error?.response?.status || 0);
  const message = String(error?.message || '');
  if (status === 401 || status === 403 || /api key|credential|permission denied/i.test(message)) return new TranscriptionProviderError('PROVIDER_AUTH_FAILED', 'The transcription service is not configured correctly.', false, error);
  if (status === 429) return new TranscriptionProviderError('PROVIDER_RATE_LIMITED', 'The transcription service is temporarily busy.', true, error);
  if (status >= 500 || /network|fetch failed|connection|econn/i.test(message)) return new TranscriptionProviderError('PROVIDER_UNAVAILABLE', 'The transcription service is temporarily unavailable.', true, error);
  if (/safety|blocked|prohibited/i.test(message)) return new TranscriptionProviderError('PROVIDER_BLOCKED', 'The transcription provider could not process this recording.', false, error);
  if (status === 400 || status === 415) return new TranscriptionProviderError('UNSUPPORTED_AUDIO', 'The lesson recording format could not be transcribed.', false, error);
  return new TranscriptionProviderError('TRANSCRIPTION_FAILED', 'The lesson recording could not be transcribed.', false, error);
}

module.exports = { TranscriptionProviderError, mapTranscriptionError, publicTranscriptionError };
