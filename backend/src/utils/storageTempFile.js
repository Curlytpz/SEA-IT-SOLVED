const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');

async function materializeStorageFile(storage, storageKey, extension, configuredRoot = '') {
  const root = configuredRoot ? path.resolve(configuredRoot) : os.tmpdir();
  await fsp.mkdir(root, { recursive: true });
  const directory = await fsp.mkdtemp(path.join(root, 'sea-transcription-'));
  const sourcePath = path.join(directory, `source.${String(extension).replace(/[^a-z0-9]/gi, '') || 'bin'}`);
  const opened = await storage.open(storageKey);
  await pipeline(opened.stream, fs.createWriteStream(sourcePath, { flags: 'wx' }));
  return { directory, sourcePath, size: opened.size };
}

async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(filePath), hash);
  return hash.digest('hex');
}

async function cleanupTemporaryDirectory(directory) {
  if (directory) await fsp.rm(directory, { recursive: true, force: true }).catch(() => {});
}

module.exports = { materializeStorageFile, sha256File, cleanupTemporaryDirectory };
