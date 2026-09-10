class SpeechTranscriptionProvider {
  async transcribe(_input) {
    throw new Error('SpeechTranscriptionProvider.transcribe must be implemented.');
  }
}

module.exports = SpeechTranscriptionProvider;
