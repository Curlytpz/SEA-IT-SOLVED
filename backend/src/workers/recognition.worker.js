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
const { RecognitionProviderError, mapProviderError } = require('../recognition/ProviderErrorMapper');
const { reconcileRecognitionBlocks, plainTextFromBlocks } = require('../recognition/RecognitionReconciler');
const {
  GEMINI_API_KEY,
  GEMINI_MODEL,
  GEMINI_MEDIA_RESOLUTION,
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
  model: GEMINI_MODEL,
  mediaResolution: GEMINI_MEDIA_RESOLUTION,
  timeoutMs: RECOGNITION_PROVIDER_TIMEOUT_MS,
});
const lessonProvider = new GeminiLessonCompilationProvider({
  apiKey: GEMINI_API_KEY, model: GEMINI_MODEL, mediaResolution: GEMINI_MEDIA_RESOLUTION,
  timeoutMs: RECOGNITION_PROVIDER_TIMEOUT_MS,
});
const materialProvider = new GeminiLessonMaterialProvider({
  apiKey: GEMINI_API_KEY, model: GEMINI_MODEL, mediaResolution: GEMINI_MEDIA_RESOLUTION,
  timeoutMs: RECOGNITION_PROVIDER_TIMEOUT_MS,
});
let stopping = false;

function mimeFromKey(key) {
  const extension = String(key).split('.').pop().toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  const error = new RecognitionProviderError('UNSUPPORTED_INPUT', 'The capture image format is unsupported.', false);
  throw error;
}

async function readProtectedImage(key) {
  const opened = await captureStorage.open(key);
  const maxBytes = RECOGNITION_MAX_IMAGE_MB * 1024 * 1024;
  if (opened.size > maxBytes) throw new RecognitionProviderError('UNSUPPORTED_INPUT', 'The capture image is too large.', false);
  const chunks = [];
  let total = 0;
  for await (const chunk of opened.stream) {
    total += chunk.length;
    if (total > maxBytes) {
      opened.stream.destroy();
      throw new RecognitionProviderError('UNSUPPORTED_INPUT', 'The capture image is too large.', false);
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
  try {
    const source = await recognitionService.getAttemptSource(attempt.id);
    const storageKey = source.corrected_storage_key;
    if (!storageKey) throw new RecognitionProviderError('IMAGE_NOT_FOUND', 'A polygon-masked corrected capture is required for recognition.', false);
    const imageBuffer = await readProtectedImage(storageKey);
    const sha256 = crypto.createHash('sha256').update(imageBuffer).digest('hex');
    const gateDelay = await providerGate.reserveRequest(GEMINI_SHARED_MIN_REQUEST_INTERVAL_MS);
    if (gateDelay > 0) await wait(gateDelay);
    const result = await provider.extract({ imageBuffer, mimeType: mimeFromKey(storageKey) });
    result.sanitizedOutput = retainedProviderOutput(result.sanitizedOutput);
    const sourceVariant = 'CORRECTED';
    const sourceWidth = source.corrected_width;
    const sourceHeight = source.corrected_height;
    await recognitionService.completeAttempt(attempt, result, { ...source, sourceVariant, sourceWidth, sourceHeight, sha256 });
    console.log(`[Recognition] Completed capture ${source.capture_id}, attempt ${attempt.attempt_number}.`);
    return { rateLimited: false };
  } catch (error) {
    const mapped = error?.code === 'OWNERSHIP_MISMATCH'
      ? new RecognitionProviderError('OWNERSHIP_MISMATCH', 'Capture ownership validation failed.', false, error)
      : mapProviderError(error);
    if (mapped.code === 'PROVIDER_RATE_LIMITED') await providerGate.extendCooldown(GEMINI_SHARED_RATE_LIMIT_BACKOFF_MS).catch(() => {});
    console.error(`[Recognition] Attempt ${attempt.id} failed (${mapped.code}): ${mapped.message}`);
    await recognitionService.failAttempt(attempt, mapped);
    return { rateLimited: mapped.code === 'PROVIDER_RATE_LIMITED' };
  }
}
async function processLessonAttempt(attempt) {
  let source;
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
    const result = await lessonProvider.compile({ images, captures: pageSources });
    result.normalized = mergeLessonPlanePages(result.normalized, pageSources, source.captures);
    result.sanitizedOutput = retainedProviderOutput(result.sanitizedOutput);
    const captureSetSha256 = crypto.createHash('sha256').update(captureHashes.join('|')).digest('hex');
    await lessonRecognitionService.completeAttempt(attempt, result, { ...source, captureSetSha256 });
    console.log(`[Recognition] Compiled lesson ${source.lesson_id}, attempt ${attempt.attempt_number}.`);
  } catch (error) {
    const mapped = error?.code === 'OWNERSHIP_MISMATCH'
      ? new RecognitionProviderError('OWNERSHIP_MISMATCH', 'Lesson ownership validation failed.', false, error)
      : mapProviderError(error);
    if (mapped.code === 'PROVIDER_RATE_LIMITED') await providerGate.extendCooldown(GEMINI_SHARED_RATE_LIMIT_BACKOFF_MS).catch(() => {});
    console.error(`[Recognition] Lesson attempt ${attempt.id} failed (${mapped.code}): ${mapped.message}`);
    await lessonRecognitionService.failAttempt(attempt, mapped);
  } finally {
    if (source) await lessonContextService.tryBuildDraft(source.lesson_id, source.instructor_id).catch(error => console.error('[Context] Draft build failed:', error.message));
  }
}
async function processMaterialAttempt(attempt) {
  let source;
  try {
    source = await lessonMaterialService.getAttemptSource(attempt.id);
    const buffer = await lessonMaterialService.readBuffer(source);
    const gateDelay = await providerGate.reserveRequest(GEMINI_SHARED_MIN_REQUEST_INTERVAL_MS);
    if (gateDelay > 0) await wait(gateDelay);
    const result = source.material_type === 'PDF'
      ? await materialProvider.extractPdf(buffer, source.raw_extraction?.nativePages || [])
      : await materialProvider.extractImage(buffer, source.mime_type);
    await lessonMaterialService.completeAttempt(attempt, result);
    console.log(`[Recognition] Processed lesson material ${source.material_id}, attempt ${attempt.attempt_number}.`);
  } catch (error) {
    const mapped = error?.code === 'OWNERSHIP_MISMATCH'
      ? new RecognitionProviderError('OWNERSHIP_MISMATCH', 'Material ownership validation failed.', false, error)
      : mapProviderError(error);
    if (mapped.code === 'PROVIDER_RATE_LIMITED') await providerGate.extendCooldown(GEMINI_SHARED_RATE_LIMIT_BACKOFF_MS).catch(() => {});
    console.error(`[Recognition] Material attempt ${attempt.id} failed (${mapped.code}): ${mapped.message}`);
    await lessonMaterialService.failAttempt(attempt, mapped);
  } finally {
    if (source) await lessonContextService.tryBuildDraft(source.lesson_id, source.instructor_id).catch(error => console.error('[Context] Draft build failed:', error.message));
  }
}

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function run() {
  if (!GEMINI_API_KEY) throw new Error('Missing required environment variable: GEMINI_API_KEY.');
  console.log(`[Recognition] Worker ${workerId} started with ${GEMINI_MODEL} (${GEMINI_MEDIA_RESOLUTION}).`);
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

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`[Recognition] ${signal} received; stopping after the current operation.`);
  await pool.end();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

run().then(() => shutdown('complete')).catch(async error => {
  console.error(`[Recognition] Worker stopped: ${error.message}`);
  await pool.end().catch(() => {});
  process.exitCode = 1;
});


