class StorageProvider {
  async put(_key, _buffer) { throw new Error('StorageProvider.put must be implemented.'); }
  async putFile(_key, _sourcePath) { throw new Error('StorageProvider.putFile must be implemented.'); }
  async stat(_key) { throw new Error('StorageProvider.stat must be implemented.'); }
  async open(_key, _options) { throw new Error('StorageProvider.open must be implemented.'); }
  async delete(_key) { throw new Error('StorageProvider.delete must be implemented.'); }
}

module.exports = StorageProvider;
