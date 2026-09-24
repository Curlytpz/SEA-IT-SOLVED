const rateLimit = require('express-rate-limit');

function createRateLimiter({ name, windowMs, max, message, skip }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip,
    handler(req, res, _next, options) {
      console.warn('[RateLimit] Local API limit reached', {
        source: 'LOCAL_API',
        limiter: name,
        method: req.method,
        route: req.originalUrl?.split('?')[0] || req.path,
        ip: req.ip,
        limit: options.limit,
        windowMs: options.windowMs,
      });
      res.status(options.statusCode).json({ success: false, error: message });
    },
  });
}

module.exports = { createRateLimiter };
