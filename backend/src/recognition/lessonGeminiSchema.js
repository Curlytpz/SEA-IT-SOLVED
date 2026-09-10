const { z } = require('zod');

const boundsSchema = z.object({
  x: z.number().min(0).max(1), y: z.number().min(0).max(1),
  width: z.number().positive().max(1), height: z.number().positive().max(1),
}).strict().refine(value => value.x + value.width <= 1.001 && value.y + value.height <= 1.001);

const blockSchema = z.object({
  type: z.enum(['text', 'math']), order: z.number().int().min(0).max(10000),
  text: z.string().max(10000).nullable(), latex: z.string().max(10000).nullable(),
  uncertain: z.boolean(), uncertaintyReason: z.string().max(1000).nullable(),
  bounds: boundsSchema.nullable(),
}).strict();

const pageSchema = z.object({
  pageNumber: z.number().int().positive().max(1000),
  plainText: z.string().max(50000),
  blocks: z.array(blockSchema).max(500),
  warnings: z.array(z.string().max(1000)).max(50),
}).strict();

const lessonCompilationSchema = z.object({
  pages: z.array(pageSchema).min(1).max(1000),
  warnings: z.array(z.string().max(1000)).max(100),
}).strict();

const nullableString = { type: ['string', 'null'] };
const nullableBounds = { type: ['object', 'null'], required: ['x','y','width','height'], properties: {
  x:{type:'number',minimum:0,maximum:1}, y:{type:'number',minimum:0,maximum:1},
  width:{type:'number',minimum:0,maximum:1}, height:{type:'number',minimum:0,maximum:1},
} };
const blockJsonSchema = { type:'object', required:['type','order','text','latex','uncertain','uncertaintyReason','bounds'], properties:{
  type:{type:'string',enum:['text','math']}, order:{type:'integer'}, text:nullableString, latex:nullableString,
  uncertain:{type:'boolean'}, uncertaintyReason:nullableString, bounds:nullableBounds,
} };
const geminiLessonJsonSchema = { type:'object', required:['pages','warnings'], properties:{
  pages:{type:'array',items:{type:'object',required:['pageNumber','plainText','blocks','warnings'],properties:{
    pageNumber:{type:'integer',minimum:1}, plainText:{type:'string'}, blocks:{type:'array',items:blockJsonSchema},
    warnings:{type:'array',items:{type:'string'}},
  }}}, warnings:{type:'array',items:{type:'string'}},
} };

module.exports = { lessonCompilationSchema, geminiLessonJsonSchema };
