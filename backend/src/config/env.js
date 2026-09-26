require('dotenv').config({ quiet: true });

const allowedNodeEnvironments = new Set(['development', 'test', 'production']);
if (process.env.NODE_ENV && !allowedNodeEnvironments.has(process.env.NODE_ENV)) {
  throw new Error('NODE_ENV must be development, test, or production.');
}

const required = ['NODE_ENV', 'JWT_SECRET', 'DB_NAME', 'DB_USER'];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}. Check your .env file.`);
  }
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

const mediaResolutionMap = {
  LOW: 'MEDIA_RESOLUTION_LOW',
  MEDIUM: 'MEDIA_RESOLUTION_MEDIUM',
  HIGH: 'MEDIA_RESOLUTION_HIGH',
};
const configuredMediaResolution = String(process.env.GEMINI_MEDIA_RESOLUTION || 'HIGH').toUpperCase();
const configuredDbSsl = String(process.env.DB_SSL || '').trim().toLowerCase();
if (configuredDbSsl && !['true', 'false'].includes(configuredDbSsl)) {
  throw new Error('DB_SSL must be true or false.');
}

module.exports = {
  PORT:         parseInt(process.env.PORT || '4000', 10),
  NODE_ENV:     process.env.NODE_ENV      || 'development',
  DB_HOST:      process.env.DB_HOST       || 'localhost',
  DB_SSL:       configuredDbSsl === 'true',
  DB_SSL_CA_PATH: process.env.DB_SSL_CA_PATH || '',
  JWT_SECRET:   process.env.JWT_SECRET,
  JWT_EXPIRES:  process.env.JWT_EXPIRES_IN || '7d',
  FRONTEND_URL: process.env.FRONTEND_URL   || 'http://localhost:5173',
  TRUST_PROXY_HOPS: boundedInteger(process.env.TRUST_PROXY_HOPS, 1, 0, 3),
  API_RATE_LIMIT_MAX: boundedInteger(process.env.API_RATE_LIMIT_MAX, 1200, 100, 5000),
  AUTH_RATE_LIMIT_MAX: boundedInteger(process.env.AUTH_RATE_LIMIT_MAX, 20, 5, 100),
  PASSWORD_RESET_TTL_MINUTES: boundedInteger(process.env.PASSWORD_RESET_TTL_MINUTES, 30, 20, 30),
  EMAIL_VERIFICATION_TTL_MINUTES: boundedInteger(process.env.EMAIL_VERIFICATION_TTL_MINUTES, 60, 10, 1440),
  MAIL_PROVIDER: process.env.MAIL_PROVIDER || '',
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  MAIL_FROM: process.env.MAIL_FROM || '',
  GMAIL_SMTP_USER: process.env.GMAIL_SMTP_USER || '',
  GMAIL_SMTP_APP_PASSWORD: process.env.GMAIL_SMTP_APP_PASSWORD || '',
  MICROSOFT_TENANT_ID: process.env.MICROSOFT_TENANT_ID || '',
  MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID || '',
  MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET || '',
  MICROSOFT_SENDER_EMAIL: process.env.MICROSOFT_SENDER_EMAIL || '',
  CAPTURE_STORAGE_PATH: process.env.CAPTURE_STORAGE_PATH || '',
  CAPTURE_MAX_AGGREGATE_MB: boundedInteger(process.env.CAPTURE_MAX_AGGREGATE_MB, 48, 8, 112),
  CAPTURE_MAX_CONCURRENT_UPLOADS: boundedInteger(process.env.CAPTURE_MAX_CONCURRENT_UPLOADS, 2, 1, 8),
  CAPTURE_MAX_CONCURRENT_PER_USER: boundedInteger(process.env.CAPTURE_MAX_CONCURRENT_PER_USER, 1, 1, 3),
  AUDIO_STORAGE_PATH: process.env.AUDIO_STORAGE_PATH || '',
  AUDIO_MAX_UPLOAD_MB: Math.max(1, parseInt(process.env.AUDIO_MAX_UPLOAD_MB || '128', 10) || 128),
  LESSON_MATERIAL_STORAGE_PATH: process.env.LESSON_MATERIAL_STORAGE_PATH || '',
  SOLUTION_SUBMISSION_STORAGE_PATH: process.env.SOLUTION_SUBMISSION_STORAGE_PATH || '',
  SOLUTION_REVIEW_CONTEXT_MAX_CHARS: boundedInteger(process.env.SOLUTION_REVIEW_CONTEXT_MAX_CHARS, 3500, 0, 8000),
  LESSON_MATERIAL_IMAGE_MAX_MB: boundedInteger(process.env.LESSON_MATERIAL_IMAGE_MAX_MB, 12, 1, 32),
  LESSON_MATERIAL_PDF_MAX_MB: boundedInteger(process.env.LESSON_MATERIAL_PDF_MAX_MB, 32, 1, 128),
  LESSON_MATERIAL_PDF_MAX_PAGES: boundedInteger(process.env.LESSON_MATERIAL_PDF_MAX_PAGES, 50, 1, 200),
  RECOGNITION_PROVIDER: 'GEMINI',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  // Recognition is isolated from general reasoning models so an experimental
  // or obsolete default cannot silently break the capture worker.
  GEMINI_RECOGNITION_MODEL: process.env.GEMINI_RECOGNITION_MODEL || process.env.GEMINI_CHAT_MODEL || 'gemini-2.5-flash',
  GEMINI_MEDIA_RESOLUTION: mediaResolutionMap[configuredMediaResolution] || mediaResolutionMap.HIGH,
  RECOGNITION_MAX_ATTEMPTS: boundedInteger(process.env.RECOGNITION_MAX_ATTEMPTS, 3, 1, 5),
  RECOGNITION_POLL_INTERVAL_MS: boundedInteger(process.env.RECOGNITION_POLL_INTERVAL_MS, 3000, 1000, 30000),
  RECOGNITION_PROVIDER_TIMEOUT_MS: boundedInteger(process.env.RECOGNITION_PROVIDER_TIMEOUT_MS, 90000, 5000, 300000),
  RECOGNITION_MIN_REQUEST_INTERVAL_MS: boundedInteger(process.env.RECOGNITION_MIN_REQUEST_INTERVAL_MS, 15000, 1000, 300000),
  RECOGNITION_RATE_LIMIT_BACKOFF_MS: boundedInteger(process.env.RECOGNITION_RATE_LIMIT_BACKOFF_MS, 60000, 5000, 900000),
  RECOGNITION_JOB_TIMEOUT_MS: boundedInteger(process.env.RECOGNITION_JOB_TIMEOUT_MS, 120000, 30000, 900000),
  RECOGNITION_RAW_OUTPUT_MAX_BYTES: boundedInteger(process.env.RECOGNITION_RAW_OUTPUT_MAX_BYTES, 262144, 1024, 1048576),
  RECOGNITION_MAX_IMAGE_MB: boundedInteger(process.env.RECOGNITION_MAX_IMAGE_MB, 8, 1, 32),
  RECOGNITION_MAX_CAPTURES: boundedInteger(process.env.RECOGNITION_MAX_CAPTURES, 100, 1, 500),
  RECOGNITION_MAX_AGGREGATE_MB: boundedInteger(process.env.RECOGNITION_MAX_AGGREGATE_MB, 256, 8, 2048),
  RECOGNITION_WORKER_ID: process.env.RECOGNITION_WORKER_ID || '',
  TRANSCRIPTION_PROVIDER: 'GEMINI',
  GEMINI_TRANSCRIPTION_MODEL: process.env.GEMINI_TRANSCRIPTION_MODEL
    || process.env.GEMINI_RECOGNITION_MODEL
    || process.env.GEMINI_CHAT_MODEL
    || 'gemini-2.5-flash',
  TRANSCRIPTION_MAX_ATTEMPTS: boundedInteger(process.env.TRANSCRIPTION_MAX_ATTEMPTS, 3, 1, 5),
  TRANSCRIPTION_POLL_INTERVAL_MS: boundedInteger(process.env.TRANSCRIPTION_POLL_INTERVAL_MS, 3000, 1000, 30000),
  TRANSCRIPTION_PROVIDER_TIMEOUT_MS: boundedInteger(process.env.TRANSCRIPTION_PROVIDER_TIMEOUT_MS, 600000, 30000, 1800000),
  TRANSCRIPTION_JOB_TIMEOUT_MS: boundedInteger(process.env.TRANSCRIPTION_JOB_TIMEOUT_MS, 1000000, 60000, 3600000),
  TRANSCRIPTION_RAW_OUTPUT_MAX_BYTES: boundedInteger(process.env.TRANSCRIPTION_RAW_OUTPUT_MAX_BYTES, 1048576, 1024, 4194304),
  TRANSCRIPTION_MAX_AUDIO_MINUTES: boundedInteger(process.env.TRANSCRIPTION_MAX_AUDIO_MINUTES, 480, 1, 570),
  TRANSCRIPTION_WORKER_ID: process.env.TRANSCRIPTION_WORKER_ID || '',
  TRANSCRIPTION_TEMP_PATH: process.env.TRANSCRIPTION_TEMP_PATH || '',
  FFMPEG_PATH: process.env.FFMPEG_PATH || 'ffmpeg',
  FFPROBE_PATH: process.env.FFPROBE_PATH || 'ffprobe',
  TRANSCRIPTION_FFMPEG_TIMEOUT_MS: boundedInteger(process.env.TRANSCRIPTION_FFMPEG_TIMEOUT_MS, 240000, 10000, 600000),
  TRANSCRIPTION_MAX_OUTPUT_MB: boundedInteger(process.env.TRANSCRIPTION_MAX_OUTPUT_MB, 256, 8, 1024),
  GEMINI_FILE_POLL_INTERVAL_MS: boundedInteger(process.env.GEMINI_FILE_POLL_INTERVAL_MS, 2000, 500, 30000),
  GEMINI_FILE_READY_TIMEOUT_MS: boundedInteger(process.env.GEMINI_FILE_READY_TIMEOUT_MS, 120000, 10000, 600000),
  GEMINI_SHARED_MIN_REQUEST_INTERVAL_MS: boundedInteger(process.env.GEMINI_SHARED_MIN_REQUEST_INTERVAL_MS, 15000, 0, 300000),
  GEMINI_SHARED_RATE_LIMIT_BACKOFF_MS: boundedInteger(process.env.GEMINI_SHARED_RATE_LIMIT_BACKOFF_MS, 60000, 5000, 900000),
  AI_MAX_CONCURRENT_REQUESTS: boundedInteger(process.env.AI_MAX_CONCURRENT_REQUESTS, 2, 1, 10),
  AI_MAX_PENDING_REQUESTS: boundedInteger(process.env.AI_MAX_PENDING_REQUESTS, 10, 0, 100),
  AI_MAX_PENDING_PER_USER: boundedInteger(process.env.AI_MAX_PENDING_PER_USER, 3, 0, 20),
  AI_QUEUE_TIMEOUT_MS: boundedInteger(process.env.AI_QUEUE_TIMEOUT_MS, 30000, 1000, 300000),
  AI_MAX_RETRIES: boundedInteger(process.env.AI_MAX_RETRIES, 2, 0, 5),
  AI_RETRY_BASE_DELAY_MS: boundedInteger(process.env.AI_RETRY_BASE_DELAY_MS, 1000, 100, 60000),
  GEMINI_REASONING_MODEL: process.env.GEMINI_REASONING_MODEL
    || process.env.GEMINI_CHAT_MODEL
    || process.env.GEMINI_MODEL
    || 'gemini-2.5-flash',
  // Keep latency-sensitive lesson chat independently configurable. The general
  // reasoning model may be a preview/high-demand model that is unsuitable for
  // interactive requests.
  GEMINI_CHAT_MODEL: process.env.GEMINI_CHAT_MODEL || 'gemini-2.5-flash',
  // Quiz drafting is latency-sensitive and should not inherit a preview or
  // high-demand reasoning model used by background lesson generation.
  GEMINI_QUIZ_MODEL: process.env.GEMINI_QUIZ_MODEL || process.env.GEMINI_CHAT_MODEL || 'gemini-2.5-flash',
  GEMINI_QUIZ_TIMEOUT_MS: boundedInteger(process.env.GEMINI_QUIZ_TIMEOUT_MS, 120000, 15000, 300000),
  GEMINI_INTERACTIVE_TIMEOUT_MS: boundedInteger(process.env.GEMINI_INTERACTIVE_TIMEOUT_MS, 120000, 15000, 300000),
  GEMINI_INTERACTIVE_MAX_ATTEMPTS: boundedInteger(process.env.GEMINI_INTERACTIVE_MAX_ATTEMPTS, 2, 1, 3),
  QUIZ_TUTOR_MAX_PRACTICE_PER_ATTEMPT: boundedInteger(process.env.QUIZ_TUTOR_MAX_PRACTICE_PER_ATTEMPT, 3, 1, 10),
  QUIZ_TUTOR_PROCESSING_STALE_MS: boundedInteger(process.env.QUIZ_TUTOR_PROCESSING_STALE_MS, 300000, 30000, 1800000),
  ANALYTICS_PERFORMANCE_THRESHOLD_PERCENT: boundedInteger(process.env.ANALYTICS_PERFORMANCE_THRESHOLD_PERCENT, 80, 1, 100),




  // ── Email domain configuration ──────────────────────────────────────────
  // The allowed email domain for student self-registration.
  STUDENT_EMAIL_DOMAIN: process.env.STUDENT_EMAIL_DOMAIN || 'student.hau.edu.ph',

  // The allowed email domain for instructor self-registration.
  // Instructors must still be approved by an admin even if their domain matches.
  // Set to empty string to disable domain enforcement for instructors.
  INSTRUCTOR_EMAIL_DOMAIN: process.env.INSTRUCTOR_EMAIL_DOMAIN || 'hau.edu.ph',
};

function validateProductionConfiguration(config, environment = process.env) {
  if (config.NODE_ENV !== 'production') return;
  const problems = [];
  if (String(config.JWT_SECRET || '').length < 32) problems.push('JWT_SECRET must contain at least 32 characters');
  if (!/^https:\/\//i.test(config.FRONTEND_URL) || /localhost|127\.0\.0\.1/i.test(config.FRONTEND_URL)) {
    problems.push('FRONTEND_URL must be the public HTTPS frontend URL');
  }
  if (!String(environment.DB_PASSWORD || '')) problems.push('DB_PASSWORD is required');
  if (/\.supabase\.com$/i.test(String(config.DB_HOST || '').trim()) && config.DB_SSL !== true) {
    problems.push('DB_SSL=true is required for Supabase PostgreSQL connections');
  }
  if (!/^\d+$/.test(String(environment.TRUST_PROXY_HOPS || ''))) problems.push('TRUST_PROXY_HOPS must be explicitly configured');
  if (!String(config.GEMINI_API_KEY || '')) problems.push('GEMINI_API_KEY is required');
  const mailProvider = String(config.MAIL_PROVIDER || '').trim().toLowerCase();
  const productionMailRequirements = {
    resend: ['RESEND_API_KEY', 'MAIL_FROM'],
    gmail_smtp: ['GMAIL_SMTP_USER', 'GMAIL_SMTP_APP_PASSWORD', 'MAIL_FROM'],
    microsoft_graph: ['MICROSOFT_TENANT_ID', 'MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_SENDER_EMAIL'],
  };
  const requiredMailVariables = productionMailRequirements[mailProvider];
  if (!requiredMailVariables) {
    problems.push('MAIL_PROVIDER must be resend, gmail_smtp, or microsoft_graph in production');
  } else {
    const missingMailVariables = requiredMailVariables.filter(name => !String(config[name] || '').trim());
    if (missingMailVariables.length) {
      problems.push(`MAIL_PROVIDER=${mailProvider} requires: ${missingMailVariables.join(', ')}`);
    }
  }
  const mediaPipelineBudget = Number(config.TRANSCRIPTION_PROVIDER_TIMEOUT_MS)
    + Number(config.TRANSCRIPTION_FFMPEG_TIMEOUT_MS)
    + Math.min(Number(config.TRANSCRIPTION_FFMPEG_TIMEOUT_MS), 60000);
  if (Number(config.TRANSCRIPTION_JOB_TIMEOUT_MS) <= mediaPipelineBudget) {
    problems.push('TRANSCRIPTION_JOB_TIMEOUT_MS must exceed the probe, conversion, and provider timeout budget');
  }
  if (problems.length) throw new Error(`Unsafe production configuration: ${problems.join('; ')}.`);
}

validateProductionConfiguration(module.exports);
module.exports.validateProductionConfiguration = validateProductionConfiguration;
