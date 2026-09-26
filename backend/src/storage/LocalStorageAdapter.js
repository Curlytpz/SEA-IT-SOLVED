const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { pipeline } = require('stream/promises');
const StorageProvider = require('./StorageProvider');

class LocalStorageAdapter extends StorageProvider {
  constructor(root = process.env.CAPTURE_STORAGE_PATH || path.resolve(__dirname, '../../storage/captures')) {
    super();
    this.root = path.resolve(root);
  }

  resolveKey(key) {
    const normalized = String(key || '').replace(/\\/g, '/').replace(/^\/+/, '');
    const target = path.resolve(this.root, normalized);
    if (target !== this.root && !target.startsWith(`${this.root}${path.sep}`)) {
      throw new Error('Invalid storage key.');
    }
    return target;
  }

  async put(key, buffer) {
    const target = this.resolveKey(key);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, buffer, { flag: 'wx' });
    return key;
  }

  async putFile(key, sourcePath) {
    const target = this.resolveKey(key);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    try {
      await pipeline(fs.createReadStream(sourcePath), fs.createWriteStream(target, { flags: 'wx' }));
      return key;
    } catch (error) {
      await fsp.rm(target, { force: true });
      throw error;
    }
  }

  async open(key) {
    const target = this.resolveKey(key);
    const stat = await fsp.stat(target);
    return { stream: fs.createReadStream(target), size: stat.size };
  }

  async delete(key) {
    if (!key) return;
    const target = this.resolveKey(key);
    await fsp.rm(target, { force: true });
  }
}

module.exports = LocalStorageAdapter;
