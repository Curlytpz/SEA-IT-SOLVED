const pool = require('../db/pool');
const AppError = require('../utils/AppError');
const { AsyncLocalStorage } = require('node:async_hooks');
const contextService = require('./lesson-context.service');
const intelligenceService = require('./lesson-intelligence.service');
const geminiInteractive = require('./geminiInteractive.service');
const GeminiLessonChatProvider = require('../reasoning/GeminiLessonChatProvider');
const { normalizeGeneratedLessonTitle, normalizeGeneratedText } = require('../utils/generatedContent');
const { normalizeLessonMathContent } = require('../utils/mathContent');
const { conversationTitle } = require('../utils/lessonChatHistory');
const { explicitQuizGeneration, quizIntent, quizEditIntent, generateNotesIntent, editIntent, wholeLessonEditIntent, prepareQuizDraft, quizClarificationMessage, isQuizDraftContinuation } = require('../utils/lessonChatIntent');
const { GEMINI_API_KEY, GEMINI_CHAT_MODEL, GEMINI_INTERACTIVE_TIMEOUT_MS } = require('../config/env');

const provider = new GeminiLessonChatProvider({ apiKey: GEMINI_API_KEY, model: GEMINI_CHAT_MODEL, timeoutMs: GEMINI_INTERACTIVE_TIMEOUT_MS });
const MATERIAL_TYPES = ['SUMMARY','NOTES','EXPLANATION','KEY_FORMULAS','WORKED_EXAMPLE','COMMON_MISTAKES'];
const EDIT_ACTIONS = ['UPDATE_SECTION','ADD_SECTION','REMOVE_SECTION','RENAME_TITLE'];
const EDIT_OPERATIONS = ['replace','append','prepend','insert_after','insert_before','rewrite','delete'];
const chatSessionScope = new AsyncLocalStorage();
const CHAT_HISTORY_LIMIT = 30;

function sourceLabel(chunk) {
  const source = chunk.source || {};
  if (chunk.type === 'WHITEBOARD') return `Whiteboard Page ${source.pageNumber}`;
  if (chunk.type === 'SPEECH') { const start=Math.floor(Number(source.lessonOffsetStartMs||0)/1000); const end=Math.ceil(Number(source.lessonOffsetEndMs||0)/1000); return `Transcript ${Math.floor(start/60)}:${String(start%60).padStart(2,'0')}–${Math.floor(end/60)}:${String(end%60).padStart(2,'0')}`; }
  if (chunk.type === 'PDF') return `${source.filename || 'Lesson PDF'} • Page ${source.pdfPageNumber}`;
  return source.filename || 'Uploaded image';
}
function approvedPayload(context) { return context.chunks.map(chunk => ({ type:chunk.type, source:sourceLabel(chunk), text:chunk.text, math:chunk.math })); }
function safeMessage(row) {
  let content=normalizeGeneratedText(row.content,{markdown:true,maxLength:100000});
  const action=row.metadata?.action||null;
  const looksLikePayload=content.length>180||/[\r\n]{2,}|^#{1,6}\s|\\(?:frac|lim|int|sum|sqrt)\b/m.test(content);
  if(row.role==='ASSISTANT'&&looksLikePayload&&action==='MATERIAL_EDITED')content='Lesson material updated.';
  if(row.role==='ASSISTANT'&&looksLikePayload&&action==='MATERIALS_GENERATED')content='Lesson notes generated successfully.';
  if(row.role==='ASSISTANT'&&looksLikePayload&&action==='QUIZ_EDITED')content='Quiz updated.';
  return {id:row.id,role:row.role,content,messageType:row.message_type||'ASK',sourceReferences:Array.isArray(row.source_references)?row.source_references:[],action,operation:row.metadata?.operation||null,changedMaterialId:row.metadata?.changedMaterialId||null,quizPrompt:row.metadata?.quizPrompt||null,quizDraft:row.metadata?.quizDraft||null,missingQuizParameters:row.metadata?.missingQuizParameters||null,createdAt:row.created_at};
}
function safeMaterial(row) { const content=row.content&&typeof row.content==='object'?row.content:{};return { id:row.id, type:row.material_type, title:normalizeGeneratedLessonTitle(row.title), content:{...content,markdown:normalizeGeneratedText(content.markdown,{markdown:true})}, sourceReferences:row.source_references||[], provider:row.provider, providerVersion:row.provider_version, outdated:row.outdated, generatedAt:row.generated_at, displayOrder:row.display_order }; }
function snapshot(row) { return row ? { exists:true,title:row.title,content:row.content,sourceReferences:row.source_references||[],removed:row.removed,displayOrder:row.display_order,type:row.material_type } : { exists:false }; }
function validatedLessonMarkdown(value){const markdown=normalizeGeneratedText(value,{markdown:true});if(!markdown)throw new AppError('The edited lesson section cannot be empty.',422);const normalized=normalizeLessonMathContent(markdown);if(normalized.needsReview.length)throw new AppError('The AI edit contained a math expression that needs clarification. The existing lesson was kept.',422);return normalized.content;}

function safeConversation(row, preview='') {
  return {
    id: row.id,
    title: row.title || 'New Conversation',
    preview: normalizeGeneratedText(preview || row.preview || '', { markdown:false, maxLength:120 }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sessionInput(options={}, firstMessage='') {
  return {
    conversationId: String(options?.conversationId || '').trim() || null,
    newConversation: options?.newConversation === true,
    firstMessage: String(firstMessage || options?.message || options?.prompt || '').trim(),
    session: null,
    context: null,
    createdSessionId: null,
  };
}

async function withSessionScope(options, firstMessage, callback) {
  if (chatSessionScope.getStore()) return callback();
  const scope=sessionInput(options,firstMessage);
  return chatSessionScope.run(scope,async()=>{
    try{
      const result=await callback();
      if(scope.session)result.conversation=safeConversation(scope.session,result.message?.content||firstMessage);
      return result;
    }catch(error){
      if(scope.createdSessionId){
        await pool.query(
          'DELETE FROM lesson_chat_sessions s WHERE s.id=$1 AND NOT EXISTS(SELECT 1 FROM lesson_chat_messages m WHERE m.session_id=s.id)',
          [scope.createdSessionId]
        ).catch(()=>{});
      }
      throw error;
    }
  });
}

async function currentSession(lessonId,instructorId,create=false) {
  const scope=chatSessionScope.getStore();
  if(scope?.session)return{context:scope.context,session:scope.session};
  const context=await contextService.getApprovedForReasoning(lessonId,instructorId,'Approve the lesson context before using the lesson assistant.');
  if(scope)scope.context=context;
  let result={rows:[]};
  if(scope?.conversationId){
    result=await pool.query(
      'SELECT * FROM lesson_chat_sessions WHERE id::text=$1 AND lesson_id=$2 AND instructor_id=$3 AND context_version_id=$4',
      [scope.conversationId,lessonId,instructorId,context.id]
    );
    if(!result.rows.length)throw new AppError('AI conversation not found.',404);
  }else if(!scope?.newConversation){
    result=await pool.query(
      'SELECT * FROM lesson_chat_sessions WHERE lesson_id=$1 AND instructor_id=$2 AND context_version_id=$3 ORDER BY updated_at DESC,id DESC LIMIT 1',
      [lessonId,instructorId,context.id]
    );
  }
  if(!result.rows.length&&create){
    result=await pool.query(
      'INSERT INTO lesson_chat_sessions(lesson_id,context_version_id,instructor_id,title) VALUES($1,$2,$3,$4) RETURNING *',
      [lessonId,context.id,instructorId,conversationTitle(scope?.firstMessage)]
    );
    if(scope)scope.createdSessionId=result.rows[0].id;
  }
  if(scope)scope.session=result.rows[0]||null;
  return {context,session:result.rows[0]||null};
}
async function insertMessage(client,session,lessonId,instructorId,role,content,type='ASK',references=[],metadata={}) {
  const scope=chatSessionScope.getStore();
  if(role==='USER'&&scope?.persistedUser&&!scope.persistedUser.consumed&&scope.persistedUser.content===String(content)){
    scope.persistedUser.consumed=true;
    return scope.persistedUser.message;
  }
  const {rows}=await client.query(`INSERT INTO lesson_chat_messages(session_id,lesson_id,instructor_id,role,content,message_type,source_references,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[session.id,lessonId,instructorId,role,content,type,JSON.stringify(references),JSON.stringify(metadata)]);
  const updated=await client.query('UPDATE lesson_chat_sessions SET updated_at=NOW() WHERE id=$1 RETURNING updated_at',[session.id]);
  session.updated_at=updated.rows[0]?.updated_at||session.updated_at;
  return safeMessage(rows[0]);
}
async function messagesForSession(id,limit=100){if(!id)return[];const{rows}=await pool.query(`SELECT * FROM(SELECT * FROM lesson_chat_messages WHERE session_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2)recent ORDER BY created_at,id`,[id,limit]);return rows.map(safeMessage);}
async function recentConversation(id,limit=16){
  if(!id)return[];
  const excludeId=chatSessionScope.getStore()?.persistedUser?.message?.id||'';
  const{rows}=await pool.query(
    "SELECT role,content,message_type,metadata,created_at FROM lesson_chat_messages WHERE session_id=$1 AND ($3::text='' OR id::text<>$3::text) ORDER BY created_at DESC,id DESC LIMIT $2",
    [id,limit,excludeId]
  );
  return rows.reverse();
}
async function conversationRows(lessonId,instructorId,contextId,limit=CHAT_HISTORY_LIMIT){
  const{rows}=await pool.query(
    `SELECT s.*,latest.content AS preview
     FROM lesson_chat_sessions s
     LEFT JOIN LATERAL (
       SELECT content FROM lesson_chat_messages
       WHERE session_id=s.id ORDER BY created_at DESC,id DESC LIMIT 1
     ) latest ON TRUE
     WHERE s.lesson_id=$1 AND s.instructor_id=$2 AND s.context_version_id=$3
     ORDER BY s.updated_at DESC,s.id DESC LIMIT $4`,
    [lessonId,instructorId,contextId,limit]
  );
  return rows;
}
async function list(lessonId,instructorId,conversationId){
  const context=await contextService.getApprovedForReasoning(lessonId,instructorId,'Approve the lesson context before using the lesson assistant.');
  const rows=await conversationRows(lessonId,instructorId,context.id);
  let session=conversationId
    ? (await pool.query('SELECT * FROM lesson_chat_sessions WHERE id::text=$1 AND lesson_id=$2 AND instructor_id=$3 AND context_version_id=$4',[String(conversationId),lessonId,instructorId,context.id])).rows[0]
    : rows[0];
  if(conversationId&&!session)throw new AppError('AI conversation not found.',404);
  const generated=await intelligenceService.currentGeneratedDocument(lessonId,instructorId);
  const undo=generated.contextVersionId
    ? await pool.query(`SELECT EXISTS(SELECT 1 FROM generated_material_edits e WHERE e.lesson_id=$1 AND e.instructor_id=$2 AND e.context_version_id=$3 AND e.undone_at IS NULL) can_undo`,[lessonId,instructorId,generated.contextVersionId])
    : {rows:[{can_undo:false}]};
  return{conversations:rows.map(row=>safeConversation(row)),activeConversationId:session?.id||null,messages:await messagesForSession(session?.id),canUndo:undo.rows[0].can_undo};
}
function quizClarification(prompt,{draft,missingParameters,invalidQuestionCount},message){return{message,requiresQuizOptions:true,quizPrompt:prompt,quizDraft:draft,missingQuizParameters:missingParameters,difficulty:draft.difficulty,questionCount:draft.questionCount,questionType:draft.questionType};}
async function createQuiz(lessonId,instructorId,options={}) {
  const prompt=String(options.prompt||'Generate a quiz about this lesson.').trim();
  return withSessionScope(options,prompt,async()=>{
    const prepared=prepareQuizDraft(prompt,options.quizDraft,{difficulty:options.difficulty,questionCount:options.questionCount,questionType:options.questionType});
    if(prepared.missingParameters.length){
      const{session}=await currentSession(lessonId,instructorId,true);
      const content=quizClarificationMessage(prepared.missingParameters,prepared.invalidQuestionCount);
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        await insertMessage(client,session,lessonId,instructorId,'USER',prompt,'QUIZ_ACTION');
        const assistant=await insertMessage(client,session,lessonId,instructorId,'ASSISTANT',content,'QUIZ_ACTION',[],{action:'QUIZ_OPTIONS_REQUIRED',quizPrompt:options.quizDraft?.prompt||prompt,quizDraft:prepared.draft,missingQuizParameters:prepared.missingParameters});
        await client.query('COMMIT');
        return quizClarification(options.quizDraft?.prompt||prompt,prepared,assistant);
      }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
    }
    const{difficulty,questionCount:count,questionType}=prepared.draft;
    const generationPrompt=String(options.quizDraft?.prompt||prompt).trim();
    await currentSession(lessonId,instructorId,false);
    await intelligenceService.generateQuiz(lessonId,instructorId,{difficulty,questionCount:count,questionType,prompt:generationPrompt});
    const{session}=await currentSession(lessonId,instructorId,true);
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      if(options.skipUserMessage!==true)await insertMessage(client,session,lessonId,instructorId,'USER',prompt,'QUIZ_ACTION');
      const assistant=await insertMessage(client,session,lessonId,instructorId,'ASSISTANT',`I generated a ${count}-question ${difficulty.toLowerCase()} quiz draft based on the approved lesson context. Review and edit it before publishing.`,'QUIZ_ACTION',[],{action:'QUIZ_CREATED',difficulty,questionCount:Number(count),questionType});
      await client.query('COMMIT');
      return{message:assistant,quizCreated:true};
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  });
}

async function generateNotes(lessonId,instructorId,message){
  const operation=/\bre-?generate\b/i.test(message)?'REGENERATE_LESSON':'GENERATE_LESSON';
  const description=operation==='REGENERATE_LESSON'
    ? 'I regenerated the lesson notes using the approved lesson context and refreshed the explanations, formulas, and examples.'
    : 'I generated the lesson notes from the approved lesson context with structured explanations, formulas, and examples.';
  const{session}=await currentSession(lessonId,instructorId,true);
  await intelligenceService.generateMaterials(lessonId,instructorId);
  const intelligence=await intelligenceService.list(lessonId,instructorId);
  if(!intelligence.materials?.length)throw new AppError('Lesson notes finished processing, but no sections were returned. Please try again.',422);
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await insertMessage(client,session,lessonId,instructorId,'USER',message,'DOCUMENT_ACTION');
    const assistant=await insertMessage(
      client,session,lessonId,instructorId,'ASSISTANT',description,'DOCUMENT_ACTION',[],
      {action:'MATERIALS_GENERATED',operation:{action:operation,target:'LESSON_DOCUMENT',description},changedMaterialId:null}
    );
    await client.query('COMMIT');
    return{message:assistant,edited:true,documentAction:operation,materials:intelligence.materials,document:intelligence.document,changedMaterialId:null,canUndo:false};
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}

const { quizEditPlan, requestedQuizChange } = require('../../../shared/quizEditTargeting.cjs');

function sameNumbers(left,right){return left.length===right.length&&left.every((number,index)=>number===right[index]);}

function quizEditConfirmation(operation,quiz,targetNumbers,requestedChange){
  if(operation==='update_question'||operation==='update_multiple_questions'){
    const names=targetNumbers.length<2?String(targetNumbers[0]):targetNumbers.slice(0,-1).join(', ')+' and '+targetNumbers.at(-1);
    const subject=targetNumbers.length===1?'Question':'Questions',verb=targetNumbers.length===1?'was':'were';
    const change={harder:'made more challenging',easier:'made easier',multiple_choice:'updated to multiple choice',true_false:'updated to true/false',short_answer:'updated to short answer',problem_solving:'updated to solution required',enable_tip:'updated with Tip ON',disable_tip:'updated with Tip OFF',enable_formula:'updated with Formula ON',disable_formula:'updated with Formula OFF',generate_tip:'updated with a stored tip',generate_formula:'updated with a stored formula',less_revealing_tip:'updated with a less revealing tip'}[requestedChange]||'updated';
    const others=quiz.questions.length-targetNumbers.length;
    return `${subject} ${names} ${verb} ${change}. ${others ? `The other ${others} ${others===1?'question was':'questions were'} left unchanged.` : 'The question count was preserved.'}`;
  }
  if(operation==='add_question')return `One question was added. The quiz now has ${quiz.questions.length} questions.`;
  if(operation==='delete_question')return `Question ${targetNumbers[0]} was deleted. The quiz now has ${quiz.questions.length} questions.`;
  if(operation==='reorder_questions')return `The quiz questions were reordered without changing their content. The quiz still has ${quiz.questions.length} questions.`;
  return `The whole quiz was regenerated as requested. It now has ${quiz.questions.length} questions.`;
}

async function editQuiz(lessonId,instructorId,message){
  const{context,session}=await currentSession(lessonId,instructorId,true);
  const intelligence=await intelligenceService.list(lessonId,instructorId);
  const drafts=(intelligence.quizzes||[]).filter(quiz=>quiz.status==='DRAFT');
  if(!drafts.length)throw new AppError('Create a draft quiz before asking the assistant to edit it.',409);
  const history=await recentConversation(session.id);
  const recentReference=[...history].reverse().find(item=>item.role==='ASSISTANT'&&item.metadata?.action==='QUIZ_EDITED'&&['update_question','update_multiple_questions'].includes(item.metadata?.operation));
  const recentQuizIndex=recentReference?drafts.findIndex(quiz=>quiz.id===recentReference.metadata.quizId):-1;
  const recentQuiz=recentQuizIndex>=0?drafts[recentQuizIndex]:null;
  const metadata=recentReference?.metadata||{};
  const legacyInstruction=history.find(item=>item.role==='USER'&&item.message_type==='QUIZ_EDIT'&&String(item.created_at)===String(recentReference?.created_at))?.content||'';
  const recentQuestionNumbers=metadata.targetQuestionIds?.length
    ? metadata.targetQuestionIds.map(id=>(recentQuiz?.questions||[]).findIndex(question=>question.id===id)+1)
    : metadata.targetQuestionNumbers?.length?metadata.targetQuestionNumbers:metadata.targetQuestionNumber?[metadata.targetQuestionNumber]:[];
  const followupContext={
    recentQuestionNumbers:recentQuiz?recentQuestionNumbers:[],
    recentQuizNumber:recentQuizIndex>=0?recentQuizIndex+1:null,
    recentRequestedChange:recentQuiz?(metadata.requestedChange||requestedQuizChange(legacyInstruction)):null,
    recentChangeInstruction:recentQuiz?(metadata.changeInstruction||requestedQuizChange(legacyInstruction)||legacyInstruction):null,
  };
  const preliminaryPlan=quizEditPlan(message,followupContext);
  const plannedQuiz=drafts[preliminaryPlan.quizNumber-1];
  const editPlan=quizEditPlan(message,{...followupContext,questionCount:plannedQuiz?.questions?.length});
  const targeted=['update_question','update_multiple_questions'].includes(editPlan.operation);
  if(!plannedQuiz)throw new AppError('The requested draft quiz is not available.',422);
  if(editPlan.targetQuestionNumbers.some(number=>!Number.isInteger(number)||number<1||number>plannedQuiz.questions.length)){
    throw new AppError('A requested question is no longer available in this quiz. No questions were changed.',422);
  }
  // Resolve every ID from the current canonical order before generating any patches.
  const targetQuestionIds=editPlan.targetQuestionNumbers.map(number=>plannedQuiz.questions[number-1].id);
  if(targeted&&!editPlan.requestedChange){
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      await insertMessage(client,session,lessonId,instructorId,'USER',message,'QUIZ_EDIT');
      const assistant=await insertMessage(client,session,lessonId,instructorId,'ASSISTANT',`What change would you like me to apply to question ${editPlan.targetQuestionNumbers.join(' and ')}?`,'QUIZ_EDIT');
      await client.query('COMMIT');
      return{message:assistant,quizEdited:false};
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  const helpChange = /^(?:enable|disable|generate)_(?:tip|formula)$|^less_revealing_tip$/.test(editPlan.requestedChange);
  const toggleHelp = /^(?:enable|disable)_/.test(editPlan.requestedChange);
  if (helpChange && targeted && editPlan.targetQuestionNumbers.some(number => plannedQuiz.questions[number-1]?.type !== 'PROBLEM_SOLVING')) {
    throw new AppError('Tip and Formula controls belong to solution-required questions. Convert the question first.',422);
  }
  const providerInstruction=targeted
    ? `${message}\n\nServer-resolved targets: update only quiz ${editPlan.quizNumber}, questions ${editPlan.targetQuestionNumbers.join(', ')}.\nRequested change: ${editPlan.changeInstruction}. Use the supplied canonical questions; their content is already available.`
    : message;
  const result=toggleHelp && targeted ? {
    action:'UPDATE_QUIZ',operation:editPlan.operation,quizNumber:editPlan.quizNumber,
    targetQuestionNumbers:editPlan.targetQuestionNumbers,order:[],
    questions:editPlan.targetQuestionNumbers.map(number=>({...plannedQuiz.questions[number-1]})),
  } : await geminiInteractive.run(
    ()=>provider.editQuiz({
      context:approvedPayload(context),
      history:targeted?[]:history.map(item=>({role:item.role,content:item.content,action:item.metadata?.action||null})),
      quizzes:drafts.map((quiz,index)=>({
        quizNumber:index+1,title:quiz.title,status:quiz.status,difficulty:quiz.difficulty,
        questions:(quiz.questions||[]).map((question,questionIndex)=>({questionNumber:questionIndex+1,type:question.type,topic:question.topic,prompt:question.prompt,choices:question.choices,correctAnswer:question.correctAnswer,explanation:question.explanation,maxPoints:question.maxPoints,problemSettings:question.problemSettings})),
      })),
      instruction:providerInstruction,
      editPlan,
    }),
    {unavailable:'AI is temporarily unavailable. Please try again.',rateLimited:'The AI service is temporarily rate-limited. Please try again shortly.',invalidOutput:"I couldn't safely update that quiz. Please identify the quiz or question more specifically."}
  );
  if(result.action==='CLARIFY'){
    if(editPlan.operation!=='clarify')throw new AppError("I couldn't safely apply the targeted quiz edit. The existing quiz was kept unchanged.",422);
    const client=await pool.connect();
    try{await client.query('BEGIN');await insertMessage(client,session,lessonId,instructorId,'USER',message,'QUIZ_EDIT');const assistant=await insertMessage(client,session,lessonId,instructorId,'ASSISTANT',normalizeGeneratedText(result.message,{markdown:true,maxLength:500}),'QUIZ_EDIT');await client.query('COMMIT');return{message:assistant,quizEdited:false};}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }
  if(editPlan.operation==='clarify'||result.operation==='clarify')throw new AppError("I couldn't safely identify the requested quiz edit. Name the question number or explicitly ask to add, delete, reorder, or regenerate the whole quiz.",422);
  if(result.operation!==editPlan.operation)throw new AppError("I couldn't safely match the AI response to your requested quiz edit. The existing quiz was kept.",422);
  const quizNumber=editPlan.quizNumber||Number(result.quizNumber);
  const targetQuiz=Number.isInteger(quizNumber)?drafts[quizNumber-1]:null;
  if(!targetQuiz)throw new AppError("I couldn't safely identify the draft quiz to update.",422);
  const resultTargets=(result.targetQuestionNumbers||[]).map(Number);
  const targetNumbers=editPlan.targetQuestionNumbers.length?editPlan.targetQuestionNumbers:resultTargets;
  if(editPlan.targetQuestionNumbers.length&&!sameNumbers(resultTargets,editPlan.targetQuestionNumbers))throw new AppError("I couldn't safely verify the targeted question numbers. The existing quiz was kept.",422);
  if(targeted&&Number(result.quizNumber)!==editPlan.quizNumber)throw new AppError('The AI response targeted a different quiz. No questions were changed.',422);
  const questions=Array.isArray(result.questions)?result.questions.map(question=>({...question})):[];
  if(targeted){
    const requestedType={multiple_choice:'MULTIPLE_CHOICE',true_false:'TRUE_FALSE',short_answer:'SHORT_ANSWER',problem_solving:'PROBLEM_SOLVING'}[editPlan.requestedChange];
    for(const [index,question] of questions.entries()){
      const current=targetQuiz.questions[targetNumbers[index]-1];
      if (helpChange && current) {
        const key = /formula$/.test(editPlan.requestedChange) ? 'formula' : 'tip';
        const flag = key === 'formula' ? 'allowFormula' : 'allowTip';
        const settings={...current.problemSettings};
        if (toggleHelp) settings[flag]=editPlan.requestedChange.startsWith('enable_');
        else {
          const value=String(question.problemSettings?.[key]||'').trim();
          if(!value)throw new AppError('AI did not return the requested stored help. No questions were changed.',422);
          settings[key]=value;
        }
        // Help-only requests cannot change the problem, rubric, points, or the other help.
        questions[index]={...current,problemSettings:settings};
        continue;
      }
      if(current && ['harder','easier','problem_solving'].includes(editPlan.requestedChange)) {
        question.maxPoints=current.maxPoints;
        if(question.type==='PROBLEM_SOLVING'){
          question.problemSettings={...question.problemSettings,
            allowTip:current.problemSettings?.allowTip===true,allowFormula:current.problemSettings?.allowFormula===true};
        }
      }
      const expectedType=requestedType||(['harder','easier'].includes(editPlan.requestedChange)?targetQuiz.questions[targetNumbers[index]-1]?.type:null);
      if(expectedType&&question.type!==expectedType)throw new AppError('The AI response changed a question type outside the requested edit. No questions were changed.',422);
    }
  }
  if(/\bkeep\s+(?:the\s+)?same\s+correct\s+answer\b/i.test(message)){
    targetNumbers.forEach((number,index)=>{if(questions[index]&&targetQuiz.questions[number-1])questions[index].correctAnswer=targetQuiz.questions[number-1].correctAnswer;});
  }
  const quiz=await intelligenceService.applyQuizEdit(targetQuiz.id,instructorId,{
    operation:editPlan.operation,
    targetQuestionNumbers:targetNumbers,
    questions,
    order:result.order||[],
    requestedQuestionCount:editPlan.requestedQuestionCount,
    expectedQuestionIds:targetQuiz.questions.map(question=>question.id),
    expectedTargetQuestionIds:targetQuestionIds,
  });
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await insertMessage(client,session,lessonId,instructorId,'USER',message,'QUIZ_EDIT');
    const targetQuestionNumber=targetNumbers[0]||null;
    const confirmation=quizEditConfirmation(editPlan.operation,quiz,targetNumbers,editPlan.requestedChange);
    const assistant=await insertMessage(client,session,lessonId,instructorId,'ASSISTANT',confirmation,'QUIZ_EDIT',[],{action:'QUIZ_EDITED',operation:editPlan.operation,quizId:targetQuiz.id,targetQuestionNumber,targetQuestionNumbers:targetNumbers,targetQuestionIds,requestedChange:editPlan.requestedChange,changeInstruction:editPlan.changeInstruction});
    await client.query('COMMIT');
    return{message:assistant,quizEdited:true,quiz,quizId:targetQuiz.id};
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}

function conciseEditMessage(operation, target, action, instruction='') {
  const title=normalizeGeneratedLessonTitle(operation.title||target?.title||'lesson section');
  if(action==='REMOVE_SECTION')return `I removed ${title} from the lesson draft as requested.`;
  if(action==='RENAME_TITLE')return `I renamed the section to ${title}.`;
  if(action==='ADD_SECTION')return `I added ${title} to the lesson draft using the approved lesson context.`;
  if(target?.material_type==='WORKED_EXAMPLE'&&operation.operation==='append')return 'I added another worked example and kept it consistent with the approved lesson context.';
  if(target?.material_type==='SUMMARY'&&/\b(shorten|condense|concise|briefer)\b/i.test(instruction))return 'I shortened the Lesson Summary while preserving its main ideas and approved lesson context.';
  const verb={append:'added the requested material to',prepend:'added the requested material to',insert_after:'inserted the requested material in',insert_before:'inserted the requested material in',rewrite:'rewrote',delete:'removed the requested content from',replace:'updated'}[operation.operation]||'updated';
  return `I ${verb} ${title} and kept the change aligned with the approved lesson context.`;
}

async function editWholeDocument({lessonId,instructorId,message,documentContext,latestApprovedContext,session,rows,baseRevision,payload}) {
  const materials=rows.map(row=>({section:row.material_type,title:row.title,markdown:row.content?.markdown||''}));
  const result=await geminiInteractive.run(
    ()=>provider.editDocument({context:payload,materials,instruction:message}),
    {unavailable:'AI is temporarily unavailable. Please try again.',rateLimited:'The AI service is temporarily rate-limited. Please try again shortly.',invalidOutput:"I couldn't safely update the complete lesson. Please try again."}
  );
  const sections=new Map();
  for(const item of result.sections||[]){
    if(!MATERIAL_TYPES.includes(item.targetSection)||sections.has(item.targetSection))throw new AppError("I couldn't safely update the complete lesson. Please try again.",422);
    const markdown=validatedLessonMarkdown(item.markdown);
    sections.set(item.targetSection,{...item,markdown});
  }
  if(sections.size!==rows.length||rows.some(row=>!sections.has(row.material_type)))throw new AppError("I couldn't safely update every current lesson section. The previous document was kept.",422);

  const allowedSources=new Set(payload.map(item=>item.source));
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await intelligenceService.archiveDuplicateMaterials(client,lessonId,instructorId,documentContext.id);
    const current=await intelligenceService.currentGeneratedDocument(lessonId,instructorId,client,{forUpdate:true});
    if(current.contextVersionId!==documentContext.id)throw new AppError('The current generated lesson changed while this revision was being prepared. Review the latest document and try again.',409);
    const locked=current.rows;
    if(intelligenceService.materialRevision(locked)!==baseRevision)throw new AppError('The lesson draft changed while this revision was being prepared. Review the latest document and try again.',409);
    if(locked.length!==sections.size||locked.some(row=>!sections.has(row.material_type)))throw new AppError('The lesson structure changed while this revision was being prepared. Review the latest document and try again.',409);

    const before={batch:true,rows:locked.map(row=>({id:row.id,...snapshot(row)}))};
    const updated=[];
    for(const row of locked){
      const item=sections.get(row.material_type);
      const refs=[...new Set((item.sourceReferences||[]).filter(ref=>allowedSources.has(ref)))];
      const saved=await client.query(
        'UPDATE generated_lesson_materials SET content=$2,source_references=$3,updated_at=NOW() WHERE id=$1 RETURNING *',
        [row.id,JSON.stringify({markdown:item.markdown.slice(0,100000)}),JSON.stringify(refs.length?refs:row.source_references||[])]
      );
      updated.push(saved.rows[0]);
    }
    const after={batch:true,rows:updated.map(row=>({id:row.id,...snapshot(row)}))};
    await client.query(
      'INSERT INTO generated_material_edits(generated_material_id,lesson_id,context_version_id,instructor_id,edit_instruction,action,previous_snapshot,new_snapshot,provider,provider_model)\n'+
      "VALUES($1,$2,$3,$4,$5,'UPDATE_SECTION',$6,$7,'GEMINI',$8)",
      [locked[0].id,lessonId,documentContext.id,instructorId,message,JSON.stringify(before),JSON.stringify(after),GEMINI_CHAT_MODEL]
    );
    await insertMessage(client,session,lessonId,instructorId,'USER',message,'EDIT');
    const confirmation='I updated the complete lesson document as requested while preserving its approved lesson context and section structure.';
    const assistant=await insertMessage(client,session,lessonId,instructorId,'ASSISTANT',confirmation,'EDIT',[],{action:'MATERIAL_EDITED',operation:{action:'UPDATE_DOCUMENT',target:'LESSON_DOCUMENT',description:confirmation},changedMaterialId:null});
    await client.query('COMMIT');
    const intelligence=await intelligenceService.list(lessonId,instructorId);
    return{message:assistant,edited:true,materials:intelligence.materials,document:intelligence.document,changedMaterialId:null,canUndo:true,newerApprovedContextAvailable:documentContext.id!==latestApprovedContext.id};
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}

async function edit(lessonId,instructorId,message,selectedMaterialId){
  const{context:latestApprovedContext,session}=await currentSession(lessonId,instructorId,true);
  let current=await intelligenceService.currentGeneratedDocument(lessonId,instructorId);
  if(!current.rows.length)throw new AppError('No generated lesson exists yet. Generate the lesson before editing it.',409);
  await intelligenceService.archiveDuplicateMaterials(pool,lessonId,instructorId,current.contextVersionId);
  current=await intelligenceService.currentGeneratedDocument(lessonId,instructorId);
  const rows=current.rows;
  if(!rows.length)throw new AppError('No generated lesson exists yet. Generate the lesson before editing it.',409);
  const documentContext=current.contextVersionId===latestApprovedContext.id
    ? latestApprovedContext
    : await contextService.getVersionForReasoning(lessonId,instructorId,current.contextVersionId);
  const baseRevision=intelligenceService.materialRevision(rows);
  let selected=null;
  if(selectedMaterialId){
    selected=rows.find(row=>row.id===selectedMaterialId);
  }
  const history=await recentConversation(session.id);
  if(!selected){
    const recentTarget=[...history].reverse().map(item=>item.metadata?.changedMaterialId).find(Boolean);
    if(recentTarget)selected=rows.find(row=>row.id===recentTarget)||null;
  }
  const payload=approvedPayload(documentContext);
  if(wholeLessonEditIntent(message))return editWholeDocument({lessonId,instructorId,message,documentContext,latestApprovedContext,session,rows,baseRevision,payload});
  const allowedSources=new Set(payload.map(item=>item.source));
  const operation=await geminiInteractive.run(
    ()=>provider.edit({
      context:payload,
      materials:rows.map(row=>({id:row.id,section:row.material_type,title:row.title,markdown:row.content?.markdown||''})),
      selectedSection:selected?.material_type,
      history:history.map(item=>({role:item.role,content:item.content,action:item.metadata?.action||null,changedMaterialId:item.metadata?.changedMaterialId||null})),
      instruction:message,
    }),
    {unavailable:'AI is temporarily unavailable. Please try again.',rateLimited:'The AI service is temporarily rate-limited. Please try again shortly.',invalidOutput:"I couldn't safely apply that edit. Try selecting a section or being more specific."}
  );
  if(operation.action==='CLARIFY'||Number(operation.confidence)<0.6){
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      await insertMessage(client,session,lessonId,instructorId,'USER',message,'EDIT');
      const clarification=normalizeGeneratedText(operation.message,{markdown:true,maxLength:500})||'Which lesson section would you like me to update?';
      const assistant=await insertMessage(client,session,lessonId,instructorId,'ASSISTANT',clarification,'EDIT');
      await client.query('COMMIT');
      return{message:assistant,edited:false};
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }
  if(!EDIT_ACTIONS.includes(operation.action))throw new AppError("I couldn't safely apply that edit. Try selecting a section or being more specific.",422);
  if(!EDIT_OPERATIONS.includes(operation.operation))throw new AppError("I couldn't safely determine how to apply that lesson edit.",422);

  const client=await pool.connect();
  let changed;
  try{
    await client.query('BEGIN');
    await intelligenceService.archiveDuplicateMaterials(client,lessonId,instructorId,documentContext.id);
    const lockedDocument=await intelligenceService.currentGeneratedDocument(lessonId,instructorId,client,{forUpdate:true});
    if(lockedDocument.contextVersionId!==documentContext.id)throw new AppError('The current generated lesson changed while this revision was being prepared. Review the latest document and try again.',409);
    const locked=lockedDocument.rows;
    if(intelligenceService.materialRevision(locked)!==baseRevision){
      throw new AppError('The lesson draft changed while this revision was being prepared. Review the latest document and try again.',409);
    }

    let target=locked.find(row=>row.material_type===operation.targetSection)
      || (selected ? locked.find(row=>row.id===selected.id) : null);
    let appliedAction=operation.action;
    const explicitAdd=/\b(add|create|insert|new section)\b/i.test(message);
    if(appliedAction==='ADD_SECTION'&&target)appliedAction='UPDATE_SECTION';
    if(appliedAction==='ADD_SECTION'&&!explicitAdd)throw new AppError("I couldn't safely add a new section without an explicit request. Please be more specific.",422);
    if(appliedAction!=='ADD_SECTION'&&!target)throw new AppError("I couldn't safely identify the section to edit. Please name the section or describe the content.",422);

    let before,after;
    if(appliedAction==='ADD_SECTION'){
      if(!MATERIAL_TYPES.includes(operation.targetSection)||!String(operation.markdown||'').trim())throw new AppError("I couldn't safely apply that edit. Try being more specific.",422);
      const order=Math.max(-1,...locked.map(row=>Number(row.display_order)||0))+1;
      const refs=[...new Set((operation.sourceReferences||[]).filter(ref=>allowedSources.has(ref)))];
      const inserted=await client.query(
        'INSERT INTO generated_lesson_materials(lesson_id,context_version_id,instructor_id,material_type,title,content,source_references,provider,provider_version,outdated,display_order)\n'+
        "VALUES($1,$2,$3,$4,$5,$6,$7,'GEMINI',$8,$9,$10) RETURNING *",
        [lessonId,documentContext.id,instructorId,operation.targetSection,normalizeGeneratedLessonTitle(operation.title||'Additional Explanation'),JSON.stringify({markdown:validatedLessonMarkdown(operation.markdown)}),JSON.stringify(refs),GEMINI_CHAT_MODEL,documentContext.id!==latestApprovedContext.id,order]
      );
      target=inserted.rows[0];before={exists:false};after=snapshot(target);
    }else{
      before=snapshot(target);
      if(appliedAction==='REMOVE_SECTION'){
        if(locked.length<=1)throw new AppError('The final lesson section cannot be removed.',422);
        const result=await client.query('UPDATE generated_lesson_materials SET removed=TRUE,updated_at=NOW() WHERE id=$1 RETURNING *',[target.id]);
        after=snapshot(result.rows[0]);
      }else if(appliedAction==='RENAME_TITLE'){
        const title=normalizeGeneratedLessonTitle(operation.title);
        if(!title)throw new AppError('A valid section title is required.',422);
        const result=await client.query('UPDATE generated_lesson_materials SET title=$2,updated_at=NOW() WHERE id=$1 RETURNING *',[target.id,title.slice(0,255)]);
        after=snapshot(result.rows[0]);
      }else{
        const markdown=validatedLessonMarkdown(operation.markdown);
        const refs=[...new Set((operation.sourceReferences||[]).filter(ref=>allowedSources.has(ref)))];
        const result=await client.query(
          'UPDATE generated_lesson_materials SET content=$2,source_references=$3,updated_at=NOW() WHERE id=$1 RETURNING *',
          [target.id,JSON.stringify({markdown:markdown.slice(0,100000)}),JSON.stringify(refs.length?refs:target.source_references||[])]
        );
        after=snapshot(result.rows[0]);
      }
    }

    await client.query(
      'INSERT INTO generated_material_edits(generated_material_id,lesson_id,context_version_id,instructor_id,edit_instruction,action,previous_snapshot,new_snapshot,provider,provider_model)\n'+
      "VALUES($1,$2,$3,$4,$5,$6,$7,$8,'GEMINI',$9)",
      [target.id,lessonId,documentContext.id,instructorId,message,appliedAction,JSON.stringify(before),JSON.stringify(after),GEMINI_CHAT_MODEL]
    );
    await insertMessage(client,session,lessonId,instructorId,'USER',message,'EDIT');
    changed=target.id;
    const description=conciseEditMessage(operation,target,appliedAction,message);
    const assistant=await insertMessage(
      client,session,lessonId,instructorId,'ASSISTANT',description,'EDIT',[],
      {action:'MATERIAL_EDITED',operation:{action:appliedAction,mode:operation.operation,target:target.material_type,title:normalizeGeneratedLessonTitle(operation.title||target.title),description},storageAction:appliedAction,changedMaterialId:changed}
    );
    await client.query('COMMIT');
    const intelligence=await intelligenceService.list(lessonId,instructorId);
    return{message:assistant,edited:true,materials:intelligence.materials,document:intelligence.document,changedMaterialId:changed,canUndo:true,newerApprovedContextAvailable:documentContext.id!==latestApprovedContext.id};
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
async function restoreMaterialSnapshot(client,materialId,previous){
  if(previous.exists===false){
    await client.query('UPDATE generated_lesson_materials SET removed=TRUE,updated_at=NOW() WHERE id=$1',[materialId]);
    return;
  }
  await client.query(
    'UPDATE generated_lesson_materials SET title=$2,content=$3,source_references=$4,removed=$5,display_order=$6,updated_at=NOW() WHERE id=$1',
    [materialId,previous.title,JSON.stringify(previous.content),JSON.stringify(previous.sourceReferences||[]),Boolean(previous.removed),previous.displayOrder]
  );
}
async function undoScoped(lessonId,instructorId){
  const{session}=await currentSession(lessonId,instructorId,true);
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const current=await intelligenceService.currentGeneratedDocument(lessonId,instructorId,client,{forUpdate:true});
    if(!current.contextVersionId||!current.rows.length)throw new AppError('There is no generated lesson edit to undo.',409);
    const result=await client.query(
      'SELECT * FROM generated_material_edits WHERE lesson_id=$1 AND instructor_id=$2 AND context_version_id=$3 AND undone_at IS NULL ORDER BY created_at DESC,id DESC FOR UPDATE LIMIT 1',
      [lessonId,instructorId,current.contextVersionId]
    );
    if(!result.rows.length)throw new AppError('There is no AI edit to undo.',409);
    const item=result.rows[0],previous=item.previous_snapshot;
    if(previous.batch===true&&Array.isArray(previous.rows)){
      for(const row of previous.rows)await restoreMaterialSnapshot(client,row.id,row);
    }else{
      await restoreMaterialSnapshot(client,item.generated_material_id,previous);
    }
    await client.query('UPDATE generated_material_edits SET undone_at=NOW() WHERE id=$1',[item.id]);
    await insertMessage(client,session,lessonId,instructorId,'USER','Undo last AI edit.','SYSTEM_ACTION');
    const changedMaterialId=previous.batch===true?null:item.generated_material_id;
    const description='I restored the lesson material to the version before your last AI document edit.';
    const assistant=await insertMessage(client,session,lessonId,instructorId,'ASSISTANT',description,'SYSTEM_ACTION',[],{action:'MATERIAL_EDITED',operation:{action:'UNDO_DOCUMENT_EDIT',target:changedMaterialId?'LESSON_SECTION':'LESSON_DOCUMENT',description},changedMaterialId});
    await client.query('COMMIT');
    const intelligence=await intelligenceService.list(lessonId,instructorId);
    return{message:assistant,materials:intelligence.materials,document:intelligence.document,changedMaterialId,canUndo:false};
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
async function undo(lessonId,instructorId,options={}){
  return withSessionScope(options,'Undo last AI edit.',()=>undoScoped(lessonId,instructorId));
}
async function send(lessonId,instructorId,body){
  const message=String(body?.message||'').trim();
  if(!message)throw new AppError('Enter a request for the lesson assistant.',400);
  if(message.length>2000)throw new AppError('Keep lesson-assistant messages under 2,000 characters.',400);
  return withSessionScope(body,message,async()=>{
    const quizOptions={prompt:message,difficulty:body?.difficulty,questionCount:body?.questionCount,questionType:body?.questionType,quizDraft:body?.quizDraft};
    const quizContinuation=Boolean(body?.quizDraft&&isQuizDraftContinuation(message));
    const explicitQuiz=explicitQuizGeneration(message);
    const quizEdit=quizEditIntent(message,body?.intent);
    const quizRequest=quizIntent(message,body?.intent);
    const notesRequest=generateNotesIntent(message,body?.intent);
    const lessonEdit=editIntent(message,body?.intent)==='EDIT';
    const messageType=quizContinuation||explicitQuiz||quizRequest?'QUIZ_ACTION':quizEdit?'QUIZ_EDIT':notesRequest?'DOCUMENT_ACTION':lessonEdit?'EDIT':'ASK';
    const{session:persistSession}=await currentSession(lessonId,instructorId,true);
    const persistedMessage=await insertMessage(pool,persistSession,lessonId,instructorId,'USER',message,messageType);
    chatSessionScope.getStore().persistedUser={content:message,message:persistedMessage,consumed:false};
    if(quizContinuation)return createQuiz(lessonId,instructorId,quizOptions);
    if(explicitQuiz)return createQuiz(lessonId,instructorId,quizOptions);
    if(quizEdit)return editQuiz(lessonId,instructorId,message);
    if(quizRequest)return createQuiz(lessonId,instructorId,quizOptions);
    if(notesRequest)return generateNotes(lessonId,instructorId,message);
    if(lessonEdit)return edit(lessonId,instructorId,message,body?.selectedMaterialId);
    const{context,session}=await currentSession(lessonId,instructorId,true);
    const history=await pool.query('SELECT role,content FROM lesson_chat_messages WHERE session_id=$1 AND id<>$2 ORDER BY created_at DESC,id DESC LIMIT 20',[session.id,persistedMessage.id]);
    const payload=approvedPayload(context),allowed=new Set(payload.map(item=>item.source));
    const result=await geminiInteractive.run(()=>provider.reply({context:payload,history:history.rows.reverse(),message}),{unavailable:'AI is temporarily unavailable. Please try again.',rateLimited:'The AI service is temporarily rate-limited. Please try again shortly.'});
    const refs=[...new Set((result.sourceReferences||[]).filter(ref=>allowed.has(ref)))];
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      await insertMessage(client,session,lessonId,instructorId,'USER',message,'ASK');
      const assistant=await insertMessage(client,session,lessonId,instructorId,'ASSISTANT',String(result.answer).trim(),'ASK',refs);
      await client.query('COMMIT');
      return{message:assistant,edited:false};
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  });
}

async function deleteConversation(lessonId,instructorId,conversationId){
  const context=await contextService.getApprovedForReasoning(lessonId,instructorId,'Approve the lesson context before using the lesson assistant.');
  const result=await pool.query(
    'DELETE FROM lesson_chat_sessions WHERE id::text=$1 AND lesson_id=$2 AND instructor_id=$3 AND context_version_id=$4 RETURNING id',
    [String(conversationId||''),lessonId,instructorId,context.id]
  );
  if(!result.rows.length)throw new AppError('AI conversation not found.',404);
  return{deletedConversationId:result.rows[0].id};
}

module.exports={list,send,createQuiz,undo,deleteConversation,quizEditPlan};
