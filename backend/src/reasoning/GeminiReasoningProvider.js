const ReasoningProvider = require('./ReasoningProvider');
const { mapProviderError } = require('../recognition/ProviderErrorMapper');

const SYSTEM = `Use the approved lesson context as the authoritative source for what was taught and supplied.
Do not claim the professor taught something unless the approved context supports it.
You may add mathematical clarification when useful, but integrate it naturally into the lesson and keep provenance separate from student-facing prose.
Never invent professor statements, board content, document content, or lesson events.
Produce crisp, structured content with LaTeX math. Keep source attribution only in sourceReferences; never place source labels, filenames, capture identifiers, OCR labels, transcript chunk labels, or internal IDs in student-readable prose.`;

const referenceSchema = { type: 'array', items: { type: 'string' } };
const materialsSchema = {
  type: 'object',
  properties: {
    materials: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['SUMMARY','NOTES','EXPLANATION','KEY_FORMULAS','WORKED_EXAMPLE','COMMON_MISTAKES'] },
          title: { type: 'string' },
          markdown: { type: 'string' },
          sourceReferences: referenceSchema,
        },
        required: ['type','title','markdown','sourceReferences'],
      },
    },
  },
  required: ['materials'],
};
const quizSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    instructions: { type: 'string' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['MULTIPLE_CHOICE','TRUE_FALSE','PROBLEM_SOLVING'] },
          topic: { type: 'string' },

          prompt: { type: 'string' },
          choices: { type: 'array', items: { type: 'string' } },
          correctAnswer: { type: 'string' },
          explanation: { type: 'string' },
          maxPoints: { type: 'number' },
          problemSettings: { type: 'object', properties: {
            instructions: { type:'string' }, rubric: { type:'string' },
            allowTip: { type:'boolean' }, tip: { type:'string' },
            allowFormula: { type:'boolean' }, formula: { type:'string' },
          }, required:['instructions','rubric','allowTip','tip','allowFormula','formula'] },
          sourceReferences: referenceSchema,
        },
        required: ['type','topic','prompt','choices','correctAnswer','explanation','sourceReferences'],
      },
    },
  },
  required: ['title','instructions','questions'],
};
const solutionReviewSchema = {
  type: 'object',
  properties: {
    assessment: { type: 'string', enum: ['LIKELY_CORRECT','NEEDS_REVIEW','LIKELY_INCORRECT'] },
    summary: { type: 'string' },
    strengths: { type: 'array', items: { type: 'string' } },
    possible_errors: {
      type: 'array',
      items: {
        type: 'object',
        properties: { step: { type: 'string' }, issue: { type: 'string' }, suggestion: { type: 'string' } },
        required: ['step','issue','suggestion'],
      },
    },
    suggested_feedback: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['assessment','summary','strengths','possible_errors','suggested_feedback','confidence'],
};

class GeminiReasoningProvider extends ReasoningProvider {
  constructor({ apiKey, model, timeoutMs }) {
    super();
    this.apiKey = apiKey;
    this.model = model;
    this.timeoutMs = timeoutMs;
    this.client = null;
  }
  async getClient() {
    if (!this.apiKey) {
      const error = new Error('Gemini API key is not configured.');
      error.status = 401;
      throw error;
    }
    if (!this.client) {
      const { GoogleGenAI } = await import('@google/genai');
      this.client = new GoogleGenAI({ apiKey: this.apiKey });
    }
    return this.client;
  }
  async request(context, instruction, schema) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const client = await this.getClient();
      const response = await client.models.generateContent({
        model: this.model,
        contents: [{ role: 'user', parts: [{ text: `${instruction}\n\nAPPROVED LESSON CONTEXT:\n${JSON.stringify(context)}` }] }],
        config: {
          systemInstruction: SYSTEM,
          responseMimeType: 'application/json',
          responseJsonSchema: schema,
          abortSignal: controller.signal,
        },
      });
      return JSON.parse(response.text || '{}');
    } catch (error) { throw mapProviderError(error); }
    finally { clearTimeout(timer); }
  }
  generateMaterials(context) {
    return this.request(context,
      'Create professional university lesson notes grounded only in the approved context. Return only sections supported by that context, using the available material types: Lesson Summary, Detailed Lecture Notes, Concept Explanations, Key Formulas, Worked Example, and Common Mistakes and Reminders. The summary must be 2–4 sentences. Return every material title as plain text without numbering, Markdown # markers, or emphasis. Inside material markdown, use predictable unnumbered headings such as ## Lesson Summary, ## Detailed Lecture Notes, and ## Concept Explanations where those sections apply. Never combine a list number with a Markdown heading. In the notes, organize major concepts with unnumbered semantic Markdown headings and use the labels Concept, Formula or Definition, Example, Solution or Explanation, and Key Point only where the approved context supports them. End with concise key takeaways; add formulas, common mistakes, or review points only when supported. Use semantic Markdown, proper lists, separate paragraphs, and correctly delimited LaTeX. Do not emit escaped newline/tab text, code fences, JSON fragments, filenames, capture labels, OCR labels, transcript chunk labels, internal IDs, or source attribution in academic prose. Preserve provenance only in sourceReferences. Do not fabricate examples or filler. Integrate any useful mathematical clarification naturally without governance-style labels or disclaimers.',
      materialsSchema);
  }
  generateQuiz(context, { questionCount = 10, difficulty, specification = {}, repair = false } = {}) {
    const guidance = {
      EASY: 'Use direct recall, one-step computations, and straightforward applications.',
      MEDIUM: 'Use normal classroom assessment, moderate multi-step work, and plausible distractors.',
      HARD: 'Use deeper multi-step application and combine only concepts present in the approved lesson. Do not use tricks or untaught topics.',
    }[difficulty];
    const repairInstruction = repair
      ? ' This is a validation repair attempt. Return the complete quiz again, correct every schema/count/choice/answer/source-reference issue, and do not include partial output or commentary.'
      : '';
    const typeInstruction = specification.questionTypes
      ? `Follow this exact per-question type order: ${JSON.stringify(specification.questionTypes)}. For PROBLEM_SOLVING, require a handwritten solution, supply positive maxPoints and problemSettings with instructions and an instructor-only expected solution/rubric. Use choices=[], correctAnswer="", explanation="". Set allowTip=${Boolean(specification.allowTip)} and allowFormula=${Boolean(specification.allowFormula)}. When enabled, generate and store a short guiding tip and a formula/reference now. The tip and formula must not give away the answer or a full worked solution. Never put the rubric/expected solution in the question stem, instructions, tip, or formula.`
      : 'Use only MULTIPLE_CHOICE and TRUE_FALSE.';
    return this.request(context,
      `Create exactly ${questionCount} instructor-reviewable questions at the instructor-selected ${difficulty} difficulty. ${guidance}${repairInstruction} Create a concise, academically natural quiz title based on the actual lesson topics, preferably 3–8 words. Use a normal title such as "Quiz: Indefinite Integration" or "Review Quiz: Calculus and Algebra". Never include Easy, Medium, Hard, AI-generated, assessment level, filenames, source labels, or exaggerated wording in the title. Difficulty must affect question complexity only. Keep instructions brief and natural, preferably "Answer all ${questionCount} questions." ${typeInstruction} For every MULTIPLE_CHOICE question return exactly four distinct choices and exactly one answer that matches a choice. Set topic to one concise concept label supported by the cited approved source; use an empty topic only when no reliable concept label exists. Every question must cite at least one approved sourceReference. Keep sourceReferences separate from prompt wording and never mention whiteboard pages, filenames, uploads, OCR, or transcript chunks in questions or explanations. Keep explanations accurate and concise (1–3 sentences). Use one predictable math representation in every prompt, choice, correctAnswer, and explanation: normal prose with inline LaTeX inside $...$ delimiters, for example $\\lim_{x\\to1}P(x)$. After JSON decoding, each LaTeX command must have exactly one backslash. Never escape a math delimiter as \\$ and never add currency-style dollar signs inside a math fragment. Do not alternate between raw LaTeX, \\( ... \\), or Unicode-only equations. Do not wrap fields in code fences.`,
      quizSchema);
  }
  reviewSolution(input) {
    return this.request(input,
      'Provide an advisory review for the instructor of exactly one student solution. Evaluate the visible mathematical process, not only the final answer. Use the activity problem and instructor rubric or expected solution as the strongest reference. Treat OCR text marked uncertain as uncertain and never invent missing student steps. Identify the specific extracted step when describing a possible error. Do not assign a grade, score, points, pass/fail decision, or official outcome. Keep the response concise and allow NEEDS_REVIEW when the evidence is incomplete.',
      solutionReviewSchema);
  }
}

module.exports = GeminiReasoningProvider;
