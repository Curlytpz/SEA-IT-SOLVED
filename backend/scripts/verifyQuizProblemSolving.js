const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');
const pool = require('../src/db/pool');
const intelligence = require('../src/services/lesson-intelligence.service');
const attempts = require('../src/services/phase6.service');
const solutions = require('../src/services/quiz-solution.service');
const { solutionSubmissionStorage: storage } = require('../src/storage');
const interactive = require('../src/services/geminiInteractive.service');
const OCR = require('../src/recognition/providers/GeminiWhiteboardProvider');
const Reasoning = require('../src/reasoning/GeminiReasoningProvider');
const ChatProvider = require('../src/reasoning/GeminiLessonChatProvider');
const chat = require('../src/services/lesson-chat.service');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const file = { buffer: PNG, size: PNG.length, mimetype: 'image/png', originalname: 'work.png' };
const normalized = { plainText: 'Apply the power rule.', mathExpressions: [{ latex: "f'(x)=2x", display: true }], warnings: [] };
const advisory = { assessment: 'LIKELY_CORRECT', summary: 'ADVISORY_PRIVATE', strengths: ['Power rule'], possible_errors: [], suggested_feedback: 'Explain your reasoning.', confidence: 0.8 };
const status = code => error => error.statusCode === code;

async function main() {
  if (!process.argv.includes('--skip-migration')) {
    await pool.query(await fs.readFile(path.resolve(__dirname, '../src/db/migration_quiz_problem_solving.sql'), 'utf8'));
  }
  const oldCounts = (await pool.query('SELECT (SELECT COUNT(*) FROM solution_activities) activities,(SELECT COUNT(*) FROM solution_submissions) submissions')).rows[0];
  const ids = { users: [], keys: [] };
  const originalExtract = OCR.prototype.extract, originalReview = Reasoning.prototype.reviewSolution, originalRun = interactive.run;
  const originalChatRequest = ChatProvider.prototype.request;
  let ocrCalls = 0, aiCalls = 0, server;
  OCR.prototype.extract = async () => { ocrCalls++; return { normalized }; };
  Reasoning.prototype.reviewSolution = async input => {
    aiCalls++;
    assert.equal(input.activity.expectedSolutionOrRubric, 'HIDDEN_RUBRIC');
    assert(input.studentSolution.extractedText.length <= 12000);
    assert(input.approvedLessonContextExcerpt.length <= env.SOLUTION_REVIEW_CONTEXT_MAX_CHARS);
    return advisory;
  };
  interactive.run = operation => operation();
  try {
    const suffix = crypto.randomBytes(5).toString('hex');
    for (const [role, label] of [['INSTRUCTOR','owner'],['INSTRUCTOR','other'],['STUDENT','enrolled'],['STUDENT','outsider']]) {
      const domain = role === 'STUDENT' ? 'student.hau.edu.ph' : 'hau.edu.ph';
      const result = await pool.query(`INSERT INTO users(first_name,last_name,email,student_number,password_hash,role,status)
        VALUES('Quiz integration',$1,$2,$3,'verification-only',$4,'ACTIVE') RETURNING id`,
        [label, `quiz-problem-${label}-${suffix}@${domain}`, role === 'STUDENT' ? label + suffix : null, role]);
      ids.users.push(result.rows[0].id);
    }
    const [instructor, otherInstructor, student, outsider] = ids.users;
    ids.subject = (await pool.query("INSERT INTO subjects(code,name) VALUES($1,'Quiz integration verification') RETURNING id", ['QP'+suffix])).rows[0].id;
    ids.section = (await pool.query("INSERT INTO sections(subject_id,instructor_id,section_name,join_code) VALUES($1,$2,'Verification',$3) RETURNING id", [ids.subject,instructor,suffix.toUpperCase()])).rows[0].id;
    ids.lesson = (await pool.query("INSERT INTO lesson_sessions(section_id,instructor_id,title) VALUES($1,$2,'Quiz integration verification') RETURNING id", [ids.section,instructor])).rows[0].id;
    ids.context = (await pool.query("INSERT INTO lesson_context_versions(lesson_id,section_id,instructor_id,version_number,status,approved_at) VALUES($1,$2,$3,1,'APPROVED',NOW()) RETURNING id", [ids.lesson,ids.section,instructor])).rows[0].id;
    await pool.query("INSERT INTO enrollments(section_id,student_id,status,approved_at) VALUES($1,$2,'APPROVED',NOW())", [ids.section,student]);
    ids.quiz = (await pool.query(`INSERT INTO lesson_quizzes(lesson_id,context_version_id,instructor_id,title,instructions,difficulty,status,provider,provider_version)
      VALUES($1,$2,$3,'Mixed quiz','Answer all questions.','MEDIUM','DRAFT','TEST','quiz-integration') RETURNING id`, [ids.lesson,ids.context,instructor])).rows[0].id;
    const problem = (tipOn, formulaOn) => ({
      type: 'PROBLEM_SOLVING', prompt: 'Differentiate f(x) = x^2.', choices: [], correctAnswer: '', explanation: '',
      maxPoints: tipOn ? 10 : 5,
      problemSettings: { instructions: 'Show all steps.', rubric: 'HIDDEN_RUBRIC', allowTip: tipOn, tip: 'Use the power rule.',
        allowFormula: formulaOn, formula: "f'(x)=2x" },
    });
    const quiz = await intelligence.replaceQuizQuestions(ids.quiz,instructor,[
      { type:'MULTIPLE_CHOICE',prompt:'What is two plus two?',choices:['2','3','4','5'],correctAnswer:'4',explanation:'Addition.',maxPoints:2 },
      problem(true,false), problem(false,true),
    ]);
    assert.equal(quiz.questions.length,3);
    assert.equal(quiz.questions[1].manualGrading,true);
    assert.equal(quiz.questions[1].problemSettings.rubric,'HIDDEN_RUBRIC');
    const [objective,q2,q3] = quiz.questions;

    // Real chat dispatcher + provider prompt/schema + canonical patching, mock only network I/O.
    let chatCalls=0;
    ChatProvider.prototype.request=async (_text,schema) => {
      chatCalls++;
      const text=String(_text);
      const plan=JSON.parse(text.split('SERVER EDIT PLAN:\n')[1].split('\n\nQUIZ EDIT INSTRUCTION:')[0]);
      const current=JSON.parse(text.split('CURRENT DRAFT QUIZZES IN DISPLAY ORDER:\n')[1].split('\n\nRECENT CONVERSATION:')[0])[plan.quizNumber-1];
      assert(schema.properties.questions.items.properties.type.enum.includes('PROBLEM_SOLVING'));
      return { action:'UPDATE_QUIZ',operation:plan.operation,quizNumber:plan.quizNumber,
        targetQuestionNumbers:plan.targetQuestionNumbers,order:[],message:'Provider summary must not select the target.',
        questions:plan.targetQuestionNumbers.map(number=>({
          ...current.questions[number-1],type:'PROBLEM_SOLVING',prompt:'Differentiate f(x) = x^2.',
          correctAnswer:'',choices:[],explanation:'',maxPoints:999,
          problemSettings:{instructions:'Show all steps.',rubric:'HIDDEN_RUBRIC',
            allowTip:true,tip:plan.requestedChange==='less_revealing_tip'?'Identify the relevant rule.':'Start by identifying the power rule.',
            allowFormula:true,formula:"f'(x)=2x"},
        })),
      };
    };
    const chatEdit=async (message,targets) => {
      const before=(await pool.query('SELECT * FROM lesson_quiz_questions WHERE quiz_id=$1 ORDER BY question_order',[ids.quiz])).rows;
      const edited=await chat.send(ids.lesson,instructor,{message});
      assert.equal(edited.quizEdited,true,message);
      assert.equal(edited.quiz.questions.length,3);
      const after=(await pool.query('SELECT * FROM lesson_quiz_questions WHERE quiz_id=$1 ORDER BY question_order',[ids.quiz])).rows;
      assert.deepEqual(after.map(row=>row.id),before.map(row=>row.id));
      for(let i=0;i<after.length;i++)if(!targets.includes(i+1))assert.deepEqual(after[i],before[i],'Untouched question changed: '+message);
      return edited.quiz;
    };
    await intelligence.updateQuestion(ids.quiz,q2.id,instructor,{...objective,id:q2.id,maxPoints:10});
    await chatEdit('make question 2 problem solving',[2]);
    await chatEdit('turn the last question into solution required',[3]);
    let edited=await chatEdit('make questions 2 and 3 problem solving',[2,3]);
    assert.equal(edited.questions[1].maxPoints,10);assert.equal(edited.questions[2].maxPoints,5);
    const callsBeforeToggles=chatCalls;
    await chatEdit('enable formula for question 2',[2]);
    edited=await chatEdit('disable tip for question 2',[2]);
    assert.equal(chatCalls,callsBeforeToggles,'Stored help switches must not call Gemini.');
    assert.equal(edited.questions[1].problemSettings.allowTip,false);
    assert.equal(edited.questions[1].problemSettings.allowFormula,true);
    await chatEdit('generate a tip for the last question',[3]);
    edited=await chatEdit('make the hint less revealing',[3]);
    assert.equal(edited.questions[2].problemSettings.tip,'Identify the relevant rule.');
    assert.equal(edited.questions[2].problemSettings.allowTip,false,'Generating stored help must preserve the OFF switch.');
    await chatEdit('change formula for question 3',[3]);
    await chatEdit('make it harder',[3]);
    // Restore only the test's intended pre-publish switches; no unrelated questions are replaced.
    await intelligence.updateQuestion(ids.quiz,q3.id,instructor,q3);
    console.log('PASS targeted conversion + relative/multi targets + stored help edits + zero-AI toggles + untouched rows');
    // Save/reload settings through the same atomic question path, not a separate activity.
    const saved = await intelligence.updateQuestion(ids.quiz,q2.id,instructor,{...q2,problemSettings:{...q2.problemSettings,tip:'Start with the power rule.'}});
    assert.equal(saved.problemSettings.tip,'Start with the power rule.');
    assert.equal(saved.maxPoints,10);
    await intelligence.publishQuiz(ids.quiz,instructor);
    const payload = await attempts.startAttempt(ids.quiz,student);
    ids.attempt = payload.attempt.id;
    assert.equal(payload.questions[1].tip,'Start with the power rule.');
    assert.equal(payload.questions[1].formula,'');
    assert.equal(payload.questions[2].tip,'');
    assert(payload.questions[2].formula);
    assert(!JSON.stringify(payload).includes('HIDDEN_RUBRIC'));
    assert(!JSON.stringify(payload).includes('problemSettings'));
    await assert.rejects(()=>attempts.startAttempt(ids.quiz,outsider),status(404));
    await assert.rejects(()=>solutions.listSolutions(ids.quiz,otherInstructor),status(404));

    const app = require('../src/app');
    server = app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const base = 'http://127.0.0.1:'+server.address().port+'/api';
    const token = jwt.sign({id:student},env.JWT_SECRET,{expiresIn:'5m'});
    const form = new FormData(); form.append('image',new Blob([PNG],{type:'image/png'}),'work.png');
    const response = await fetch(base+`/student/attempts/${ids.attempt}/answers/${q2.id}/solution`,{
      method:'POST',headers:{Authorization:'Bearer '+token},body:form,
    });
    const uploaded = await response.json();
    assert.equal(response.status,201,JSON.stringify(uploaded));
    const first = uploaded.data;
    assert.equal(first.revision,1);
    assert.equal(ocrCalls,0); assert.equal(aiCalls,0);
    const q2row = async () => (await pool.query('SELECT * FROM quiz_attempt_answers WHERE id=$1',[first.id])).rows[0];
    ids.keys.push((await q2row()).solution_file.key);
    const replacement = await solutions.uploadSolution(ids.attempt,q2.id,student,file);
    assert.equal(replacement.id,first.id); assert.equal(replacement.revision,2);
    ids.keys.push((await q2row()).solution_file.key);
    assert.equal((await q2row()).recognition_status,'PENDING');
    await assert.rejects(()=>solutions.uploadSolution(ids.attempt,q2.id,outsider,file),status(404));
    await assert.rejects(()=>solutions.uploadSolution(ids.attempt,objective.id,student,file),status(400));
    await assert.rejects(()=>solutions.uploadSolution(ids.attempt,q3.id,student,{...file,mimetype:'image/jpeg'}),status(400));
    await assert.rejects(()=>attempts.saveAnswer(ids.attempt,q2.id,student,'bypass upload'),status(400));
    await assert.rejects(()=>attempts.submitAttempt(ids.attempt,student),status(422));
    assert.equal((await attempts.attemptPayload(ids.attempt,student)).attempt.status,'IN_PROGRESS');
    const third = await solutions.uploadSolution(ids.attempt,q3.id,student,file);
    await attempts.saveAnswer(ids.attempt,objective.id,student,'4');
    let result = await attempts.submitAttempt(ids.attempt,student);
    assert.equal(result.attempt.status,'SUBMITTED');
    await assert.rejects(()=>solutions.reviewAttempts(ids.quiz,otherInstructor),status(404));
    assert(!(await solutions.reviewQueue(otherInstructor)).some(row=>row.quizId===ids.quiz));
    const review=await solutions.reviewAttempts(ids.quiz,instructor);
    assert.equal(review.quiz.lessonId,ids.lesson);
    assert.equal(review.attempts[0].pending,2);
    assert.equal(review.attempts[0].responses.length,3);
    assert.equal(review.attempts[0].objectiveScore,2);
    assert.equal((await solutions.reviewQueue(instructor)).find(row=>row.quizId===ids.quiz).pending,2);
    const sectionReview=await solutions.sectionReviews(ids.section,instructor);
    const sectionQuiz=sectionReview.quizzes.find(row=>row.quizId===ids.quiz);
    assert.equal(sectionReview.summary.pendingResponses,2);
    assert.equal(sectionReview.summary.submittedAttempts,1);
    assert.equal(sectionQuiz.pendingResponses,2);
    assert.equal(sectionQuiz.problemSolvingQuestions,2);
    await assert.rejects(()=>solutions.sectionReviews(ids.section,otherInstructor),status(404));
    const ownerToken=jwt.sign({id:instructor},env.JWT_SECRET,{expiresIn:'5m'});
    assert.equal((await fetch(base+'/instructor/quizzes/'+ids.quiz+'/attempts',{headers:{Authorization:'Bearer '+ownerToken}})).status,200);
    assert.equal((await fetch(base+'/instructor/quizzes/'+ids.quiz+'/attempts',{headers:{Authorization:'Bearer '+token}})).status,403);
    const sectionResponse=await fetch(base+'/instructor/sections/'+ids.section+'/reviews',{headers:{Authorization:'Bearer '+ownerToken}});
    assert.equal(sectionResponse.status,200);
    assert.equal((await sectionResponse.json()).data.summary.pendingResponses,2);
    const otherToken=jwt.sign({id:otherInstructor},env.JWT_SECRET,{expiresIn:'5m'});
    assert.equal((await fetch(base+'/instructor/sections/'+ids.section+'/reviews',{headers:{Authorization:'Bearer '+otherToken}})).status,404);
    console.log('PASS instructor attempt list, queue count and HTTP role/ownership isolation');
    assert.equal(result.attempt.maxScore,17); assert.equal(result.attempt.score,null); assert.equal(result.attempt.percentage,null);
    assert.equal(result.questions[0].pointsAwarded,2);
    assert.equal(result.questions[1].pointsAwarded,null);
    assert.equal(ocrCalls,0); assert.equal(aiCalls,0);
    assert(!Object.hasOwn(result.questions[1],'correctAnswer'));
    assert(!Object.hasOwn(result.questions[1],'explanation'));
    await assert.rejects(()=>solutions.uploadSolution(ids.attempt,q2.id,student,file),status(409));
    await assert.rejects(()=>solutions.image(first.id,{id:outsider,role:'STUDENT'}),status(404));
    await assert.rejects(()=>solutions.image(first.id,{id:otherInstructor,role:'INSTRUCTOR'}),status(404));
    const imageResponse = await fetch(base+first.imageUrl.replace('/api',''),{headers:{Authorization:'Bearer '+token}});
    assert.equal(imageResponse.status,200);
    assert.equal((await imageResponse.arrayBuffer()).byteLength,PNG.length);
    console.log('PASS mixed quiz/settings + multipart upload + exact attempt/question ownership + zero automatic Gemini calls');

    await assert.rejects(()=>solutions.recognize(first.id,instructor,{extract:async()=>{throw new Error('simulated OCR failure');}}),/simulated OCR/);
    assert.equal((await q2row()).recognition_status,'FAILED');
    const retained = await storage.open((await q2row()).solution_file.key); assert.equal(retained.size,PNG.length); retained.stream.destroy();
    await solutions.recognize(first.id,instructor);
    assert.equal(ocrCalls,1);
    assert.equal((await q2row()).recognition_status,'READY');
    await solutions.analyze(first.id,instructor);
    assert.equal(aiCalls,1); assert.equal((await q2row()).points_awarded,null); assert.equal((await q2row()).graded_at,null);
    assert.equal((await attempts.attemptPayload(ids.attempt,student)).attempt.status,'SUBMITTED');
    assert(!JSON.stringify(await attempts.attemptPayload(ids.attempt,student)).includes('ADVISORY_PRIVATE'));
    await assert.rejects(()=>solutions.analyze(first.id,instructor,{review:async()=>({...advisory,officialScore:10})}),status(422));
    await assert.rejects(()=>solutions.analyze(first.id,instructor,{review:async()=>{throw new Error('simulated AI failure');}}),/simulated AI failure/);
    assert.equal((await q2row()).ai_review.summary,'ADVISORY_PRIVATE');
    await assert.rejects(()=>solutions.analyze(first.id,otherInstructor),status(404));
    console.log('PASS OCR failure preserves original; explicit recognition/advisory only; AI cannot grade or leak student-visible fields');

    await assert.rejects(()=>solutions.grade(first.id,otherInstructor,{pointsAwarded:7}),status(404));
    await assert.rejects(()=>solutions.grade(first.id,instructor,{pointsAwarded:11}),status(422));
    await assert.rejects(()=>solutions.grade(first.id,instructor,{pointsAwarded:''}),status(422));
    await solutions.grade(first.id,instructor,{pointsAwarded:7,instructorFeedback:'Show the power-rule statement.'});
    result=await attempts.attemptPayload(ids.attempt,student);
    assert.equal(result.attempt.status,'SUBMITTED'); assert.equal(result.attempt.score,null);
    assert.equal(result.questions[1].pointsAwarded,7);
    assert.equal((await solutions.reviewAttempts(ids.quiz,instructor)).attempts[0].pending,1);
    assert.equal((await solutions.reviewQueue(instructor)).find(row=>row.quizId===ids.quiz).pending,1);
    assert.equal((await solutions.sectionReviews(ids.section,instructor)).summary.pendingResponses,1);
    await solutions.grade(third.id,instructor,{pointsAwarded:4,instructorFeedback:'Good reasoning.'});
    result=await attempts.attemptPayload(ids.attempt,student);
    assert.equal(result.attempt.status,'GRADED'); assert.equal(result.attempt.score,13); assert.equal(result.attempt.maxScore,17);
    assert.equal(result.attempt.percentage,76.47);
    assert.equal((await solutions.reviewAttempts(ids.quiz,instructor)).attempts[0].status,'GRADED');
    assert.equal((await solutions.reviewAttempts(ids.quiz,instructor)).attempts[0].pending,0);
    assert(!(await solutions.reviewQueue(instructor)).some(row=>row.quizId===ids.quiz));
    assert.equal((await solutions.sectionReviews(ids.section,instructor)).summary.pendingResponses,0);
    assert.equal((await solutions.sectionReviews(ids.section,instructor)).summary.gradedAttempts,1);
    assert.equal((await attempts.quizHistory(student))[0].score,13);
    assert.equal((await attempts.startAttempt(ids.quiz,student)).attempt.id,ids.attempt);
    await solutions.grade(first.id,instructor,{pointsAwarded:8,instructorFeedback:'Updated after manual review.'});
    assert.equal((await attempts.attemptPayload(ids.attempt,student)).attempt.score,14);
    const returned = await fetch(base+'/student/attempts/'+ids.attempt,{headers:{Authorization:'Bearer '+token}});
    const studentJson = JSON.stringify(await returned.json());
    for (const hidden of ['HIDDEN_RUBRIC','ADVISORY_PRIVATE','aiReview','recognition_result','solution_file']) assert(!studentJson.includes(hidden),hidden+' leaked');
    console.log('PASS official manual scores + pending until ALL graded + final weighted total + grade correction + reload');

    const analytics = await attempts.quizAnalytics(ids.quiz,instructor);
    assert.equal(analytics.quiz.lessonId,ids.lesson);
    assert.equal(analytics.overview.submitted,1);
    assert.equal(analytics.overview.averagePercentage,82.35);
    assert.equal(analytics.questions[0].correct,1);
    await assert.rejects(()=>attempts.quizAnalytics(ids.quiz,otherInstructor),status(404));
    let mcqId;
    try {
      mcqId=(await pool.query(`INSERT INTO lesson_quizzes(lesson_id,context_version_id,instructor_id,title,difficulty,status,provider,provider_version)
        VALUES($1,$2,$3,'Objective regression','MEDIUM','DRAFT','TEST','quiz-integration') RETURNING id`,[ids.lesson,ids.context,instructor])).rows[0].id;
      const mcq=await intelligence.replaceQuizQuestions(mcqId,instructor,[objective,{...objective,prompt:'Select four.'}]);
      await intelligence.publishQuiz(mcqId,instructor);
      const started=await attempts.startAttempt(mcqId,student);
      await attempts.saveAnswer(started.attempt.id,mcq.questions[0].id,student,'4');
      await attempts.saveAnswer(started.attempt.id,mcq.questions[1].id,student,'2');
      const finished=await attempts.submitAttempt(started.attempt.id,student);
      assert.equal(finished.attempt.status,'GRADED');
      assert.equal(finished.attempt.score,2);assert.equal(finished.attempt.maxScore,4);
      assert.equal(finished.attempt.percentage,50);
      assert.equal(finished.questions[0].isCorrect,true);assert.equal(finished.questions[1].isCorrect,false);
      assert.equal((await attempts.attemptPayload(started.attempt.id,student)).attempt.score,2);
      assert.equal((await attempts.quizAnalytics(mcqId,instructor)).overview.averagePercentage,50);
    } finally {
      if(mcqId){await pool.query('DELETE FROM quiz_attempts WHERE quiz_id=$1',[mcqId]);await pool.query('DELETE FROM lesson_quizzes WHERE id=$1',[mcqId]);}
    }
    console.log('PASS MCQ-only publishing/attempt/scoring/reload + existing analytics and ownership');

    // Explicit confirmation allows unanswered work, without fabricating answers or changing manual scoring.
    await pool.query("INSERT INTO enrollments(section_id,student_id,status,approved_at) VALUES($1,$2,'APPROVED',NOW())",[ids.section,outsider]);
    const blank=await attempts.startAttempt(ids.quiz,outsider);
    await assert.rejects(()=>attempts.submitAttempt(blank.attempt.id,outsider),status(422));
    const outsiderToken=jwt.sign({id:outsider},env.JWT_SECRET,{expiresIn:'5m'});
    const blankResponse=await fetch(base+'/student/attempts/'+blank.attempt.id+'/submit',{method:'POST',headers:{Authorization:'Bearer '+outsiderToken,'Content-Type':'application/json'},body:JSON.stringify({confirmUnanswered:true})});
    assert.equal(blankResponse.status,200);
    const blankResult=(await blankResponse.json()).data;
    assert.equal(blankResult.attempt.status,'SUBMITTED');
    assert.equal(blankResult.questions[0].pointsAwarded,0);
    for(const question of blankResult.questions.filter(q=>q.type==='PROBLEM_SOLVING')){
      assert.equal(question.solution,null);assert.equal(question.answer,'');assert.equal(question.pointsAwarded,null);
    }
    assert.equal((await solutions.reviewAttempts(ids.quiz,instructor)).attempts.find(a=>a.id===blank.attempt.id).pending,2);
    console.log('PASS explicit Submit Anyway: unanswered objective zero, missing solutions retained as unanswered, manual review still required');

    let isolationSection,isolationLesson;
    try{
      isolationSection=(await pool.query("INSERT INTO sections(subject_id,instructor_id,section_name,join_code) VALUES($1,$2,'Review isolation',$3) RETURNING id",[ids.subject,instructor,('R'+suffix).toUpperCase()])).rows[0].id;
      isolationLesson=(await pool.query("INSERT INTO lesson_sessions(section_id,instructor_id,title) VALUES($1,$2,'Other section lesson') RETURNING id",[isolationSection,instructor])).rows[0].id;
      const isolationContext=(await pool.query("INSERT INTO lesson_context_versions(lesson_id,section_id,instructor_id,version_number,status,approved_at) VALUES($1,$2,$3,1,'APPROVED',NOW()) RETURNING id",[isolationLesson,isolationSection,instructor])).rows[0].id;
      const isolationQuiz=(await pool.query("INSERT INTO lesson_quizzes(lesson_id,context_version_id,instructor_id,title,instructions,difficulty,status,provider,provider_version) VALUES($1,$2,$3,'Other section quiz','Test','MEDIUM','PUBLISHED','TEST','review-isolation') RETURNING id",[isolationLesson,isolationContext,instructor])).rows[0].id;
      assert(!(await solutions.sectionReviews(ids.section,instructor)).quizzes.some(row=>row.quizId===isolationQuiz));
      assert((await solutions.sectionReviews(isolationSection,instructor)).quizzes.some(row=>row.quizId===isolationQuiz));
    }finally{
      if(isolationLesson)await pool.query('DELETE FROM lesson_sessions WHERE id=$1',[isolationLesson]);
      if(isolationSection)await pool.query('DELETE FROM sections WHERE id=$1',[isolationSection]);
    }
    console.log('PASS section review summary counts, grading refresh, section isolation and cross-instructor denial');

    const retired = await fetch(base+'/student/lessons/'+ids.lesson+'/solution-activities',{headers:{Authorization:'Bearer '+token}});
    assert.equal(retired.status,404);
    assert.deepEqual((await pool.query('SELECT (SELECT COUNT(*) FROM solution_activities) activities,(SELECT COUNT(*) FROM solution_submissions) submissions')).rows[0],oldCounts);
    console.log('PASS retired standalone endpoint; historical tables/data untouched');
    console.log('QUIZ PROBLEM-SOLVING INTEGRATION: PASS (real DB/HTTP, mocked OCR/AI)');
  } finally {
    OCR.prototype.extract=originalExtract; Reasoning.prototype.reviewSolution=originalReview; interactive.run=originalRun;
    ChatProvider.prototype.request=originalChatRequest;
    if(server)await new Promise(resolve=>server.close(resolve));
    if(ids.quiz){
      const rows=await pool.query('SELECT aa.solution_file FROM quiz_attempt_answers aa JOIN quiz_attempts a ON a.id=aa.attempt_id WHERE a.quiz_id=$1',[ids.quiz]);
      for(const row of rows.rows)if(row.solution_file?.key)ids.keys.push(row.solution_file.key);
      await pool.query('DELETE FROM quiz_attempts WHERE quiz_id=$1',[ids.quiz]);
      await pool.query('DELETE FROM lesson_quizzes WHERE id=$1',[ids.quiz]);
    }
    for(const key of new Set(ids.keys))await storage.delete(key).catch(()=>{});
    if(ids.lesson)await pool.query('DELETE FROM lesson_sessions WHERE id=$1',[ids.lesson]);
    if(ids.section){await pool.query('DELETE FROM enrollments WHERE section_id=$1',[ids.section]);await pool.query('DELETE FROM sections WHERE id=$1',[ids.section]);}
    if(ids.subject)await pool.query('DELETE FROM subjects WHERE id=$1',[ids.subject]);
    if(ids.users.length)await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[ids.users]);
    await pool.end();
  }
}
main().catch(error=>{console.error('QUIZ PROBLEM-SOLVING INTEGRATION: FAIL',error);process.exitCode=1;});
