const crypto = require('node:crypto');

const inFlight = new Map();

function key(parts) {
  const value = Array.isArray(parts) ? parts : [parts];
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function run(resourceKey, operation) {
  if (inFlight.has(resourceKey)) return inFlight.get(resourceKey);
  const promise = Promise.resolve().then(operation);
  inFlight.set(resourceKey, promise);
  promise.finally(() => {
    if (inFlight.get(resourceKey) === promise) inFlight.delete(resourceKey);
  }).catch(() => {});
  return promise;
}

module.exports = { run, key, size: () => inFlight.size };
