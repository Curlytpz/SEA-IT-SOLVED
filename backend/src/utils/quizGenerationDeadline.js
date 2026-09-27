const AppError = require('./AppError');

function runQuizGenerationWithinDeadline(operation, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AppError('The quiz generation request timed out. Please try again.', 504, { code: 'QUIZ_TIMEOUT' }));
    }, timeoutMs);
  });
  return Promise.race([Promise.resolve().then(() => operation(controller.signal)), timeout])
    .finally(() => clearTimeout(timer));
}

module.exports = { runQuizGenerationWithinDeadline };
