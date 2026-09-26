require('dotenv').config({ quiet: true });
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const BACKEND_ROOT = path.resolve(__dirname, '..');
const CHILD_PROCESSES = Object.freeze([
  { name: 'api', entry: 'server.js' },
  { name: 'recognition-worker', entry: path.join('src', 'workers', 'recognition.worker.js') },
  { name: 'transcription-worker', entry: path.join('src', 'workers', 'transcription.worker.js') },
]);

function normalizeExecutable(value, fallback) {
  const candidate = String(value || fallback).trim();
  return candidate.replace(/^"(.*)"$/, '$1');
}

function executableAvailable(command, spawnSyncImpl = spawnSync) {
  try {
    const result = spawnSyncImpl(command, ['-version'], {
      stdio: 'ignore',
      windowsHide: true,
      timeout: 5000,
    });
    return !result.error && result.status === 0;
  } catch {
    return false;
  }
}

function logMediaPreflight({ env = process.env, logger = console, spawnSyncImpl = spawnSync } = {}) {
  const ffmpeg = normalizeExecutable(env.FFMPEG_PATH, 'ffmpeg');
  const ffprobe = normalizeExecutable(env.FFPROBE_PATH, 'ffprobe');
  const availability = {
    ffmpeg: executableAvailable(ffmpeg, spawnSyncImpl),
    ffprobe: executableAvailable(ffprobe, spawnSyncImpl),
  };

  logger.log(`[Production] FFmpeg available: ${availability.ffmpeg ? 'YES' : 'NO'}`);
  logger.log(`[Production] FFprobe available: ${availability.ffprobe ? 'YES' : 'NO'}`);
  return availability;
}

class ProductionSupervisor {
  constructor({
    processRef = process,
    spawnImpl = spawn,
    spawnSyncImpl = spawnSync,
    logger = console,
    exit = code => { processRef.exitCode = code; },
    setTimeoutImpl = setTimeout,
    clearTimeoutImpl = clearTimeout,
    shutdownTimeoutMs = 15000,
  } = {}) {
    this.processRef = processRef;
    this.spawnImpl = spawnImpl;
    this.spawnSyncImpl = spawnSyncImpl;
    this.logger = logger;
    this.exit = exit;
    this.setTimeoutImpl = setTimeoutImpl;
    this.clearTimeoutImpl = clearTimeoutImpl;
    this.shutdownTimeoutMs = shutdownTimeoutMs;
    this.children = new Map();
    this.shuttingDown = false;
    this.exitCode = 0;
    this.forceTimer = null;
    this.signalHandlers = new Map();
    this.finished = false;
  }

  start() {
    logMediaPreflight({
      env: this.processRef.env,
      logger: this.logger,
      spawnSyncImpl: this.spawnSyncImpl,
    });

    for (const signal of ['SIGTERM', 'SIGINT']) {
      const handler = () => this.beginShutdown({ signal, exitCode: 0 });
      this.signalHandlers.set(signal, handler);
      this.processRef.once(signal, handler);
    }

    for (const definition of CHILD_PROCESSES) {
      if (this.shuttingDown) break;
      this.launch(definition);
    }

    return this;
  }

  launch(definition) {
    const entryPath = path.resolve(BACKEND_ROOT, definition.entry);
    let child;
    try {
      child = this.spawnImpl(this.processRef.execPath, [entryPath], {
        cwd: BACKEND_ROOT,
        env: this.processRef.env,
        stdio: 'inherit',
        windowsHide: true,
      });
    } catch (error) {
      this.logger.error(`[Production] Failed to start ${definition.name}: ${error.message}`);
      this.beginShutdown({ signal: 'SIGTERM', exitCode: 1 });
      return;
    }

    const record = { ...definition, child, exited: false };
    this.children.set(definition.name, record);
    this.logger.log(`[Production] Started ${definition.name} (pid ${child.pid ?? 'unknown'}).`);

    child.once('error', error => {
      if (record.exited) return;
      this.logger.error(`[Production] ${definition.name} process error: ${error.message}`);
      this.beginShutdown({ signal: 'SIGTERM', exitCode: 1 });
    });

    child.once('exit', (code, signal) => {
      record.exited = true;
      const outcome = signal ? `signal ${signal}` : `code ${code}`;
      this.logger.log(`[Production] ${definition.name} exited with ${outcome}.`);

      if (!this.shuttingDown) {
        this.logger.error(`[Production] ${definition.name} exited unexpectedly; stopping the service.`);
        this.beginShutdown({ signal: 'SIGTERM', exitCode: 1 });
      } else {
        this.finishIfStopped();
      }
    });
  }

  beginShutdown({ signal, exitCode }) {
    if (this.finished) return;
    if (!this.shuttingDown) {
      this.shuttingDown = true;
      this.exitCode = exitCode;
      this.logger.log(`[Production] Forwarding ${signal} to child processes.`);
    } else if (exitCode !== 0) {
      this.exitCode = 1;
    }

    for (const record of this.children.values()) {
      if (record.exited) continue;
      try {
        record.child.kill(signal);
      } catch (error) {
        this.logger.error(`[Production] Could not signal ${record.name}: ${error.message}`);
      }
    }

    if (!this.forceTimer && this.children.size > 0) {
      this.forceTimer = this.setTimeoutImpl(() => {
        this.logger.error('[Production] Child shutdown timed out; forcing termination.');
        for (const record of this.children.values()) {
          if (!record.exited) {
            try { record.child.kill('SIGKILL'); } catch {}
          }
        }
        this.exitCode = 1;
      }, this.shutdownTimeoutMs);
      this.forceTimer?.unref?.();
    }

    this.finishIfStopped();
  }

  finishIfStopped() {
    if (!this.shuttingDown || this.finished) return;
    const allStopped = [...this.children.values()].every(record => record.exited);
    if (!allStopped) return;

    this.finished = true;
    if (this.forceTimer) this.clearTimeoutImpl(this.forceTimer);
    for (const [signal, handler] of this.signalHandlers) {
      this.processRef.removeListener(signal, handler);
    }
    this.exit(this.exitCode);
  }
}

function main() {
  new ProductionSupervisor().start();
}

if (require.main === module) main();

module.exports = {
  BACKEND_ROOT,
  CHILD_PROCESSES,
  ProductionSupervisor,
  executableAvailable,
  logMediaPreflight,
  normalizeExecutable,
};
