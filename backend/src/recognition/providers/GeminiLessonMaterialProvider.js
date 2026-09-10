const GeminiWhiteboardProvider = require('./GeminiWhiteboardProvider');
const { RecognitionProviderError, mapProviderError } = require('../ProviderErrorMapper');

const PDF_SYSTEM = `You extract lesson source material page by page.
Transcribe only content present in the PDF. Preserve mathematical notation in LaTeX when practical.
Do not solve, correct, summarize, or infer missing content. Preserve page order and mark uncertain visual interpretation.`;

const pdfSchema = {
  type: 'object',
  properties: {
    pages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          pageNumber: { type: 'integer' },
          text: { type: 'string' },
          mathExpressions: { type: 'array', items: { type: 'string' } },
          uncertain: { type: 'boolean' },
        },
        required: ['pageNumber', 'text', 'mathExpressions', 'uncertain'],
      },
    },
  },
  required: ['pages'],
};

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

class GeminiLessonMaterialProvider {
  constructor(options) {
    this.options = options;
    this.imageProvider = new GeminiWhiteboardProvider(options);
    this.client = null;
  }

  async getClient() {
    if (!this.options.apiKey) throw new RecognitionProviderError('PROVIDER_AUTH_FAILED', 'Gemini API key is not configured.', false);
    if (!this.client) {
      const { GoogleGenAI } = await import('@google/genai');
      this.client = new GoogleGenAI({ apiKey: this.options.apiKey });
    }
    return this.client;
  }

  async extractImage(buffer, mimeType) {
    const result = await this.imageProvider.extract({ imageBuffer: buffer, mimeType });
    return {
      plainText: result.normalized.plainText || '',
      mathExpressions: result.normalized.mathExpressions || [],
      pages: [{ pageNumber: 1, text: result.normalized.plainText || '', mathExpressions: result.normalized.mathExpressions || [], uncertain: Boolean(result.normalized.uncertain) }],
      raw: result.sanitizedOutput,
      providerVersion: result.providerVersion,
    };
  }

  async extractPdf(buffer, nativePages) {
    const visualPages = nativePages.filter(page => !page.reliable).map(page => page.pageNumber);
    if (!visualPages.length) {
      return {
        plainText: nativePages.map(page => page.text).join('\n\n'),
        mathExpressions: [],
        pages: nativePages.map(page => ({ ...page, mathExpressions: [], uncertain: false, extraction: 'NATIVE_TEXT' })),
        raw: { strategy: 'NATIVE_TEXT', visualPages: [] },
        providerVersion: 'native-pdf-text',
      };
    }

    let remote;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      const client = await this.getClient();
      remote = await client.files.upload({
        file: new Blob([buffer], { type: 'application/pdf' }),
        config: { mimeType: 'application/pdf', displayName: 'lesson-material.pdf' },
      });
      const deadline = Date.now() + (this.options.fileReadyTimeoutMs || 120000);
      while (String(remote.state || '').toUpperCase() === 'PROCESSING') {
        if (Date.now() >= deadline) throw new RecognitionProviderError('PROVIDER_TIMEOUT', 'The PDF took too long to prepare.', true);
        await wait(this.options.filePollIntervalMs || 2000);
        remote = await client.files.get({ name: remote.name });
      }
      if (!remote.uri) throw new RecognitionProviderError('UNSUPPORTED_INPUT', 'The PDF could not be prepared.', false);
      const response = await client.models.generateContent({
        model: this.options.model,
        contents: [{
          role: 'user',
          parts: [
            { fileData: { fileUri: remote.uri, mimeType: 'application/pdf' } },
            { text: `Extract every page, with special visual attention to pages ${visualPages.join(', ')}. Return exactly ${nativePages.length} ordered page entries.` },
          ],
        }],
        config: {
          systemInstruction: PDF_SYSTEM,
          responseMimeType: 'application/json',
          responseJsonSchema: pdfSchema,
          mediaResolution: this.options.mediaResolution,
          abortSignal: controller.signal,
        },
      });
      const parsed = JSON.parse(response.text || '{}');
      const byPage = new Map((parsed.pages || []).map(page => [Number(page.pageNumber), page]));
      const pages = nativePages.map(native => {
        const visual = byPage.get(native.pageNumber) || {};
        return native.reliable
          ? { pageNumber: native.pageNumber, text: native.text, mathExpressions: visual.mathExpressions || [], uncertain: false, extraction: 'NATIVE_TEXT' }
          : { pageNumber: native.pageNumber, text: visual.text || native.text || '', mathExpressions: visual.mathExpressions || [], uncertain: Boolean(visual.uncertain), extraction: 'GEMINI_VISUAL' };
      });
      return {
        plainText: pages.map(page => page.text).filter(Boolean).join('\n\n'),
        mathExpressions: pages.flatMap(page => page.mathExpressions || []),
        pages,
        raw: { strategy: 'HYBRID', visualPages, provider: parsed },
        providerVersion: this.options.model,
      };
    } catch (error) {
      throw mapProviderError(error);
    } finally {
      clearTimeout(timeout);
      if (remote?.name && this.client) await this.client.files.delete({ name: remote.name }).catch(() => {});
    }
  }
}

module.exports = GeminiLessonMaterialProvider;
