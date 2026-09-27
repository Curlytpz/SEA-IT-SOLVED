const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  probeAudioDuration,
  prepareAudioForGemini,
  runMediaProcess,
  verifyAudioForTranscription,
} = require('./audioTranscode');

const webmHeader = Buffer.from([0x1a,0x45,0xdf,0xa3,0,0,0,0,0,0,0,0,0,0,0,0]);

test('audio duration uses format.duration when available', async () => {
  const duration = await probeAudioDuration({
    sourcePath: 'recording.webm',
    runner: async (_executable, args) => {
      assert(args.includes('format=duration:stream=codec_type,duration'));
      return { stdout: JSON.stringify({ format: { duration: '125.125' }, streams: [{ codec_type: 'audio' }] }), stderr: '' };
    },
  });
  assert.equal(duration, 125125);
});

test('audio duration uses the audio stream duration when format duration is unavailable', async () => {
  const duration = await probeAudioDuration({
    sourcePath: 'recording.webm',
    runner: async () => ({
      stdout: JSON.stringify({
        format: { duration: 'N/A' },
        streams: [{ codec_type: 'audio', duration: '23.935' }],
      }),
      stderr: '',
    }),
  });
  assert.equal(duration, 23935);
});

test('zero, NaN, non-finite, and negative probe durations are rejected', async t => {
  for (const value of ['0', 'NaN', 'Infinity', '-1']) {
    await t.test(value, async () => {
      await assert.rejects(() => probeAudioDuration({
        sourcePath: 'recording.webm',
        runner: async () => ({
          stdout: JSON.stringify({
            format: { duration: value },
            streams: [{ codec_type: 'audio', duration: value }],
          }),
          stderr: '',
        }),
      }), error => error.code === 'AUDIO_DURATION_PROBE_FAILED');
    });
  }
});

test('browser WebM with missing metadata duration succeeds after bounded decode normalization', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sea-audio-fallback-'));
  const sourcePath = path.join(directory, 'source.webm');
  const stages = [];
  await fs.writeFile(sourcePath, webmHeader);
  let probeCalls = 0;
  try {
    const result = await verifyAudioForTranscription({
      sourcePath,
      sourceMime: 'audio/webm;codecs=opus',
      ffmpegPath: 'ffmpeg',
      ffprobePath: 'ffprobe',
      probeTimeoutMs: 30000,
      ffmpegTimeoutMs: 240000,
      maxDurationSeconds: 480 * 60,
      maxOutputBytes: 1024 * 1024,
      referenceDurationMs: 23935,
      onStage: stage => stages.push(stage),
      runner: async (_executable, args, options) => {
        if (args.includes('-show_entries')) {
          probeCalls += 1;
          return probeCalls === 1
            ? { stdout: JSON.stringify({ format: {}, streams: [{ codec_type: 'audio' }] }), stderr: '' }
            : { stdout: JSON.stringify({ format: { duration: '23.935' }, streams: [{ codec_type: 'audio' }] }), stderr: '' };
        }
        assert.equal(options.timeoutMs, 240000);
        assert.deepEqual(args.slice(args.indexOf('-t'), args.indexOf('-t') + 2), ['-t', String(480 * 60 + 1)]);
        await fs.writeFile(args.at(-1), Buffer.alloc(128));
        return { stdout: '', stderr: '' };
      },
    });
    assert.equal(result.durationMs, 23935);
    assert.equal(result.preparedAudio.mimeType, 'audio/flac');
    assert.equal(await fs.stat(result.preparedAudio.audioPath).then(stat => stat.size), 128);
    assert.deepEqual(stages, ['FFPROBE_METADATA_DURATION_UNAVAILABLE']);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
  await assert.rejects(() => fs.stat(directory), error => error.code === 'ENOENT');
});

test('corrupt WebM is rejected when FFmpeg cannot decode it', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sea-audio-corrupt-'));
  const sourcePath = path.join(directory, 'source.webm');
  const stages = [];
  await fs.writeFile(sourcePath, webmHeader);
  try {
    await assert.rejects(() => verifyAudioForTranscription({
      sourcePath,
      sourceMime: 'audio/webm',
      maxDurationSeconds: 60,
      maxOutputBytes: 1024,
      onStage: stage => stages.push(stage),
      runner: async (_executable, args) => {
        if (args.includes('-show_entries')) {
          return { stdout: JSON.stringify({ format: {}, streams: [{ codec_type: 'audio' }] }), stderr: '' };
        }
        const error = new Error('Invalid media data');
        error.code = 'AUDIO_CONVERSION_FAILED';
        throw error;
      },
    }), error => error.code === 'AUDIO_DECODE_INVALID' && error.audioStage === 'AUDIO_DECODE_INVALID');
    assert.deepEqual(stages, ['FFPROBE_METADATA_DURATION_UNAVAILABLE', 'AUDIO_DECODE_INVALID']);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('WebM normalization timeout is bounded and reported safely', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sea-audio-timeout-'));
  const sourcePath = path.join(directory, 'source.webm');
  const stages = [];
  await fs.writeFile(sourcePath, webmHeader);
  try {
    await assert.rejects(() => verifyAudioForTranscription({
      sourcePath,
      sourceMime: 'audio/webm',
      ffmpegTimeoutMs: 12345,
      maxDurationSeconds: 60,
      maxOutputBytes: 1024,
      onStage: stage => stages.push(stage),
      runner: async (_executable, args, options) => {
        if (args.includes('-show_entries')) {
          return { stdout: JSON.stringify({ format: {}, streams: [{ codec_type: 'audio' }] }), stderr: '' };
        }
        assert.equal(options.timeoutMs, 12345);
        const error = new Error('Media processing exceeded its time limit.');
        error.code = 'AUDIO_CONVERSION_TIMEOUT';
        throw error;
      },
    }), error => error.code === 'AUDIO_CONVERSION_TIMEOUT' && error.audioStage === 'FFMPEG_NORMALIZATION_FAILED');
    assert.deepEqual(stages, ['FFPROBE_METADATA_DURATION_UNAVAILABLE', 'FFMPEG_NORMALIZATION_FAILED']);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('normalized duration failure removes the prepared temporary media', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sea-audio-reprobe-'));
  const sourcePath = path.join(directory, 'source.webm');
  const preparedPath = path.join(directory, 'prepared.flac');
  const stages = [];
  await fs.writeFile(sourcePath, webmHeader);
  try {
    await assert.rejects(() => verifyAudioForTranscription({
      sourcePath,
      sourceMime: 'audio/webm',
      maxDurationSeconds: 60,
      maxOutputBytes: 1024,
      onStage: stage => stages.push(stage),
      runner: async (_executable, args) => {
        if (args.includes('-show_entries')) {
          return { stdout: JSON.stringify({ format: {}, streams: [{ codec_type: 'audio' }] }), stderr: '' };
        }
        await fs.writeFile(args.at(-1), Buffer.alloc(64));
        return { stdout: '', stderr: '' };
      },
    }), error => error.code === 'AUDIO_DURATION_PROBE_FAILED'
      && error.audioStage === 'NORMALIZED_DURATION_UNAVAILABLE');
    assert.deepEqual(stages, [
      'FFPROBE_METADATA_DURATION_UNAVAILABLE',
      'NORMALIZED_DURATION_UNAVAILABLE',
    ]);
    await assert.rejects(() => fs.stat(preparedPath), error => error.code === 'ENOENT');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('transcoding passes a hard duration cap and rejects oversized output', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sea-audio-test-'));
  const sourcePath = path.join(directory, 'input.webm');
  const preparedPath = path.join(directory, 'prepared.flac');
  await fs.writeFile(sourcePath, webmHeader);
  try {
    await assert.rejects(() => prepareAudioForGemini({
      sourcePath, sourceMime: 'audio/webm', maxDurationSeconds: 60, maxOutputBytes: 4,
      runner: async (_executable, args) => {
        assert.deepEqual(args.slice(args.indexOf('-t'), args.indexOf('-t') + 2), ['-t', '60']);
        await fs.writeFile(args.at(-1), Buffer.alloc(8));
        return { stdout: '', stderr: '' };
      },
    }), error => error.code === 'AUDIO_OUTPUT_LIMIT');
    await assert.rejects(() => fs.stat(preparedPath), error => error.code === 'ENOENT');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('failed conversion removes a partial normalized file', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sea-audio-cleanup-'));
  const sourcePath = path.join(directory, 'input.webm');
  const preparedPath = path.join(directory, 'prepared.flac');
  await fs.writeFile(sourcePath, webmHeader);
  try {
    await assert.rejects(() => prepareAudioForGemini({
      sourcePath,
      sourceMime: 'audio/webm',
      maxDurationSeconds: 60,
      maxOutputBytes: 1024,
      runner: async (_executable, args) => {
        await fs.writeFile(args.at(-1), Buffer.alloc(64));
        const error = new Error('conversion failed');
        error.code = 'AUDIO_CONVERSION_FAILED';
        throw error;
      },
    }), error => error.code === 'AUDIO_CONVERSION_FAILED');
    await assert.rejects(() => fs.stat(preparedPath), error => error.code === 'ENOENT');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('existing WAV preparation remains unchanged', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sea-audio-wav-'));
  const sourcePath = path.join(directory, 'input.wav');
  const header = Buffer.alloc(16);
  header.write('RIFF', 0, 'ascii');
  header.write('WAVE', 8, 'ascii');
  await fs.writeFile(sourcePath, header);
  try {
    const result = await prepareAudioForGemini({
      sourcePath,
      sourceMime: 'audio/wav',
      maxDurationSeconds: 60,
      maxOutputBytes: 1024,
      runner: async () => { throw new Error('FFmpeg must not run for WAV'); },
    });
    assert.deepEqual(result, { audioPath: sourcePath, mimeType: 'audio/wav', converted: false });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('stalled media processes are terminated at the wall-clock limit', async () => {
  await assert.rejects(
    () => runMediaProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 25 }),
    error => error.code === 'AUDIO_CONVERSION_TIMEOUT'
  );
});
