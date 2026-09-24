require('../config/env');
const os = require('os');
const { audioStorage } = require('../storage');
const pool = require('../db/pool');
const transcriptionService = require('../services/transcription.service');
const lessonContextService = require('../services/lesson-context.service');
const aiProvider = require('../services/aiProvider.service');
const GeminiSpeechTranscriptionProvider = require('../transcription/GeminiSpeechTranscriptionProvider');
const { TranscriptionProviderError, mapTranscriptionError } = require('../transcription/transcriptionErrorMapper');
const { materializeStorageFile, sha256File, cleanupTemporaryDirectory } = require('../utils/storageTempFile');
const { prepareAudioForGemini } = require('../utils/audioTranscode');
const {
  GEMINI_API_KEY,
  GEMINI_TRANSCRIPTION_MODEL,
  TRANSCRIPTION_POLL_INTERVAL_MS,
  TRANSCRIPTION_PROVIDER_TIMEOUT_MS,
  TRANSCRIPTION_JOB_TIMEOUT_MS,
  TRANSCRIPTION_RAW_OUTPUT_MAX_BYTES,
  TRANSCRIPTION_MAX_AUDIO_MINUTES,
  TRANSCRIPTION_WORKER_ID,
  TRANSCRIPTION_TEMP_PATH,
  FFMPEG_PATH,
  GEMINI_FILE_POLL_INTERVAL_MS,
  GEMINI_FILE_READY_TIMEOUT_MS,
} = require('../config/env');

const workerId = TRANSCRIPTION_WORKER_ID || `${os.hostname()}-${process.pid}`;
const provider = new GeminiSpeechTranscriptionProvider({
  apiKey: GEMINI_API_KEY,
  model: GEMINI_TRANSCRIPTION_MODEL,
  timeoutMs: TRANSCRIPTION_PROVIDER_TIMEOUT_MS,
  filePollIntervalMs: GEMINI_FILE_POLL_INTERVAL_MS,
  fileReadyTimeoutMs: GEMINI_FILE_READY_TIMEOUT_MS,
});
let stopping = false;

function extensionForMime(mime) {
  if (String(mime).includes('ogg')) return 'ogg';
  if (String(mime).includes('wav')) return 'wav';
  return 'webm';
}

function retainedProviderOutput(value) {
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, 'utf8') <= TRANSCRIPTION_RAW_OUTPUT_MAX_BYTES) return value;
  return { omitted: true, reason: 'Structured provider output exceeded the retention limit.' };
}

let pendingWait = null;
let poolClosed = false;

function wait(ms) {
  if (stopping) return Promise.resolve();
  return new Promise(resolve => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (pendingWait === finish) pendingWait = null;
      resolve();
    };
    const timer = setTimeout(finish, ms);
    pendingWait = finish;
  });
}

async function closePool() {
  if (poolClosed) return;
  poolClosed = true;
  await pool.end();
}

async function processAttempt(attempt) {
  let temporaryDirectory = '';
  let source;
  try {
    source = await transcriptionService.getAttemptSource(attempt.id);
    if (Number(source.duration_ms) > TRANSCRIPTION_MAX_AUDIO_MINUTES * 60 * 1000) {
      throw new TranscriptionProviderError('UNSUPPORTED_AUDIO', `The lesson recording exceeds the ${TRANSCRIPTION_MAX_AUDIO_MINUTES}-minute transcription limit.`, false);
    }
    const temporary = await materializeStorageFile(
      audioStorage, source.storage_key, extensionForMime(source.mime_type), TRANSCRIPTION_TEMP_PATH
    );
    temporaryDirectory = temporary.directory;
    if (Number(temporary.size) !== Number(source.file_size)) {
      throw new TranscriptionProviderError('AUDIO_NOT_FOUND', 'The protected recording file is incomplete.', false);
    }
    const sha256 = await sha256File(temporary.sourcePath);
    const prepared = await prepareAudioForGemini({
      sourcePath: temporary.sourcePath,
      sourceMime: source.mime_type,
      ffmpegPath: FFMPEG_PATH,
    });
    const result = await aiProvider.run(
      () => provider.transcribe({
        audioPath: prepared.audioPath,
        mimeType: prepared.mimeType,
        durationMs: Number(source.duration_ms),
      }),
      { provider: 'GEMINI', model: GEMINI_TRANSCRIPTION_MODEL, operationType: 'TRANSCRIPTION', jobId: attempt.id }
    );
    result.sanitizedOutput = retainedProviderOutput(result.sanitizedOutput);
    await transcriptionService.completeAttempt(attempt, result, { ...source, sha256 });
    console.log(`[Transcription] Completed lesson ${source.lesson_id}, attempt ${attempt.attempt_number}.`);
  } catch (error) {
    const mapped = error?.code === 'OWNERSHIP_MISMATCH'
      ? new TranscriptionProviderError('OWNERSHIP_MISMATCH', 'Recording ownership validation failed.', false, error)
      : mapTranscriptionError(error);
    if (error?.providerRetriesExhausted) mapped.retryable = false;
    console.error(`[Transcription] Attempt ${attempt.id} failed (${mapped.code}): ${mapped.message}`);
    await transcriptionService.failAttempt(attempt, mapped);
  } finally {
    await cleanupTemporaryDirectory(temporaryDirectory);
    if (source) await lessonContextService.tryBuildDraft(source.lesson_id, source.instructor_id).catch(error => console.error('[Context] Draft build failed:', error.message));
  }
}

async function run() {
  if (!GEMINI_API_KEY) throw new Error('Missing required environment variable: GEMINI_API_KEY.');
  console.log(`[Transcription] Worker ${workerId} started with ${GEMINI_TRANSCRIPTION_MODEL}.`);
  await transcriptionService.recoverStaleAttempts(TRANSCRIPTION_JOB_TIMEOUT_MS);
  while (!stopping) {
    const attempt = await transcriptionService.claimNextAttempt(workerId);
    if (attempt) await processAttempt(attempt);
    else await wait(TRANSCRIPTION_POLL_INTERVAL_MS);
  }
}

function requestShutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`[Transcription] ${signal} received; stopping after the current operation.`);
  pendingWait?.();
}

process.once('SIGINT', () => requestShutdown('SIGINT'));
process.once('SIGTERM', () => requestShutdown('SIGTERM'));

run()
  .then(async () => {
    await closePool();
    console.log('[Transcription] Worker stopped cleanly.');
  })
  .catch(async error => {
    console.error(`[Transcription] Worker stopped: ${error.message}`);
    await closePool().catch(() => {});
    process.exitCode = 1;
  });
