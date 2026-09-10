const { z } = require('zod');
const geminiInteractive = require('./geminiInteractive.service');
const GeminiWhiteboardProvider = require('../recognition/providers/GeminiWhiteboardProvider');
const GeminiReasoningProvider = require('../reasoning/GeminiReasoningProvider');
const {
  GEMINI_API_KEY, GEMINI_MODEL, GEMINI_MEDIA_RESOLUTION, RECOGNITION_PROVIDER_TIMEOUT_MS,
  GEMINI_REASONING_MODEL, SOLUTION_REVIEW_CONTEXT_MAX_CHARS,
} = require('../config/env');

const recognitionProvider = new GeminiWhiteboardProvider({
  apiKey: GEMINI_API_KEY, model: GEMINI_MODEL, mediaResolution: GEMINI_MEDIA_RESOLUTION,
  timeoutMs: RECOGNITION_PROVIDER_TIMEOUT_MS,
});
const reviewProvider = new GeminiReasoningProvider({
  apiKey: GEMINI_API_KEY, model: GEMINI_REASONING_MODEL, timeoutMs: RECOGNITION_PROVIDER_TIMEOUT_MS,
});

const reviewSchema = z.object({
  assessment: z.enum(['LIKELY_CORRECT','NEEDS_REVIEW','LIKELY_INCORRECT']),
  summary: z.string().trim().min(1).max(4000),
  strengths: z.array(z.string().trim().min(1).max(1000)).max(12),
  possible_errors: z.array(z.object({
    step: z.string().trim().max(1000), issue: z.string().trim().min(1).max(1500), suggestion: z.string().trim().max(1500),
  }).strict()).max(12),
  suggested_feedback: z.string().trim().max(4000),
  confidence: z.number().min(0).max(1),
}).strict();

const clean = (value, max) => String(value ?? '').normalize('NFC').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);

async function recognizeImage(imageBuffer, mimeType) {
  const result = await geminiInteractive.run(
    () => recognitionProvider.extract({ imageBuffer, mimeType }),
    { unavailable: 'Solution recognition is temporarily unavailable.', invalidOutput: 'The uploaded solution could not be recognized safely.' },
    { label: 'SolutionOCR', model: GEMINI_MODEL }
  );
  return result.normalized;
}


function approvedExcerpt(context) {
  if (!context || SOLUTION_REVIEW_CONTEXT_MAX_CHARS <= 0) return '';
  return context.chunks.filter(chunk => !chunk.uncertain).map(chunk => {
    const math = (chunk.math || []).slice(0, 8).join('; ');
    return [clean(chunk.text, 1800), math].filter(Boolean).join('\n');
  }).filter(Boolean).join('\n\n').slice(0, SOLUTION_REVIEW_CONTEXT_MAX_CHARS);
}

async function defaultReview(input) {
  return geminiInteractive.run(() => reviewProvider.reviewSolution(input),
    { unavailable: 'AI is temporarily unavailable. Please try again.', invalidOutput: 'AI returned an invalid advisory review. Please try again.' },
    { label: 'SolutionAI', model: GEMINI_REASONING_MODEL });
}


module.exports = { recognizeImage, defaultReview, approvedExcerpt, reviewSchema };
