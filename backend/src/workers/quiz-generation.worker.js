require('../config/env');
const os = require('node:os');
const pool = require('../db/pool');
const chatService = require('../services/lesson-chat.service');
const jobService = require('../services/quiz-generation-job.service');
const { runQuizGenerationWithinDeadline } = require('../utils/quizGenerationDeadline');
const { phaseForQuizGenerationStage } = require('../utils/quizGenerationPhase');
const {
  GEMINI_API_KEY,
  GEMINI_QUIZ_MODEL,
  QUIZ_GENERATION_JOB_TIMEOUT_MS,
  QUIZ_GENERATION_POLL_INTERVAL_MS,
  QUIZ_GENERATION_WORKER_ID,
} = require('../config/env');

const workerId = QUIZ_GENERATION_WORKER_ID || `${os.hostname()}-${process.pid}`;
let stopping = false;
let pendingWait = null;
let poolClosed = false;
let lastRecoveryAt = 0;

function wait(ms) {
  return new Promise(resolve => {
    const timer = setTimeout(() => { pendingWait = null; resolve(); }, ms);
    pendingWait = () => { clearTimeout(timer); pendingWait = null; resolve(); };
  });
}

async function closePool() {
  if (poolClosed) return;
  poolClosed = true;
  await pool.end();
}

async function processJob(job) {
  let phaseUpdates = Promise.resolve();
  try {
    await runQuizGenerationWithinDeadline(signal => chatService.processQueuedQuiz(job, {
      signal,
      onStage: (stage, details = {}) => {
        const phase = phaseForQuizGenerationStage(stage);
        if (phase) phaseUpdates = phaseUpdates.then(() => jobService.updatePhase(job.id, workerId, phase));
        if (Number.isFinite(details.durationMs)) {
          console.log('[QuizGeneration] Stage timing', {
            jobId: job.id,
            stage,
            durationMs: details.durationMs,
            ...(Number.isFinite(details.originalBytes) ? { contextBytesBefore: details.originalBytes } : {}),
            ...(Number.isFinite(details.compactBytes) ? { contextBytesAfter: details.compactBytes } : {}),
            ...(Number.isFinite(details.chunkCount) ? { contextChunks: details.chunkCount } : {}),
          });
        }
      },
    }), QUIZ_GENERATION_JOB_TIMEOUT_MS, {
      code: 'QUIZ_JOB_TIMEOUT',
      message: 'The complete quiz generation job exceeded its safety deadline. Please try again.',
    });
    await phaseUpdates;
    console.log(`[QuizGeneration] Job ${job.id} completed.`);
  } catch (error) {
    await phaseUpdates.catch(() => {});
    const result = await jobService.fail(job, error);
    console.error(`[QuizGeneration] Job ${job.id} ${result?.status === 'PENDING' ? 'will retry' : 'failed'} (${error?.code || 'QUIZ_GENERATION_FAILED'}).`);
  }
}

async function run() {
  if (!GEMINI_API_KEY) throw new Error('Missing required environment variable: GEMINI_API_KEY.');
  console.log(`[QuizGeneration] Worker ${workerId} started with ${GEMINI_QUIZ_MODEL}.`);
  const recovered = await jobService.recoverStale(QUIZ_GENERATION_JOB_TIMEOUT_MS);
  lastRecoveryAt = Date.now();
  if (recovered) console.log(`[QuizGeneration] Recovered ${recovered} stale job(s).`);
  while (!stopping) {
    if (Date.now() - lastRecoveryAt >= Math.min(60000, Math.max(5000, Math.floor(QUIZ_GENERATION_JOB_TIMEOUT_MS / 2)))) {
      const count = await jobService.recoverStale(QUIZ_GENERATION_JOB_TIMEOUT_MS);
      if (count) console.log(`[QuizGeneration] Recovered ${count} stale job(s).`);
      lastRecoveryAt = Date.now();
    }
    const job = await jobService.claimNext(workerId);
    if (job) await processJob(job);
    else await wait(QUIZ_GENERATION_POLL_INTERVAL_MS);
  }
}

function requestShutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`[QuizGeneration] ${signal} received; stopping after the current operation.`);
  pendingWait?.();
}

process.once('SIGINT', () => requestShutdown('SIGINT'));
process.once('SIGTERM', () => requestShutdown('SIGTERM'));

run()
  .then(async () => {
    await closePool();
    console.log('[QuizGeneration] Worker stopped cleanly.');
  })
  .catch(async error => {
    console.error(`[QuizGeneration] Worker stopped: ${error.message}`);
    await closePool().catch(() => {});
    process.exitCode = 1;
  });
