const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const vm=require('node:vm');
require('../src/config/env');
const pool=require('../src/db/pool');
const chat=require('../src/services/lesson-chat.service');
const Provider=require('../src/reasoning/GeminiReasoningProvider');
const ChatProvider=require('../src/reasoning/GeminiLessonChatProvider');
const interactive=require('../src/services/geminiInteractive.service');
const targeting=require('../../shared/quizEditTargeting.cjs');
const {quizGenerationSpec}=require('../src/utils/quizGenerationSpec');

async function main(){
  const examples=[
    'Generate a 5-question quiz with 3 multiple-choice questions and 2 problem-solving questions.',
    'Generate a 5-question quiz. Questions 2 and 4 should be problem solving.',
    'Generate a 5-question quiz with 2 problem-solving questions. Enable tips and formulas for them.',
    'Generate a 5-question quiz. Questions 1, 3, and 5 multiple choice. Questions 2 and 4 problem solving.',
    'Generate a 5-question quiz with 3 multiple-choice questions and 2 problem-solving questions. Make the problem-solving questions require handwritten solutions. Enable a helpful tip and formula for both problem-solving questions. Use medium difficulty.',
  ];
  const scope={};vm.runInNewContext(fs.readFileSync(require.resolve('../../shared/quizEditTargeting.cjs'),'utf8'),scope);
  const browser=vm.runInNewContext("globalThis[Symbol.for('sea-it-solved.quizEditTargeting')]",scope);
  for(const message of [...examples,'create a quiz','create a new quiz','generate 5 questions','make me a quiz','Generate a 5-question quiz and make questions 2 and 4 problem solving.']){
    assert(targeting.explicitQuizGeneration(message),message);assert(browser.explicitQuizGeneration(message));
    assert.equal(targeting.quizEditIntent(message,'EDIT_QUIZ'),false);
    assert.equal(browser.quizEditIntent(message,'EDIT_QUIZ'),false);
  }
  for(const [message,operation] of [
    ['make question 2 problem solving','update_question'],
    ['make questions 2 and 4 problem solving','update_multiple_questions'],
    ['change question 4 to multiple choice','update_question'],
    ['enable the formula on question 2','update_question'],
    ['make the last question harder','update_question'],
  ]){
    assert.equal(targeting.explicitQuizGeneration(message),false);
    assert(targeting.quizEditIntent(message));assert(browser.quizEditIntent(message));
    assert.equal(targeting.quizEditPlan(message,{questionCount:5}).operation,operation);
  }
  assert.equal(targeting.quizEditPlan('create new questions instead').operation,'regenerate_quiz');
  assert.equal(targeting.explicitQuizGeneration('make quiz 2 harder'),false);
  assert.equal(targeting.quizEditIntent('make quiz 2 harder'),true);
  assert.throws(()=>quizGenerationSpec('3 multiple-choice questions and 3 problem-solving questions',5),/exceed/);
  console.log('PASS shared frontend/backend explicit generation priority; D/E targeted-edit classification');

  const ids={},originalRequest=Provider.prototype.request,originalChat=ChatProvider.prototype.editQuiz,originalRun=interactive.run;
  let calls=0,mode='valid';
  interactive.run=operation=>operation({attempt:1});
  ChatProvider.prototype.editQuiz=async()=>{throw new Error('Generation incorrectly entered edit route');};
  Provider.prototype.request=async(context,instruction,schema)=>{
    calls++;
    assert(schema.properties.questions.items.properties.type.enum.includes('PROBLEM_SOLVING'));
    const count=Number(instruction.match(/Create exactly (\d+)/)[1]);
    const order=JSON.parse(instruction.match(/exact per-question type order: (\[[^\]]+\])/i)?.[1]||JSON.stringify(Array(count).fill('MULTIPLE_CHOICE')));
    const tip=/Set allowTip=true/.test(instruction),formula=/allowFormula=true/.test(instruction);
    const questions=order.map((type,index)=>({
      type,topic:'Differentiation',prompt:'Question '+(index+1)+': differentiate the polynomial.',
      choices:type==='MULTIPLE_CHOICE'?['0','1','2','3']:[],correctAnswer:type==='MULTIPLE_CHOICE'?'2':'',explanation:'',
      maxPoints:10,problemSettings:{instructions:'Show your handwritten steps.',rubric:'INSTRUCTOR ONLY: apply the power rule.',
        allowTip:tip,tip:tip?'Identify the exponent before applying the rule.':'',
        allowFormula:formula,formula:formula?'$\\frac{d}{dx}x^n=nx^{n-1}$':''},
      sourceReferences:[context[0].source],
    }));
    if(mode==='wrong-type')questions[order.indexOf('PROBLEM_SOLVING')].type='MULTIPLE_CHOICE';
    if(mode==='missing-help')questions.find(q=>q.type==='PROBLEM_SOLVING').problemSettings.tip='';
    return{title:'Differentiation Quiz',instructions:'Answer all questions.',questions};
  };
  try{
    const suffix=crypto.randomBytes(5).toString('hex');
    ids.user=(await pool.query("INSERT INTO users(first_name,last_name,email,password_hash,role,status) VALUES('Generation','Verification',$1,'verification-only','INSTRUCTOR','ACTIVE') RETURNING id",['generation-'+suffix+'@hau.edu.ph'])).rows[0].id;
    ids.subject=(await pool.query("INSERT INTO subjects(code,name) VALUES($1,'Generation verification') RETURNING id",['GQ'+suffix])).rows[0].id;
    ids.section=(await pool.query("INSERT INTO sections(subject_id,instructor_id,section_name,join_code) VALUES($1,$2,'Verification',$3) RETURNING id",[ids.subject,ids.user,suffix.toUpperCase()])).rows[0].id;
    ids.lesson=(await pool.query("INSERT INTO lesson_sessions(section_id,instructor_id,title) VALUES($1,$2,'Generation verification') RETURNING id",[ids.section,ids.user])).rows[0].id;
    ids.context=(await pool.query("INSERT INTO lesson_context_versions(lesson_id,section_id,instructor_id,version_number,status,approved_at) VALUES($1,$2,$3,1,'APPROVED',NOW()) RETURNING id",[ids.lesson,ids.section,ids.user])).rows[0].id;
    await pool.query("INSERT INTO lesson_context_chunks(context_version_id,lesson_id,chunk_type,chunk_order,source,reviewed_text) VALUES($1,$2,'WHITEBOARD',1,$3,'The power rule differentiates polynomials.')",[ids.context,ids.lesson,JSON.stringify({pageNumber:1})]);
    const quizzes=async()=>(await pool.query('SELECT * FROM lesson_quizzes WHERE lesson_id=$1 ORDER BY created_at,id',[ids.lesson])).rows;
    assert.equal((await quizzes()).length,0,'F must start without a draft.');
    for(const [index,prompt] of examples.entries()){
      const before=await quizzes();
      const oldQuestions=(await pool.query('SELECT qq.* FROM lesson_quiz_questions qq JOIN lesson_quizzes q ON q.id=qq.quiz_id WHERE q.lesson_id=$1 ORDER BY qq.id',[ids.lesson])).rows;
      const response=await chat.send(ids.lesson,ids.user,{message:prompt,intent:'EDIT_QUIZ'});
      assert.equal(response.quizCreated,true);assert.equal(response.quizEdited,undefined);
      assert(!response.message.content.includes('Create a draft quiz'));
      const after=await quizzes();
      assert.equal(after.length,before.length+1,'Exactly one new draft.');
      const created=after.find(q=>!before.some(previous=>previous.id===q.id));
      assert.equal(created.status,'DRAFT');assert.equal(created.difficulty,'MEDIUM');
      const questions=(await pool.query('SELECT * FROM lesson_quiz_questions WHERE quiz_id=$1 ORDER BY question_order',[created.id])).rows;
      assert.equal(questions.length,5);
      const spec=quizGenerationSpec(prompt,5);
      assert.deepEqual(questions.map(q=>q.question_type),spec.questionTypes);
      assert.equal(questions.filter(q=>q.question_type==='MULTIPLE_CHOICE').length,3);
      assert.equal(questions.filter(q=>q.question_type==='PROBLEM_SOLVING').length,2);
      for(const question of questions.filter(q=>q.question_type==='PROBLEM_SOLVING')){
        assert.equal(question.manual_grading,true);assert.equal(Number(question.max_points),10);
        assert(question.problem_settings.rubric);
        assert.equal(question.problem_settings.allowTip,spec.allowTip);
        assert.equal(question.problem_settings.allowFormula,spec.allowFormula);
        if(spec.allowTip)assert(question.problem_settings.tip);
        if(spec.allowFormula)assert(question.problem_settings.formula);
        assert.equal(question.correct_answer,'');
      }
      const unchanged=(await pool.query('SELECT * FROM lesson_quiz_questions WHERE id=ANY($1::uuid[]) ORDER BY id',[oldQuestions.map(q=>q.id)])).rows;
      assert.deepEqual(unchanged,oldQuestions,'Existing quiz questions must remain byte-for-byte unchanged.');
      console.log('PASS generation case '+(index+1)+': new persisted draft, exact mix/positions/help; existing quizzes untouched');
    }
    const before=(await quizzes()).length;
    for(const invalidMode of ['wrong-type','missing-help']){
      mode=invalidMode;
      await assert.rejects(()=>chat.send(ids.lesson,ids.user,{message:examples[2]}),error=>error.code==='INVALID_PROVIDER_OUTPUT');
      assert.equal((await quizzes()).length,before,'Invalid output must never create a partial draft.');
    }
    mode='valid';
    await chat.send(ids.lesson,ids.user,{message:'Generate a 5-question quiz.'});
    assert.equal((await quizzes()).length,before+1,'Ordinary objective generation still works.');
    assert(calls>=examples.length+1);
    console.log('PASS invalid provider mix/help rejected before save; ordinary objective generation preserved');
    console.log('QUIZ GENERATION ROUTING: PASS (real DB; provider network mocked)');
  } finally {
    Provider.prototype.request=originalRequest;ChatProvider.prototype.editQuiz=originalChat;interactive.run=originalRun;
    if(ids.lesson){await pool.query('DELETE FROM lesson_quizzes WHERE lesson_id=$1',[ids.lesson]);await pool.query('DELETE FROM lesson_sessions WHERE id=$1',[ids.lesson]);}
    if(ids.section)await pool.query('DELETE FROM sections WHERE id=$1',[ids.section]);
    if(ids.subject)await pool.query('DELETE FROM subjects WHERE id=$1',[ids.subject]);
    if(ids.user)await pool.query('DELETE FROM users WHERE id=$1',[ids.user]);
    await pool.end();
  }
}
main().catch(error=>{console.error('QUIZ GENERATION ROUTING: FAIL',error);process.exitCode=1;});
