const fs = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const { detectAudioMime } = require('./audioFile');

async function verifyStoredAudio(filePath, expectedMime) {
  const handle = await fs.open(filePath, 'r');
  try {
    const header = Buffer.alloc(16);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    const detected = detectAudioMime(header.subarray(0, bytesRead));
    const normalizedExpected = String(expectedMime || '').split(';')[0].toLowerCase().replace('audio/x-wav', 'audio/wav');
    if (!detected || detected !== normalizedExpected) {
      const error = new Error('Stored audio signature does not match its metadata.');
      error.code = 'UNSUPPORTED_AUDIO';
      throw error;
    }
    return detected;
  } finally { await handle.close(); }
}

function normalizedExecutable(value, fallback) {
  let executable = String(value || fallback).trim().replace(/^"(.*)"$/, '$1') || fallback;
  if (!path.isAbsolute(executable) && /[/\\]/.test(executable)) executable = path.resolve(__dirname, '../..', executable);
  return executable;
}

function runMediaProcess(executable, args, { timeoutMs = 600000, maxStdoutBytes = 65536, maxStderrBytes = 8192, onTick } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { shell: false, windowsHide: true });
    let stdout = '', stderr = '', settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearInterval(watchdog);
      if (error) reject(error); else resolve(value);
    };
    child.stdout.on('data', chunk => { stdout = `${stdout}${chunk}`.slice(-maxStdoutBytes); });
    child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-maxStderrBytes); });
    child.once('error', error => {
      error.code = error.code === 'ENOENT' ? 'MEDIA_TOOL_NOT_FOUND' : 'AUDIO_CONVERSION_FAILED';
      finish(error);
    });
    child.once('close', code => {
      if (settled) return;
      if (code === 0) return finish(null, { stdout, stderr });
      const error = new Error(`FFmpeg exited with code ${code}: ${stderr}`);
      error.code = 'AUDIO_CONVERSION_FAILED';
      finish(error);
    });
    const timeout = setTimeout(() => {
      const error = new Error('Media processing exceeded its time limit.');
      error.code = 'AUDIO_CONVERSION_TIMEOUT';
      child.kill('SIGKILL');
      finish(error);
    }, timeoutMs);
    const watchdog = onTick ? setInterval(async () => {
      try { await onTick(child); } catch (error) { child.kill('SIGKILL'); finish(error); }
    }, 250) : null;
  });
}

async function probeAudioDuration({ sourcePath, ffprobePath, timeoutMs = 30000, runner = runMediaProcess }) {
  const executable = normalizedExecutable(ffprobePath, 'ffprobe');
  let result;
  try {
    result = await runner(executable, [
      '-v', 'error', '-select_streams', 'a', '-show_entries', 'format=duration:stream=codec_type,duration', '-of', 'json', sourcePath,
    ], { timeoutMs, maxStdoutBytes: 16384, maxStderrBytes: 4096 });
  } catch (error) {
    if (error.code === 'MEDIA_TOOL_NOT_FOUND') error.code = 'FFPROBE_NOT_FOUND';
    else if (error.code === 'AUDIO_CONVERSION_FAILED') error.code = 'AUDIO_DURATION_PROBE_FAILED';
    throw error;
  }
  let metadata;
  try {
    metadata = JSON.parse(String(result.stdout || ''));
  } catch {
    metadata = null;
  }
  const candidates = [
    metadata?.format?.duration,
    ...(Array.isArray(metadata?.streams)
      ? metadata.streams.filter(stream => !stream?.codec_type || stream.codec_type === 'audio').map(stream => stream.duration)
      : []),
  ];
  const seconds = candidates.map(Number).find(value => Number.isFinite(value) && value > 0);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    const error = new Error('The recording duration could not be determined.');
    error.code = 'AUDIO_DURATION_PROBE_FAILED';
    throw error;
  }
  return Math.ceil(seconds * 1000);
}

async function prepareAudioForGemini({ sourcePath, sourceMime, ffmpegPath, maxDurationSeconds, timeoutMs = 600000, maxOutputBytes = 1024 * 1024 * 1024, runner = runMediaProcess }) {
  const detected = await verifyStoredAudio(sourcePath, sourceMime);
  if (detected === 'audio/wav') {
    const source = await fs.stat(sourcePath);
    if (source.size > maxOutputBytes) {
      const error = new Error('Prepared audio exceeded its size limit.');
      error.code = 'AUDIO_OUTPUT_LIMIT';
      throw error;
    }
    return { audioPath: sourcePath, mimeType: 'audio/wav', converted: false };
  }
  const outputPath = path.join(path.dirname(sourcePath), 'prepared.flac');
  const executable = normalizedExecutable(ffmpegPath, 'ffmpeg');
  const args = ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', sourcePath];
  if (Number.isFinite(maxDurationSeconds) && maxDurationSeconds > 0) args.push('-t', String(maxDurationSeconds));
  args.push('-vn', '-ac', '1', '-ar', '16000', '-c:a', 'flac', outputPath);
  try {
    await runner(executable, args, {
      timeoutMs,
      onTick: async () => {
        const stat = await fs.stat(outputPath).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
        if (stat && stat.size > maxOutputBytes) {
          const error = new Error('Prepared audio exceeded its size limit.');
          error.code = 'AUDIO_OUTPUT_LIMIT';
          throw error;
        }
      },
    });
  } catch (error) {
    await fs.rm(outputPath, { force: true }).catch(() => {});
    if (error.code === 'MEDIA_TOOL_NOT_FOUND') error.code = 'FFMPEG_NOT_FOUND';
    throw error;
  }
  let stat;
  try {
    stat = await fs.stat(outputPath);
    if (stat.size > maxOutputBytes) {
      const error = new Error('Prepared audio exceeded its size limit.');
      error.code = 'AUDIO_OUTPUT_LIMIT';
      throw error;
    }
  } catch (error) {
    await fs.rm(outputPath, { force: true }).catch(() => {});
    throw error;
  }
  return { audioPath: outputPath, mimeType: 'audio/flac', converted: true };
}

async function verifyAudioForTranscription({
  sourcePath,
  sourceMime,
  ffprobePath,
  ffmpegPath,
  probeTimeoutMs = 30000,
  ffmpegTimeoutMs = 600000,
  maxDurationSeconds,
  maxOutputBytes,
  referenceDurationMs,
  runner = runMediaProcess,
  onStage = () => {},
}) {
  let durationMs;
  try {
    durationMs = await probeAudioDuration({ sourcePath, ffprobePath, timeoutMs: probeTimeoutMs, runner });
    return { durationMs, preparedAudio: null };
  } catch (error) {
    if (error.code !== 'AUDIO_DURATION_PROBE_FAILED') throw error;
    onStage('FFPROBE_METADATA_DURATION_UNAVAILABLE', error.code);
  }

  const normalizedMime = String(sourceMime || '').split(';')[0].trim().toLowerCase();
  if (normalizedMime !== 'audio/webm') {
    const error = new Error('The recording duration could not be determined.');
    error.code = 'AUDIO_DURATION_PROBE_FAILED';
    throw error;
  }

  let preparedAudio;
  try {
    const verificationDurationLimit = Number.isFinite(maxDurationSeconds) && maxDurationSeconds > 0
      ? maxDurationSeconds + 1
      : maxDurationSeconds;
    preparedAudio = await prepareAudioForGemini({
      sourcePath,
      sourceMime,
      ffmpegPath,
      maxDurationSeconds: verificationDurationLimit,
      timeoutMs: ffmpegTimeoutMs,
      maxOutputBytes,
      runner,
    });
  } catch (error) {
    if (error.code === 'AUDIO_CONVERSION_FAILED') {
      const decodeError = new Error('The recording does not contain valid decodable audio.');
      decodeError.code = 'AUDIO_DECODE_INVALID';
      decodeError.audioStage = 'AUDIO_DECODE_INVALID';
      decodeError.cause = error;
      onStage(decodeError.audioStage, decodeError.code);
      throw decodeError;
    }
    error.audioStage = 'FFMPEG_NORMALIZATION_FAILED';
    onStage(error.audioStage, error.code);
    throw error;
  }

  try {
    durationMs = await probeAudioDuration({
      sourcePath: preparedAudio.audioPath,
      ffprobePath,
      timeoutMs: probeTimeoutMs,
      runner,
    });
  } catch (cause) {
    if (preparedAudio.converted) {
      await fs.rm(preparedAudio.audioPath, { force: true }).catch(() => {});
    }
    const error = new Error('The normalized recording duration could not be determined.');
    error.code = 'AUDIO_DURATION_PROBE_FAILED';
    error.audioStage = 'NORMALIZED_DURATION_UNAVAILABLE';
    error.cause = cause;
    onStage(error.audioStage, cause?.code);
    throw error;
  }

  const reference = Number(referenceDurationMs);
  if (Number.isFinite(reference) && reference > 0) {
    const difference = Math.abs(reference - durationMs);
    if (difference > Math.max(5000, durationMs * 0.5)) {
      onStage('DURATION_REFERENCE_MISMATCH', 'REFERENCE_ONLY');
    }
  }
  return { durationMs, preparedAudio };
}

module.exports = {
  prepareAudioForGemini,
  probeAudioDuration,
  runMediaProcess,
  verifyAudioForTranscription,
};
