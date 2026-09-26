const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const test = require('node:test');
const {
  BACKEND_ROOT,
  CHILD_PROCESSES,
  ProductionSupervisor,
  logMediaPreflight,
} = require('./startProduction');

class FakeProcess extends EventEmitter {
  constructor() {
    super();
    this.env = {};
    this.execPath = process.execPath;
  }
}

class FakeChild extends EventEmitter {
  constructor(pid) {
    super();
    this.pid = pid;
    this.signals = [];
  }

  kill(signal) {
    this.signals.push(signal);
    return true;
  }
}

function harness() {
  const processRef = new FakeProcess();
  const launches = [];
  const children = [];
  const exitCodes = [];
  const logs = [];
  const logger = {
    log: value => logs.push(String(value)),
    error: value => logs.push(String(value)),
  };
  const spawnImpl = (command, args, options) => {
    const child = new FakeChild(1000 + children.length);
    children.push(child);
    launches.push({ command, args, options });
    return child;
  };
  const spawnSyncImpl = command => ({ status: command === 'ffmpeg' ? 0 : 1 });
  const supervisor = new ProductionSupervisor({
    processRef,
    spawnImpl,
    spawnSyncImpl,
    logger,
    exit: code => exitCodes.push(code),
    setTimeoutImpl: () => ({ unref() {} }),
    clearTimeoutImpl: () => {},
  });
  return { processRef, launches, children, exitCodes, logs, supervisor };
}

test('media preflight reports availability without throwing for missing tools', () => {
  const logs = [];
  const availability = logMediaPreflight({
    env: {},
    logger: { log: value => logs.push(String(value)) },
    spawnSyncImpl: command => ({ status: command === 'ffmpeg' ? 0 : 1 }),
  });
  assert.deepEqual(availability, { ffmpeg: true, ffprobe: false });
  assert.deepEqual(logs, [
    '[Production] FFmpeg available: YES',
    '[Production] FFprobe available: NO',
  ]);
});

test('supervisor launches the API and both workers with inherited output', () => {
  const state = harness();
  state.supervisor.start();

  assert.equal(state.launches.length, 3);
  assert.deepEqual(
    state.launches.map(item => path.relative(BACKEND_ROOT, item.args[0])),
    CHILD_PROCESSES.map(item => item.entry),
  );
  for (const launch of state.launches) {
    assert.equal(launch.command, process.execPath);
    assert.equal(launch.options.cwd, BACKEND_ROOT);
    assert.equal(launch.options.stdio, 'inherit');
  }
});

test('unexpected child exit stops siblings and exits non-zero', () => {
  const state = harness();
  state.supervisor.start();

  state.children[0].emit('exit', 0, null);
  assert.deepEqual(state.children[1].signals, ['SIGTERM']);
  assert.deepEqual(state.children[2].signals, ['SIGTERM']);
  state.children[1].emit('exit', 0, 'SIGTERM');
  state.children[2].emit('exit', 0, 'SIGTERM');
  assert.deepEqual(state.exitCodes, [1]);
});

test('SIGTERM is forwarded to every child and permits a clean exit', () => {
  const state = harness();
  state.supervisor.start();

  state.processRef.emit('SIGTERM');
  for (const child of state.children) assert.deepEqual(child.signals, ['SIGTERM']);
  for (const child of state.children) child.emit('exit', 0, 'SIGTERM');
  assert.deepEqual(state.exitCodes, [0]);
});
