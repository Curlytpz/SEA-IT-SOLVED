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

function runFfmpeg(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { shell: false, windowsHide: true });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-8000); });
    child.once('error', error => {
      error.code = error.code === 'ENOENT' ? 'FFMPEG_NOT_FOUND' : 'AUDIO_CONVERSION_FAILED';
      reject(error);
    });
    child.once('close', code => {
      if (code === 0) return resolve();
      const error = new Error(`FFmpeg exited with code ${code}: ${stderr}`);
      error.code = 'AUDIO_CONVERSION_FAILED';
      reject(error);
    });
  });
}

async function prepareAudioForGemini({ sourcePath, sourceMime, ffmpegPath }) {
  const detected = await verifyStoredAudio(sourcePath, sourceMime);
  if (detected === 'audio/wav') return { audioPath: sourcePath, mimeType: 'audio/wav', converted: false };
  const outputPath = path.join(path.dirname(sourcePath), 'prepared.flac');
  // Accept a quoted executable path (including spaces), never shell arguments.
  // Bare executable names are resolved by the OS through PATH.
  let executable = String(ffmpegPath || 'ffmpeg').trim().replace(/^"(.*)"$/, '$1') || 'ffmpeg';
  if (!path.isAbsolute(executable) && /[/\\]/.test(executable)) executable = path.resolve(__dirname, '../..', executable);
  await runFfmpeg(executable, ['-hide_banner', '-loglevel', 'error', '-y', '-i', sourcePath, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'flac', outputPath]);
  return { audioPath: outputPath, mimeType: 'audio/flac', converted: true };
}

module.exports = { prepareAudioForGemini };
