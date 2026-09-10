/**
 * Wraps an async route handler so that any thrown error
 * is forwarded to Express's next(err) instead of crashing the process.
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
