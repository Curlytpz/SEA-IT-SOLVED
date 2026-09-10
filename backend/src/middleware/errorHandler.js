const { NODE_ENV } = require('../config/env');

function lessonActionMessage(path) {
  if (/\/lessons\/[^/]+\/pause(?:\?|$)/.test(path)) return 'Unable to pause this lesson. Please try again.';
  if (/\/lessons\/[^/]+\/resume(?:\?|$)/.test(path)) return 'Unable to resume this lesson. Please try again.';
  if (/\/lessons\/[^/]+\/end(?:\?|$)/.test(path)) return 'Unable to end this lesson. Please try again.';
  if (/\/lessons\/[^/]+\/start(?:\?|$)/.test(path)) return 'Unable to start this lesson. Please try again.';
  return null;
}

function isPostgresError(err) {
  return typeof err.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code);
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const isProduction = NODE_ENV === 'production';
  const requestPath = req.originalUrl || req.path || '';

  // Keep full database and stack details in server logs only.
  console.error(`[ERROR] ${req.method} ${requestPath} -> ${statusCode}: ${err.message}`);
  if (!isProduction) console.error(err.stack);

  // Friendly AppError messages always take precedence over database mapping.
  if (err.isOperational && !isPostgresError(err)) {
    const payload = { success: false, error: err.message };
    if (err.code) payload.code = err.code;
    if (err.details) payload.details = err.details;
    return res.status(statusCode).json(payload);
  }

  if (err.code === '23505') {
    const detail = `${err.constraint || ''} ${err.detail || ''}`;
    let message = 'A record with that value already exists.';
    if (detail.includes('users_email_unique')) message = 'An account with that email already exists.';
    if (detail.includes('users_student_number_unique')) message = 'That student number is already registered.';
    if (detail.includes('sections_join_code_unique')) message = 'Join code collision - please try again.';
    if (detail.includes('sections_instructor_subject_name_unique') || detail.includes('sections_subject_name_unique')) message = 'A section with this name already exists for this subject.';
    if (detail.includes('enrollments_student_section_unique')) message = 'You have already requested to join this section.';
    if (detail.includes('lesson_sessions_one_current_per_section')) message = 'This section already has a lesson in progress. End the current lesson before starting a new one.';
    if (detail.includes('lessons_one_active_per_section')) message = 'This section already has an active lesson. End the current lesson before starting a new one.';
    return res.status(409).json({ success: false, error: message });
  }

  if (err.code === '23514') {
    const actionMessage = lessonActionMessage(requestPath);
    return res.status(409).json({
      success: false,
      error: actionMessage || 'The requested change is not valid for the current record state.',
    });
  }

  if (err.code === '23503') {
    const deletingUser = req.method === 'DELETE' && /\/admin\/users\//.test(requestPath);
    return res.status(409).json({
      success: false,
      error: deletingUser
        ? 'This account cannot be deleted because it still owns academic records. Suspend the account instead.'
        : 'This record cannot be changed because it is still referenced by other records.',
    });
  }

  if (err.code === '42P01' && /\/lessons\/[^/]+\/chat/.test(requestPath)) {
    return res.status(503).json({ success: false, error: 'The lesson assistant is temporarily unavailable.' });
  }

  if (err.code === '22P02') {
    return res.status(400).json({ success: false, error: 'The request contains an invalid value.' });
  }

  if (err.code === '23502') {
    return res.status(400).json({ success: false, error: 'A required value is missing.' });
  }

  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, error: 'Invalid or expired token.' });
  }

  if (err.name === 'MulterError') {
    const isAudio = requestPath.includes('/audio-recording');
    const isSolution = requestPath.includes('/solution-activities/');
    const isMaterial = requestPath.includes('/materials');
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? (isAudio ? 'The audio recording exceeds the configured upload limit.' : isSolution ? 'The solution image must be no larger than 8 MB.' : isMaterial ? 'The lesson material exceeds the configured upload limit.' : 'Each capture image must be no larger than 8 MB.')
      : (isAudio ? 'The audio recording upload is invalid.' : isSolution ? 'The solution image upload is invalid.' : isMaterial ? 'The lesson material upload is invalid.' : 'The capture upload is invalid.');
    return res.status(400).json({ success: false, error: message });
  }

  // Never expose any other PostgreSQL diagnostic, even in development.
  if (isPostgresError(err)) {
    return res.status(500).json({
      success: false,
      error: lessonActionMessage(requestPath) || 'Unable to complete the request. Please try again.',
    });
  }

  res.status(500).json({
    success: false,
    error: isProduction ? 'An unexpected server error occurred.' : err.message,
  });
}

module.exports = errorHandler;

