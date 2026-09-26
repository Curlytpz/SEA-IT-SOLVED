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

const nullableString = { type: ['string', 'null'], maxLength:10000 };
const nullableBounds = { type: ['object', 'null'], required: ['x','y','width','height'], properties: {
  x:{type:'number',minimum:0,maximum:1}, y:{type:'number',minimum:0,maximum:1},
  width:{type:'number',exclusiveMinimum:0,maximum:1}, height:{type:'number',exclusiveMinimum:0,maximum:1},
}, additionalProperties:false };
const blockJsonSchema = { type:'object', required:['type','order','text','latex','uncertain','uncertaintyReason','bounds'], properties:{
  type:{type:'string',enum:['text','math']}, order:{type:'integer',minimum:0,maximum:10000}, text:nullableString, latex:nullableString,
  uncertain:{type:'boolean'}, uncertaintyReason:{type:['string','null'],maxLength:1000}, bounds:nullableBounds,
}, additionalProperties:false };
const geminiLessonJsonSchema = { type:'object', required:['pages','warnings'], properties:{
  pages:{type:'array',minItems:1,maxItems:1000,items:{type:'object',required:['pageNumber','plainText','blocks','warnings'],properties:{
    pageNumber:{type:'integer',minimum:1,maximum:1000}, plainText:{type:'string',maxLength:50000}, blocks:{type:'array',maxItems:500,items:blockJsonSchema},
    warnings:{type:'array',maxItems:50,items:{type:'string',maxLength:1000}},
  },additionalProperties:false}}, warnings:{type:'array',maxItems:100,items:{type:'string',maxLength:1000}},
}, additionalProperties:false };

module.exports = { lessonCompilationSchema, geminiLessonJsonSchema };
