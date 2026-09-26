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
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', sourcePath,
    ], { timeoutMs, maxStdoutBytes: 1024, maxStderrBytes: 4096 });
  } catch (error) {
    if (error.code === 'MEDIA_TOOL_NOT_FOUND') error.code = 'FFPROBE_NOT_FOUND';
    throw error;
  }
  const { stdout } = result;
  const seconds = Number(String(stdout || '').trim());
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
  try { await runner(executable, args, {
    timeoutMs,
    onTick: async () => {
      const stat = await fs.stat(outputPath).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
      if (stat && stat.size > maxOutputBytes) {
        const error = new Error('Prepared audio exceeded its size limit.');
        error.code = 'AUDIO_OUTPUT_LIMIT';
        throw error;
      }
    },
  }); } catch (error) {
    if (error.code === 'MEDIA_TOOL_NOT_FOUND') error.code = 'FFMPEG_NOT_FOUND';
    throw error;
  }
  const stat = await fs.stat(outputPath);
  if (stat.size > maxOutputBytes) {
    const error = new Error('Prepared audio exceeded its size limit.');
    error.code = 'AUDIO_OUTPUT_LIMIT';
    throw error;
  }
  return { audioPath: outputPath, mimeType: 'audio/flac', converted: true };
}

module.exports = { prepareAudioForGemini, probeAudioDuration, runMediaProcess };
