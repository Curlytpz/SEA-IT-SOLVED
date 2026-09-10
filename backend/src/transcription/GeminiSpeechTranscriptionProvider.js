const SpeechTranscriptionProvider = require('./SpeechTranscriptionProvider');
const { geminiTranscriptionJsonSchema } = require('./transcriptionSchema');
const { normalizeTranscription } = require('./transcriptionNormalizer');
const { TranscriptionProviderError, mapTranscriptionError } = require('./transcriptionErrorMapper');

const SYSTEM_INSTRUCTION = `You are a strict speech transcription engine.
Transcribe only speech actually audible in the supplied lesson recording.
Never summarize, explain, solve, rewrite, correct, translate, or add content.
Preserve English, Filipino, Taglish, technical terms, variables, and spoken equations as spoken.
Return timestamped segments relative to the playable audio timeline in integer milliseconds.
Mark a segment uncertain only when speech is genuinely unclear, and state a brief reason.
Do not invent confidence values. Return only the requested structured transcription.`;

const USER_INSTRUCTION = `Transcribe the complete recording in chronological order.
Keep the original spoken language, wording, mistakes, repetitions, variables, and equations.
Do not turn the transcript into notes and do not infer missing speech.`;

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

class GeminiSpeechTranscriptionProvider extends SpeechTranscriptionProvider {
  constructor({ apiKey, model, timeoutMs, filePollIntervalMs, fileReadyTimeoutMs }) {
    super();
    this.apiKey = apiKey;
    this.model = model;
    this.timeoutMs = timeoutMs;
    this.filePollIntervalMs = filePollIntervalMs;
    this.fileReadyTimeoutMs = fileReadyTimeoutMs;
    this.client = null;
  }

  async getClient() {
    if (!this.apiKey) throw new TranscriptionProviderError('PROVIDER_AUTH_FAILED', 'Gemini API key is not configured.', false);
    if (!this.client) {
      const { GoogleGenAI } = await import('@google/genai');
      this.client = new GoogleGenAI({ apiKey: this.apiKey });
    }
    return this.client;
  }

  async waitForActive(client, uploaded) {
    const deadline = Date.now() + this.fileReadyTimeoutMs;
    let file = uploaded;
    while (String(file.state || '').toUpperCase() === 'PROCESSING') {
      if (Date.now() >= deadline) throw new TranscriptionProviderError('PROVIDER_TIMEOUT', 'The transcription upload timed out.', true);
      await wait(this.filePollIntervalMs);
      file = await client.files.get({ name: uploaded.name });
    }
    if (String(file.state || '').toUpperCase() === 'FAILED' || !file.uri) {
      throw new TranscriptionProviderError('UNSUPPORTED_AUDIO', 'The transcription service could not prepare this recording.', false);
    }
    return file;
  }

  async transcribe({ audioPath, mimeType, durationMs }) {
    let remoteFile;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const client = await this.getClient();
      remoteFile = await client.files.upload({
        file: audioPath,
        config: { mimeType, displayName: 'lesson-audio-transcription' },
      });
      remoteFile = await this.waitForActive(client, remoteFile);
      const response = await client.models.generateContent({
        model: this.model,
        contents: [{
          role: 'user',
          parts: [
            { fileData: { fileUri: remoteFile.uri, mimeType: remoteFile.mimeType || mimeType } },
            { text: USER_INSTRUCTION },
          ],
        }],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseJsonSchema: geminiTranscriptionJsonSchema,
          abortSignal: controller.signal,
        },
      });
      if (!response.text) throw new TranscriptionProviderError('PROVIDER_BLOCKED', 'The transcription provider returned no content.', false);
      let parsed;
      try { parsed = JSON.parse(response.text); }
      catch (error) { error.code = 'INVALID_PROVIDER_OUTPUT'; throw error; }
      return {
        normalized: normalizeTranscription(parsed, durationMs),
        sanitizedOutput: parsed,
        providerVersion: this.model,
      };
    } catch (error) {
      throw mapTranscriptionError(error);
    } finally {
      clearTimeout(timeout);
      if (remoteFile?.name) {
        try { await (await this.getClient()).files.delete({ name: remoteFile.name }); }
        catch (error) { console.warn(`[Transcription] Unable to delete temporary Gemini file: ${error.message}`); }
      }
    }
  }
}

module.exports = GeminiSpeechTranscriptionProvider;
