const { z } = require('zod');

const segmentSchema = z.object({
  order: z.number().int().min(0).max(100000),
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
  language: z.string().max(64).nullable(),
  text: z.string().max(10000),
  uncertain: z.boolean(),
  uncertaintyReason: z.string().max(1000).nullable(),
}).strict().superRefine((segment, context) => {
  if (segment.endMs < segment.startMs) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['endMs'], message: 'Segment end must follow its start.' });
  }
  if (!segment.text.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['text'], message: 'Segments require spoken text.' });
  }
  if (segment.uncertain && !segment.uncertaintyReason?.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['uncertaintyReason'], message: 'Uncertain segments require a reason.' });
  }
});

const transcriptionSchema = z.object({
  language: z.string().max(64).nullable(),
  transcriptText: z.string().max(500000),
  segments: z.array(segmentSchema).max(10000),
  warnings: z.array(z.string().max(1000)).max(100),
}).strict();

const nullableString = { type: ['string', 'null'] };
const geminiTranscriptionJsonSchema = {
  type: 'object',
  required: ['language', 'transcriptText', 'segments', 'warnings'],
  properties: {
    language: nullableString,
    transcriptText: { type: 'string' },
    segments: {
      type: 'array',
      items: {
        type: 'object',
        required: ['order', 'startMs', 'endMs', 'language', 'text', 'uncertain', 'uncertaintyReason'],
        properties: {
          order: { type: 'integer', minimum: 0 },
          startMs: { type: 'integer', minimum: 0 },
          endMs: { type: 'integer', minimum: 0 },
          language: nullableString,
          text: { type: 'string' },
          uncertain: { type: 'boolean' },
          uncertaintyReason: nullableString,
        },
      },
    },
    warnings: { type: 'array', items: { type: 'string' } },
  },
};

module.exports = { transcriptionSchema, geminiTranscriptionJsonSchema };
