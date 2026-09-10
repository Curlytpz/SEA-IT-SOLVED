const LessonChatProvider = require('./LessonChatProvider');
const { mapProviderError } = require('../recognition/ProviderErrorMapper');

const SYSTEM = `Use the approved lesson context as the authoritative lesson source.
If asked what the professor taught, answer only from that approved context.
Integrate additional mathematical explanation naturally and keep provenance in sourceReferences rather than student-facing prose.
Never invent professor statements, board work, transcript content, uploaded-image content, PDF content, or lesson events.
Use only supplied human-readable source labels. Never return database identifiers.`;

const references = { type: 'array', items: { type: 'string' } };
const answerSchema = {
  type: 'object',
  properties: { answer: { type: 'string' }, sourceReferences: references },
  required: ['answer', 'sourceReferences'],
};
const editSchema = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['UPDATE_SECTION','ADD_SECTION','REMOVE_SECTION','RENAME_TITLE','CLARIFY'] },
    operation: { type: 'string', enum: ['replace','append','prepend','insert_after','insert_before','rewrite','delete','clarify'] },
    targetSection: { type: 'string', enum: ['SUMMARY','NOTES','EXPLANATION','KEY_FORMULAS','WORKED_EXAMPLE','COMMON_MISTAKES','NONE'] },
    title: { type: 'string' },
    anchor: { type: 'string' },
    confidence: { type: 'number' },
    markdown: { type: 'string' },
    message: { type: 'string' },
    sourceReferences: references,
  },
  required: ['action','operation','targetSection','title','anchor','confidence','markdown','message','sourceReferences'],
};
const problemSettingsSchema = {
  type: 'object', properties: {
    instructions: { type: 'string' }, rubric: { type: 'string' },
    allowTip: { type: 'boolean' }, tip: { type: 'string' },
    allowFormula: { type: 'boolean' }, formula: { type: 'string' },
  }, required: ['instructions','rubric','allowTip','tip','allowFormula','formula'],
};
const quizQuestionSchema = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['MULTIPLE_CHOICE','TRUE_FALSE','SHORT_ANSWER','PROBLEM_SOLVING'] },
    topic: { type: 'string' },
    prompt: { type: 'string' },
    choices: { type: 'array', items: { type: 'string' } },
    correctAnswer: { type: 'string' },
    explanation: { type: 'string' },
    maxPoints: { type: 'number' },
    problemSettings: problemSettingsSchema,
  },
  required: ['type','topic','prompt','choices','correctAnswer','explanation'],
};
const quizEditSchema = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['UPDATE_QUIZ','CLARIFY'] },
    operation: { type: 'string', enum: ['update_question','update_multiple_questions','add_question','delete_question','reorder_questions','regenerate_quiz','clarify'] },
    quizNumber: { type: 'integer' },
    targetQuestionNumbers: { type: 'array', items: { type: 'integer' } },
    order: { type: 'array', items: { type: 'integer' } },
    questions: { type: 'array', items: quizQuestionSchema },
    message: { type: 'string' },
  },
  required: ['action','operation','quizNumber','targetQuestionNumbers','order','questions','message'],
};
const documentEditSchema = {
  type: 'object',
  properties: {
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          targetSection: { type: 'string', enum: ['SUMMARY','NOTES','EXPLANATION','KEY_FORMULAS','WORKED_EXAMPLE','COMMON_MISTAKES'] },
          markdown: { type: 'string' },
          sourceReferences: references,
        },
        required: ['targetSection','markdown','sourceReferences'],
      },
    },
    message: { type: 'string' },
  },
  required: ['sections','message'],
};

class GeminiLessonChatProvider extends LessonChatProvider {
  constructor({ apiKey, model, timeoutMs }) {
    super(); this.apiKey = apiKey; this.model = model; this.timeoutMs = timeoutMs; this.client = null;
  }
  async getClient() {
    if (!this.apiKey) { const error = new Error('Gemini API key is not configured.'); error.status = 401; throw error; }
    if (!this.client) { const { GoogleGenAI } = await import('@google/genai'); this.client = new GoogleGenAI({ apiKey: this.apiKey }); }
    return this.client;
  }
  async request(text, schema, systemInstruction = SYSTEM) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      console.info(`[Gemini] Model: ${this.model}`);
      console.info(`[Gemini] Payload bytes: ${Buffer.byteLength(String(text || ''), 'utf8')}`);
      const client = await this.getClient();
      const response = await client.models.generateContent({
        model: this.model,
        contents: [{ role: 'user', parts: [{ text }] }],
        config: { systemInstruction, responseMimeType: 'application/json', responseJsonSchema: schema, abortSignal: controller.signal },
      });
      return JSON.parse(response.text || '{}');
    } catch (error) { throw mapProviderError(error); }
    finally { clearTimeout(timer); }
  }
  async reply({ context, history, message }) {
    const result = await this.request(`APPROVED LESSON CONTEXT:\n${JSON.stringify(context)}\n\nRECENT CONVERSATION:\n${JSON.stringify(history)}\n\nPROFESSOR QUESTION:\n${message}`, answerSchema);
    if (!String(result.answer || '').trim()) { const error = new Error('Empty assistant response.'); error.code = 'INVALID_PROVIDER_OUTPUT'; error.retryable = true; throw mapProviderError(error); }
    return result;
  }
  async editDocument({ context, materials, instruction }) {
    const editSystem = `${SYSTEM}\nYou edit the complete GENERATED LESSON DRAFT, never the approved context. Return every supplied current section exactly once, using the same targetSection values and section structure. Apply the professor's lesson-wide instruction to the section content without adding, duplicating, or removing sections. Put rewritten content only in each markdown field. Keep message to one or two concise sentences confirming the overall change; never copy lesson content into message. Preserve valid Markdown and LaTeX.`;
    const result = await this.request(
      `APPROVED LESSON CONTEXT:\n${JSON.stringify(context)}\n\nCURRENT GENERATED DRAFT SECTIONS:\n${JSON.stringify(materials)}\n\nWHOLE-LESSON EDIT INSTRUCTION:\n${instruction}`,
      documentEditSchema, editSystem
    );
    if (!Array.isArray(result.sections) || !result.sections.length || !String(result.message || '').trim()) {
      const error = new Error('Invalid structured document edit response.'); error.code = 'INVALID_PROVIDER_OUTPUT'; error.retryable = true; throw mapProviderError(error);
    }
    return result;
  }
  async edit({ context, materials, selectedSection, history, instruction }) {
    const editSystem = `${SYSTEM}\nYou edit only the GENERATED LESSON DRAFT, never the approved context. Resolve the target semantically from section types, titles, current content, the recent conversation, and the visible/recent section when supplied. Return one controlled structured operation. operation describes the requested change, while markdown must contain the complete final section after applying it; never return only an unsafe fragment. Update an existing canonical section instead of adding another section of the same type. Use ADD_SECTION only when the professor explicitly requests a genuinely missing section. Resolve "this section", "this part", "the example above", and similar references from SELECTED OR RECENT SECTION and RECENT CONVERSATION. If no target can be resolved confidently, return CLARIFY with confidence below 0.6. Do not return IDs. Return title as plain text without numbering, Markdown # markers, or emphasis. Keep message to one or two concise sentences confirming the change; never copy the rewritten lesson content into message. In markdown, use unnumbered semantic headings and never combine a list number with a Markdown heading. Preserve valid Markdown and LaTeX.`;
    const result = await this.request(
      `APPROVED LESSON CONTEXT:\n${JSON.stringify(context)}\n\nCURRENT GENERATED DRAFT SECTIONS:\n${JSON.stringify(materials)}\n\nRECENT CONVERSATION:\n${JSON.stringify(history || [])}\n\nSELECTED OR RECENT SECTION:\n${selectedSection || 'NONE'}\n\nEDIT INSTRUCTION:\n${instruction}`,
      editSchema, editSystem
    );
    if (!editSchema.properties.action.enum.includes(result.action) || !String(result.message || '').trim()) {
      const error = new Error('Invalid structured edit response.'); error.code = 'INVALID_PROVIDER_OUTPUT'; error.retryable = true; throw mapProviderError(error);
    }
    return result;
  }
  async editQuiz({ context, quizzes, history, instruction, editPlan }) {
    const changeRules = '\nFor targeted updates, the server requestedChange and changeInstruction describe the current change. Do not reuse previous operation details. harder/easier means adjust mathematical difficulty while preserving the existing question type. Change type only when the current plan explicitly requests it. Conversational targets and inherited changes have already been resolved by the server. The supplied canonical quiz contains the current question content: never ask the instructor to paste it again.';
    const quizSystem = `${SYSTEM}\nYou edit only an existing instructor DRAFT quiz through one explicit patch operation. The server supplies an EDIT PLAN derived from the professor's wording; follow that operation and its target question numbers exactly. A non-clarify SERVER EDIT PLAN means relative or conversational references have already been resolved and are authoritative; do not return CLARIFY or choose a different operation. For update_question return exactly one changed question, never the whole quiz. For update_multiple_questions return exactly one changed question per target in target order. For add_question return exactly one new question. For delete_question and reorder_questions return an empty questions array. Only regenerate_quiz may return the complete replacement quiz. Never include unchanged questions in a targeted update. For a rewrite, keep the same answer when explicitly requested. Multiple-choice questions must contain exactly four distinct choices and correctAnswer must exactly match one choice. TRUE_FALSE choices must be True and False. Never publish. Return CLARIFY only when the SERVER EDIT PLAN operation is clarify. Keep message concise and never dump quiz content into chat.`;
    const result = await this.request(
      `APPROVED LESSON CONTEXT:\n${JSON.stringify(context)}\n\nCURRENT DRAFT QUIZZES IN DISPLAY ORDER:\n${JSON.stringify(quizzes)}\n\nRECENT CONVERSATION:\n${JSON.stringify(history || [])}\n\nSERVER EDIT PLAN:\n${JSON.stringify(editPlan)}\n\nQUIZ EDIT INSTRUCTION:\n${instruction}`,
      quizEditSchema, quizSystem + changeRules + '\nPROBLEM_SOLVING is a handwritten solution-required question inside the quiz. Use choices=[], correctAnswer="", explanation=""; put instructions and the instructor-only expected solution/rubric in problemSettings. Preserve maxPoints and existing allowTip/allowFormula switches. Store a guiding tip (never the full solution) and a relevant formula ahead of student use. Help-only changes modify only the requested tip/formula; preserve all question text, type, score, rubric, and other help. less_revealing_tip must give less away. Never set a student grade.'
    );
    if (!quizEditSchema.properties.action.enum.includes(result.action) || !String(result.message || '').trim()) {
      const error = new Error('Invalid structured quiz edit response.'); error.code = 'INVALID_PROVIDER_OUTPUT'; error.retryable = true; throw mapProviderError(error);
    }
    return result;
  }
}

module.exports = GeminiLessonChatProvider;
