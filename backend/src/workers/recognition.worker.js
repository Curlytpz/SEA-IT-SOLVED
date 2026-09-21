require('../config/env');
const crypto = require('crypto');
const os = require('os');
const pool = require('../db/pool');
const { captureStorage } = require('../storage');
const recognitionService = require('../services/recognition.service');
const lessonRecognitionService = require('../services/lesson-recognition.service');
const lessonMaterialService = require('../services/lesson-material.service');
const lessonContextService = require('../services/lesson-context.service');
const providerGate = require('../services/providerRequestGate');
const GeminiWhiteboardProvider = require('../recognition/providers/GeminiWhiteboardProvider');
const GeminiLessonCompilationProvider = require('../recognition/providers/GeminiLessonCompilationProvider');
const GeminiLessonMaterialProvider = require('../recognition/providers/GeminiLessonMaterialProvider');
const { RecognitionProviderError, mapProviderError, providerHttpStatus } = require('../recognition/ProviderErrorMapper');
const { reconcileRecognitionBlocks, plainTextFromBlocks } = require('../recognition/RecognitionReconciler');
const {
  GEMINI_API_KEY,
  GEMINI_RECOGNITION_MODEL,
  GEMINI_MEDIA_RESOLUTION,
  RECOGNITION_PROVIDER,
  RECOGNITION_POLL_INTERVAL_MS,
  RECOGNITION_PROVIDER_TIMEOUT_MS,
  RECOGNITION_MIN_REQUEST_INTERVAL_MS,
  RECOGNITION_RATE_LIMIT_BACKOFF_MS,
  RECOGNITION_JOB_TIMEOUT_MS,
  RECOGNITION_RAW_OUTPUT_MAX_BYTES,
  RECOGNITION_MAX_IMAGE_MB,
  RECOGNITION_WORKER_ID,
  GEMINI_SHARED_MIN_REQUEST_INTERVAL_MS,
  GEMINI_SHARED_RATE_LIMIT_BACKOFF_MS,
} = require('../config/env');

const workerId = RECOGNITION_WORKER_ID || `${os.hostname()}-${process.pid}`;
const provider = new GeminiWhiteboardProvider({
  apiKey: GEMINI_API_KEY,
  model: GEMINI_RECOGNITION_MODEL,
  mediaResolution: GEMINI_MEDIA_RESOLUTION,
  timeoutMs: RECOGNITION_PROVIDER_TIMEOUT_MS,
});
const lessonProvider = new GeminiLessonCompilationProvider({
  apiKey: GEMINI_API_KEY, model: GEMINI_RECOGNITION_MODEL, mediaResolution: GEMINI_MEDIA_RESOLUTION,
  timeoutMs: RECOGNITION_PROVIDER_TIMEOUT_MS,
});
const materialProvider = new GeminiLessonMaterialProvider({
  apiKey: GEMINI_API_KEY, model: GEMINI_RECOGNITION_MODEL, mediaResolution: GEMINI_MEDIA_RESOLUTION,
  timeoutMs: RECOGNITION_PROVIDER_TIMEOUT_MS,
});
let stopping = false;

function mimeFromKey(key) {
  const extension = String(key).split('.').pop().toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  const error = new RecognitionProviderError('INVALID_INPUT', 'The capture image format is unsupported.', false);
  throw error;
}

async function readProtectedImage(key) {
  const opened = await captureStorage.open(key);
  const maxBytes = RECOGNITION_MAX_IMAGE_MB * 1024 * 1024;
  if (opened.size > maxBytes) throw new RecognitionProviderError('INVALID_INPUT', 'The capture image is too large.', false);
  const chunks = [];
  let total = 0;
  for await (const chunk of opened.stream) {
    total += chunk.length;
    if (total > maxBytes) {
      opened.stream.destroy();
      throw new RecognitionProviderError('INVALID_INPUT', 'The capture image is too large.', false);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function retainedProviderOutput(value) {
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, 'utf8') <= RECOGNITION_RAW_OUTPUT_MAX_BYTES) return value;
  return { omitted: true, reason: 'Structured provider output exceeded the retention limit.' };
}

function safeLogText(value) {
  return String(value || '')
    .replace(/AIza[A-Za-z0-9_-]{20,}/g, '[REDACTED_API_KEY]')
    .replace(/([?&](?:key|api_key)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s,}]+/gi, '$1[REDACTED]');
}

function safeCause(cause) {
  if (!cause) return null;
  if (typeof cause === 'string') return safeLogText(cause);
  return {
    name: cause.name || null,
    code: cause.code || null,
    status: providerHttpStatus(cause) || null,
    message: safeLogText(cause.message || cause),
  };
}

function attemptContext(kind, attempt, source) {
  return {
    kind,
    attemptId: attempt?.id || null,
    attemptNumber: attempt?.attempt_number || null,
    captureId: source?.capture_id || null,
    lessonId: source?.lesson_id || null,
    materialId: source?.material_id || null,
    provider: RECOGNITION_PROVIDER,
    model: GEMINI_RECOGNITION_MODEL,
  };
}

function logRequestStarted(kind, attempt, source) {
  console.info('[Recognition] Request started', {
    ...attemptContext(kind, attempt, source),
    requestStatus: 'STARTED',
  });
}

function logRequestSucceeded(kind, attempt, source, startedAt) {
  console.info('[Recognition] Request finished', {
    ...attemptContext(kind, attempt, source),
    requestStatus: 'SUCCEEDED',
    httpStatus: 200,
    durationMs: Date.now() - startedAt,
  });
}

function logRawProviderFailure(kind, attempt, source, error, mapped, startedAt, requestStarted) {
  const raw = error?.cause || error;
  console.error('[Recognition] Raw provider failure', {
    ...attemptContext(kind, attempt, source),
    requestStarted,
    requestStatus: 'FAILED',
    httpStatus: providerHttpStatus(error) || null,
    name: raw?.name || error?.name || null,
    code: raw?.code || error?.code || null,
    message: safeLogText(raw?.message || error?.message),
    status: providerHttpStatus(raw) || null,
    cause: safeCause(raw?.cause),
    mappedCode: mapped.code,
    retryable: mapped.retryable,
    durationMs: Date.now() - startedAt,
  });
}

function isRateLimited(error) {
  return ['RATE_LIMITED', 'PROVIDER_RATE_LIMITED'].includes(error?.code);
}

function planeBounds(plane) {
  const points = Object.values(plane?.corners || {}).filter(point => Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y)));
  if (!points.length) return null;
  const left = Math.max(0, Math.min(...points.map(point => Number(point.x))));
  const right = Math.min(1, Math.max(...points.map(point => Number(point.x))));
  const top = Math.max(0, Math.min(...points.map(point => Number(point.y))));
  const bottom = Math.min(1, Math.max(...points.map(point => Number(point.y))));
  return right > left && bottom > top ? { left, top, width: right - left, height: bottom - top } : null;
}

function projectedBounds(bounds, plane) {
  if (!bounds) return null;
  const x = Number(bounds.x), y = Number(bounds.y), width = Number(bounds.width), height = Number(bounds.height);
  if (![x, y, width, height].every(Number.isFinite)) return null;
  const parent = planeBounds(plane);
  if (!parent) return { x, y, width, height };
  return {
    x: parent.left + x * parent.width,
    y: parent.top + y * parent.height,
    width: width * parent.width,
    height: height * parent.height,
  };
}

function mergeLessonPlanePages(normalized, sources, captures) {
  let sourceIndex = 0;
  const pages = captures.map((capture, captureIndex) => {
    const count = capture.planes?.length || 1;
    const entries = normalized.pages.slice(sourceIndex, sourceIndex + count);
    const metadata = sources.slice(sourceIndex, sourceIndex + count);
    sourceIndex += count;
    let order = 1;
    const candidateBlocks = [], warnings = [], textParts = [];
    entries.forEach((entry, index) => {
      const source = metadata[index];
      textParts.push(entry.plainText);
      const nextBlocks = entry.blocks.map(block => ({ ...block, order: order++,
        planeId: source.plane?.calibration_plane_id || null, planeLabel: source.plane?.label || null,
        planeOrder: source.plane?.plane_order || 1,
        reconciliationScope: capture.id,
        reconciliationBounds: projectedBounds(block.bounds, source.plane),
      }));
      candidateBlocks.push(...nextBlocks); warnings.push(...entry.warnings);
    });
    const reconciled = reconcileRecognitionBlocks(candidateBlocks, { scope: capture.id });
    const blocks = reconciled.blocks;
    const planeResults = metadata.map((source, index) => {
      const planeId = source.plane?.calibration_plane_id || null;
      const planeBlocks = blocks.filter(block => (block.planeId || null) === planeId);
      return {
        planeId,
        label: source.plane?.label || 'Board',
        order: source.plane?.plane_order || index + 1,
        recognizedText: plainTextFromBlocks(planeBlocks),
        math: planeBlocks.filter(block => block.type === 'math'),
      };
    });
    if (reconciled.suppressedCount) warnings.push(`${reconciled.suppressedCount} overlapping recognition block${reconciled.suppressedCount === 1 ? '' : 's'} omitted across overlapping planes.`);
    return {
      pageNumber: captureIndex + 1, captureId: capture.id, capturedAt: capture.captured_at,
      plainText: candidateBlocks.length ? plainTextFromBlocks(blocks) : textParts.filter(Boolean).join('\n\n'),
      blocks, warnings: [...new Set(warnings)], planes: planeResults,
    };
  });
  const compiledText = pages.map(page => `Page ${page.pageNumber}
${page.plainText}`).join('\n\n').trim();
  return { pages, compiledText, warnings: normalized.warnings };
}

async function processAttempt(attempt) {
  const startedAt = Date.now();
  let source;
  let requestStarted = false;
  try {
    source = await recognitionService.getAttemptSource(attempt.id);
    const storageKey = source.corrected_storage_key;
    if (!storageKey) throw new RecognitionProviderError('IMAGE_NOT_FOUND', 'A polygon-masked corrected capture is required for recognition.', false);
    const imageBuffer = await readProtectedImage(storageKey);
    const sha256 = crypto.createHash('sha256').update(imageBuffer).digest('hex');
    const gateDelay = await providerGate.reserveRequest(GEMINI_SHARED_MIN_REQUEST_INTERVAL_MS);
    if (gateDelay > 0) await wait(gateDelay);
    requestStarted = true;
    logRequestStarted('CAPTURE', attempt, source);
    const result = await provider.extract({ imageBuffer, mimeType: mimeFromKey(storageKey) });
    result.sanitizedOutput = retainedProviderOutput(result.sanitizedOutput);
    const sourceVariant = 'CORRECTED';
    const sourceWidth = source.corrected_width;
    const sourceHeight = source.corrected_height;
    await recognitionService.completeAttempt(attempt, result, { ...source, sourceVariant, sourceWidth, sourceHeight, sha256 });
    logRequestSucceeded('CAPTURE', attempt, source, startedAt);
    console.log(`[Recognition] Completed capture ${source.capture_id}, attempt ${attempt.attempt_number}.`);
    return { rateLimited: false };
  } catch (error) {
    const mapped = error?.code === 'OWNERSHIP_MISMATCH'
      ? new RecognitionProviderError('OWNERSHIP_MISMATCH', 'Capture ownership validation failed.', false, error)
      : mapProviderError(error);
    logRawProviderFailure('CAPTURE', attempt, source, error, mapped, startedAt, requestStarted);
    if (isRateLimited(mapped)) await providerGate.extendCooldown(GEMINI_SHARED_RATE_LIMIT_BACKOFF_MS).catch(() => {});
    console.error(`[Recognition] Attempt ${attempt.id} failed (${mapped.code}): ${mapped.message}`);
    await recognitionService.failAttempt(attempt, mapped);
    return { rateLimited: isRateLimited(mapped) };
  }
}
async function processLessonAttempt(attempt) {
  const startedAt = Date.now();
  let source;
  let requestStarted = false;
  try {
    source = await lessonRecognitionService.getAttemptSource(attempt.id);
    const images = [], pageSources = [], captureHashes = [];
    for (const capture of source.captures) {
      if (!capture.corrected_storage_key) {
        throw new RecognitionProviderError('IMAGE_NOT_FOUND', 'A polygon-masked corrected capture is required for lesson recognition.', false);
      }
      const regionSources = [{ storageKey: capture.corrected_storage_key, mimeType: null, plane: null }];
      for (const region of regionSources) {
        if (!region.storageKey) throw new RecognitionProviderError('IMAGE_NOT_FOUND', 'A lesson capture image is unavailable.', false);
        const buffer = await readProtectedImage(region.storageKey);
        const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
        captureHashes.push(`${capture.id}:${region.plane?.calibration_plane_id || 'board'}:${sha256}`);
        images.push({ buffer, mimeType: region.mimeType || mimeFromKey(region.storageKey) });
        pageSources.push({ id: region.plane?.id || capture.id, captured_at: capture.captured_at, captureId: capture.id, plane: region.plane });
      }
    }
    const gateDelay = await providerGate.reserveRequest(GEMINI_SHARED_MIN_REQUEST_INTERVAL_MS);
    if (gateDelay > 0) await wait(gateDelay);
    requestStarted = true;
    logRequestStarted('LESSON', attempt, source);
    const result = await lessonProvider.compile({ images, captures: pageSources });
    result.normalized = mergeLessonPlanePages(result.normalized, pageSources, source.captures);
    result.sanitizedOutput = retainedProviderOutput(result.sanitizedOutput);
    const captureSetSha256 = crypto.createHash('sha256').update(captureHashes.join('|')).digest('hex');
    await lessonRecognitionService.completeAttempt(attempt, result, { ...source, captureSetSha256 });
    logRequestSucceeded('LESSON', attempt, source, startedAt);
    console.log(`[Recognition] Compiled lesson ${source.lesson_id}, attempt ${attempt.attempt_number}.`);
  } catch (error) {
    const mapped = error?.code === 'OWNERSHIP_MISMATCH'
      ? new RecognitionProviderError('OWNERSHIP_MISMATCH', 'Lesson ownership validation failed.', false, error)
      : mapProviderError(error);
    logRawProviderFailure('LESSON', attempt, source, error, mapped, startedAt, requestStarted);
    if (isRateLimited(mapped)) await providerGate.extendCooldown(GEMINI_SHARED_RATE_LIMIT_BACKOFF_MS).catch(() => {});
    console.error(`[Recognition] Lesson attempt ${attempt.id} failed (${mapped.code}): ${mapped.message}`);
    await lessonRecognitionService.failAttempt(attempt, mapped);
  } finally {
    if (source) await lessonContextService.tryBuildDraft(source.lesson_id, source.instructor_id).catch(error => console.error('[Context] Draft build failed:', error.message));
  }
}
async function processMaterialAttempt(attempt) {
  const startedAt = Date.now();
  let source;
  let requestStarted = false;
  try {
    source = await lessonMaterialService.getAttemptSource(attempt.id);
    const buffer = await lessonMaterialService.readBuffer(source);
    const gateDelay = await providerGate.reserveRequest(GEMINI_SHARED_MIN_REQUEST_INTERVAL_MS);
    if (gateDelay > 0) await wait(gateDelay);
    requestStarted = true;
    logRequestStarted('MATERIAL', attempt, source);
    const result = source.material_type === 'PDF'
      ? await materialProvider.extractPdf(buffer, source.raw_extraction?.nativePages || [])
      : await materialProvider.extractImage(buffer, source.mime_type);
    await lessonMaterialService.completeAttempt(attempt, result);
    logRequestSucceeded('MATERIAL', attempt, source, startedAt);
    console.log(`[Recognition] Processed lesson material ${source.material_id}, attempt ${attempt.attempt_number}.`);
  } catch (error) {
    const mapped = error?.code === 'OWNERSHIP_MISMATCH'
      ? new RecognitionProviderError('OWNERSHIP_MISMATCH', 'Material ownership validation failed.', false, error)
      : mapProviderError(error);
    logRawProviderFailure('MATERIAL', attempt, source, error, mapped, startedAt, requestStarted);
    if (isRateLimited(mapped)) await providerGate.extendCooldown(GEMINI_SHARED_RATE_LIMIT_BACKOFF_MS).catch(() => {});
    console.error(`[Recognition] Material attempt ${attempt.id} failed (${mapped.code}): ${mapped.message}`);
    await lessonMaterialService.failAttempt(attempt, mapped);
  } finally {
    if (source) await lessonContextService.tryBuildDraft(source.lesson_id, source.instructor_id).catch(error => console.error('[Context] Draft build failed:', error.message));
  }
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

async function run() {
  if (!GEMINI_API_KEY) throw new Error('Missing required environment variable: GEMINI_API_KEY.');
  console.log(`[Recognition] Worker ${workerId} started with ${RECOGNITION_PROVIDER}/${GEMINI_RECOGNITION_MODEL} (${GEMINI_MEDIA_RESOLUTION}).`);
  await Promise.all([
    recognitionService.recoverStaleAttempts(RECOGNITION_JOB_TIMEOUT_MS),
    lessonRecognitionService.recoverStaleAttempts(RECOGNITION_JOB_TIMEOUT_MS),
    lessonMaterialService.recoverStaleAttempts(RECOGNITION_JOB_TIMEOUT_MS),
  ]);
  while (!stopping) {
    const lessonAttempt = await lessonRecognitionService.claimNextAttempt(workerId);
    if (lessonAttempt) {
      await processLessonAttempt(lessonAttempt);
      if (!stopping) await wait(RECOGNITION_MIN_REQUEST_INTERVAL_MS);
      continue;
    }
    const materialAttempt = await lessonMaterialService.claimNextAttempt(workerId);
    if (materialAttempt) {
      await processMaterialAttempt(materialAttempt);
      if (!stopping) await wait(RECOGNITION_MIN_REQUEST_INTERVAL_MS);
      continue;
    }
    const attempt = await recognitionService.claimNextAttempt(workerId);
    if (attempt) {
      const outcome = await processAttempt(attempt);
      const delay = outcome.rateLimited ? RECOGNITION_RATE_LIMIT_BACKOFF_MS : RECOGNITION_MIN_REQUEST_INTERVAL_MS;
      if (!stopping) await wait(delay);
    } else {
      await wait(RECOGNITION_POLL_INTERVAL_MS);
    }
  }
}

function requestShutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`[Recognition] ${signal} received; stopping after the current operation.`);
  pendingWait?.();
}

process.once('SIGINT', () => requestShutdown('SIGINT'));
process.once('SIGTERM', () => requestShutdown('SIGTERM'));

run()
  .then(async () => {
    await closePool();
    console.log('[Recognition] Worker stopped cleanly.');
  })
  .catch(async error => {
    console.error(`[Recognition] Worker stopped: ${error.message}`);
    await closePool().catch(() => {});
    process.exitCode = 1;
  });


