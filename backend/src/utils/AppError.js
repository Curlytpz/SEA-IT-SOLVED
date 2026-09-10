class AppError extends Error {
  constructor(message, statusCode = 500, options = {}) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;    // distinguish from programming bugs
    if (options.code) this.code = options.code;
    if (options.details) this.details = options.details;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
