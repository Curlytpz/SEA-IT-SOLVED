const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { probeAudioDuration, prepareAudioForGemini, runMediaProcess } = require('./audioTranscode');

test('audio duration is derived from ffprobe output rather than caller metadata', async () => {
  const duration = await probeAudioDuration({
    sourcePath: 'recording.webm',
    runner: async (_executable, args) => {
      assert(args.includes('format=duration'));
      return { stdout: '125.125\n', stderr: '' };
    },
  });
  assert.equal(duration, 125125);
});

test('transcoding passes a hard duration cap and rejects oversized output', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sea-audio-test-'));
  const sourcePath = path.join(directory, 'input.webm');
  await fs.writeFile(sourcePath, Buffer.from([0x1a,0x45,0xdf,0xa3,0,0,0,0,0,0,0,0,0,0,0,0]));
  try {
    await assert.rejects(() => prepareAudioForGemini({
      sourcePath, sourceMime: 'audio/webm', maxDurationSeconds: 60, maxOutputBytes: 4,
      runner: async (_executable, args) => {
        assert.deepEqual(args.slice(args.indexOf('-t'), args.indexOf('-t') + 2), ['-t', '60']);
        await fs.writeFile(args.at(-1), Buffer.alloc(8));
        return { stdout: '', stderr: '' };
      },
    }), error => error.code === 'AUDIO_OUTPUT_LIMIT');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('stalled media processes are terminated at the wall-clock limit', async () => {
  await assert.rejects(
    () => runMediaProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 25 }),
    error => error.code === 'AUDIO_CONVERSION_TIMEOUT'
  );
});
