const AppError = require('./AppError');

function runQuizGenerationWithinDeadline(operation, timeoutMs, {
  code = 'QUIZ_TIMEOUT',
  message = 'The quiz generation request timed out. Please try again.',
} = {}) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AppError(message, 504, { code }));
    }, timeoutMs);
  });
  return Promise.race([Promise.resolve().then(() => operation(controller.signal)), timeout])
    .finally(() => clearTimeout(timer));
}

module.exports = { runQuizGenerationWithinDeadline };
