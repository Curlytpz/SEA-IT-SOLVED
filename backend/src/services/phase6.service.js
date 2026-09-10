const pool = require('../db/pool');
const AppError = require('../utils/AppError');
const { studentSolution } = require('../utils/quizProblemSettings');
const { ANALYTICS_PERFORMANCE_THRESHOLD_PERCENT } = require('../config/env');
const { buildLessonDocument } = require('./lesson-document.service');

const finished = ['SUBMITTED', 'GRADED'];
const number = value => value == null ? null : Number(value);
const pct = (value, total) => total ? Math.round((value / total) * 10000) / 100 : null;
const normalize = value => String(value || '').trim().toLocaleLowerCase();
const friendlyReference = (value, index) => {
  if (value && typeof value === 'object') return value.label || value.title || value.filename || 'Approved source ' + (index + 1);
  const text = String(value || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(text) ? 'Approved source ' + (index + 1) : text;
};

function safeQuestion(row) {
  return { id: row.id, order: row.question_order, type: row.question_type, topic: row.topic || null,
    difficulty: row.difficulty, prompt: row.prompt, choices: row.choices || [], maxPoints: Number(row.max_points ?? 1),
    ...(row.question_type === 'PROBLEM_SOLVING' ? {
      instructions: row.problem_settings?.instructions || '',
      tip: row.problem_settings?.allowTip ? row.problem_settings.tip || '' : '',
      formula: row.problem_settings?.allowFormula ? row.problem_settings.formula || '' : '',
    } : {}) };
}
function safeMaterial(row) {
  const snapshot=row.published_snapshot&&typeof row.published_snapshot==='object'?row.published_snapshot:{};
  const references=Array.isArray(snapshot.sourceReferences)?snapshot.sourceReferences:[];
  return { id:row.id,type:row.material_type,title:snapshot.title||'',content:snapshot.content||{},
    sourceReferences:references.map(friendlyReference).filter(Boolean),
    generatedAt:snapshot.generatedAt||row.generated_at,publishedAt:row.published_at,
    displayOrder:snapshot.displayOrder??row.display_order };
}
function safeAttempt(row) {
  return { id: row.id, quizId: row.quiz_id, lessonId: row.lesson_id, sectionId: row.section_id,
    status: row.status, startedAt: row.started_at, submittedAt: row.submitted_at,
    score: row.status === 'GRADED' ? number(row.score) : null, maxScore: number(row.max_score), percentage: row.status === 'GRADED' ? number(row.percentage) : null };
}

async function enrolledLesson(lessonId, studentId, client = pool) {
  const { rows } = await client.query(`SELECT l.*,s.section_name,sub.code subject_code,sub.name subject_name,
    u.first_name||' '||u.last_name instructor_name
    FROM lesson_sessions l JOIN sections s ON s.id=l.section_id JOIN subjects sub ON sub.id=s.subject_id
    JOIN users u ON u.id=l.instructor_id JOIN enrollments e ON e.section_id=s.id
    WHERE l.id=$1 AND e.student_id=$2 AND e.status='APPROVED' AND u.status='ACTIVE'`, [lessonId, studentId]);
  if (!rows.length) throw new AppError('Lesson not found or you are not enrolled in this section.', 404);
  return rows[0];
}
async function enrolledQuiz(quizId, studentId, client = pool) {
  const { rows } = await client.query(`SELECT q.*,l.section_id,l.title lesson_title,l.started_at,l.ended_at,
    s.section_name,sub.code subject_code,sub.name subject_name,u.first_name||' '||u.last_name instructor_name,
    a.id existing_attempt_id,a.status existing_attempt_status
    FROM lesson_quizzes q JOIN lesson_sessions l ON l.id=q.lesson_id JOIN sections s ON s.id=l.section_id
    JOIN subjects sub ON sub.id=s.subject_id JOIN users u ON u.id=l.instructor_id
    JOIN enrollments e ON e.section_id=s.id LEFT JOIN quiz_attempts a ON a.quiz_id=q.id AND a.student_id=$2
    WHERE q.id=$1 AND e.student_id=$2 AND e.status='APPROVED' AND u.status='ACTIVE'
      AND q.status='PUBLISHED'`, [quizId, studentId]);
  if (!rows.length) throw new AppError('This quiz is not available.', 404);
  return rows[0];
}

async function dashboard(studentId) {
  const { rows } = await pool.query(`SELECT l.id,l.title,l.topic,l.started_at,l.ended_at,s.id section_id,s.section_name,
    sub.code subject_code,sub.name subject_name,u.first_name||' '||u.last_name instructor_name,
    EXISTS(SELECT 1 FROM generated_lesson_materials gm JOIN lesson_context_versions cv ON cv.id=gm.context_version_id
      WHERE gm.lesson_id=l.id AND gm.published_at IS NOT NULL AND gm.published_snapshot IS NOT NULL AND cv.status IN ('APPROVED','ARCHIVED')) has_materials,
    (SELECT COUNT(*)::int FROM lesson_quizzes q WHERE q.lesson_id=l.id AND q.status='PUBLISHED') available_quizzes,
    (SELECT COUNT(*)::int FROM quiz_attempts a WHERE a.lesson_id=l.id AND a.student_id=$1 AND a.status IN('SUBMITTED','GRADED')) completed_quizzes
    FROM enrollments e JOIN sections s ON s.id=e.section_id JOIN subjects sub ON sub.id=s.subject_id
    JOIN users u ON u.id=s.instructor_id JOIN lesson_sessions l ON l.section_id=s.id
    WHERE e.student_id=$1 AND e.status='APPROVED' AND u.status='ACTIVE' AND l.status='COMPLETED'
      AND (EXISTS(SELECT 1 FROM generated_lesson_materials gm WHERE gm.lesson_id=l.id AND gm.published_at IS NOT NULL AND gm.published_snapshot IS NOT NULL)
        OR EXISTS(SELECT 1 FROM lesson_quizzes q WHERE q.lesson_id=l.id AND q.status IN('PUBLISHED','DISABLED','CLOSED'))
        OR EXISTS(SELECT 1 FROM quiz_attempts a WHERE a.lesson_id=l.id AND a.student_id=$1))
    ORDER BY COALESCE(l.ended_at,l.created_at) DESC`, [studentId]);
  const history = await quizHistory(studentId, 5);
  return { lessons: rows.map(row => ({ id:row.id,title:row.title,topic:row.topic,startedAt:row.started_at,endedAt:row.ended_at,
    section:{id:row.section_id,name:row.section_name,subjectCode:row.subject_code,subjectName:row.subject_name,instructorName:row.instructor_name},
    hasMaterials:row.has_materials,availableQuizzes:row.available_quizzes,completedQuizzes:row.completed_quizzes })), recentResults: history };
}

async function publishedLessonData(lessonId, studentId) {
  const lesson = await enrolledLesson(lessonId, studentId);
  const materials = await pool.query(
    `WITH published_context AS (
       SELECT gm.context_version_id FROM generated_lesson_materials gm
       JOIN lesson_context_versions cv ON cv.id=gm.context_version_id
       WHERE gm.lesson_id=$1 AND gm.published_at IS NOT NULL AND gm.published_snapshot IS NOT NULL
         AND cv.status IN ('APPROVED','ARCHIVED')
       ORDER BY cv.version_number DESC,gm.published_at DESC LIMIT 1
     ) SELECT * FROM (
       SELECT DISTINCT ON (gm.material_type) gm.*
       FROM generated_lesson_materials gm
       JOIN lesson_context_versions cv ON cv.id=gm.context_version_id
       WHERE gm.lesson_id=$1
         AND gm.published_at IS NOT NULL
         AND gm.published_snapshot IS NOT NULL
         AND gm.context_version_id=(SELECT context_version_id FROM published_context)
         AND cv.status IN ('APPROVED','ARCHIVED')
       ORDER BY gm.material_type,gm.published_at DESC,gm.updated_at DESC,gm.id DESC
     ) published
     ORDER BY COALESCE((published_snapshot->>'displayOrder')::integer,display_order,999),
              published_at,id`,
    [lessonId]
  );
  const payload = { lesson:{id:lesson.id,title:lesson.title,topic:lesson.topic,status:lesson.status,startedAt:lesson.started_at,endedAt:lesson.ended_at,
    sectionId:lesson.section_id,sectionName:lesson.section_name,subjectCode:lesson.subject_code,subjectName:lesson.subject_name,instructorName:lesson.instructor_name},
    materials:materials.rows.map(safeMaterial) };
  return { ...payload, document: buildLessonDocument(payload) };
}

async function lessonDetail(lessonId, studentId) {
  const published = await publishedLessonData(lessonId, studentId);
  const quizzes = await pool.query(`SELECT q.id,q.title,q.instructions,q.status,q.published_at,a.id attempt_id,a.status attempt_status,a.score,a.max_score,a.percentage,a.submitted_at,
      (SELECT COUNT(*)::int FROM lesson_quiz_questions qq WHERE qq.quiz_id=q.id) question_count
      FROM lesson_quizzes q LEFT JOIN quiz_attempts a ON a.quiz_id=q.id AND a.student_id=$2
      WHERE q.lesson_id=$1 AND q.status IN('PUBLISHED','DISABLED','CLOSED') ORDER BY q.published_at DESC`, [lessonId, studentId]);
  return { ...published, quizzes:quizzes.rows.map(row=>({id:row.id,title:row.title,instructions:row.instructions,status:row.status === 'CLOSED' ? 'DISABLED' : row.status,publishedAt:row.published_at,
      available:row.status === 'PUBLISHED',availabilityMessage:row.status === 'PUBLISHED' ? '' : 'This quiz is currently unavailable. Please wait for your instructor to enable it.',
      questionCount:row.question_count,attempt:row.attempt_id?{id:row.attempt_id,status:row.attempt_status,score:row.attempt_status==='GRADED'?number(row.score):null,maxScore:number(row.max_score),percentage:row.attempt_status==='GRADED'?number(row.percentage):null,submittedAt:row.submitted_at}:null})) };
}

async function attemptPayload(attemptId, studentId, client = pool) {
  const { rows } = await client.query(`SELECT a.*,q.title quiz_title,q.instructions,q.status quiz_status,l.title lesson_title
    FROM quiz_attempts a JOIN lesson_quizzes q ON q.id=a.quiz_id JOIN lesson_sessions l ON l.id=a.lesson_id
    WHERE a.id=$1 AND a.student_id=$2`, [attemptId, studentId]);
  if (!rows.length) throw new AppError('Quiz attempt not found.', 404);
  const attempt = rows[0];
  await enrolledLesson(attempt.lesson_id, studentId, client);
  if (attempt.quiz_status !== 'PUBLISHED') throw new AppError('This quiz is currently unavailable.', 409);
  const [questions, answers] = await Promise.all([
    client.query('SELECT * FROM lesson_quiz_questions WHERE quiz_id=$1 ORDER BY question_order', [attempt.quiz_id]),
    client.query('SELECT * FROM quiz_attempt_answers WHERE attempt_id=$1', [attemptId]),
  ]);
  const byQuestion = new Map(answers.rows.map(answer => [answer.question_id, answer]));
  const submitted = finished.includes(attempt.status);
  return { attempt:{...safeAttempt(attempt),quizTitle:attempt.quiz_title,quizInstructions:attempt.instructions,lessonTitle:attempt.lesson_title,quizStatus:attempt.quiz_status},
    questions:questions.rows.map(row => { const answer=byQuestion.get(row.id); const base={...safeQuestion(row),answer:answer?.answer_text||'',solution:studentSolution(answer)};
      if (!submitted) return base;
      const result = {...base,isCorrect:answer?.is_correct??null,pointsAwarded:number(answer?.points_awarded),
        instructorFeedback:answer?.graded_at?answer.instructor_feedback||'':''};
      // Hidden solution/rubric and raw advisory output must never enter the student DTO.
      return row.question_type==='PROBLEM_SOLVING'?result:{...result,correctAnswer:row.correct_answer,explanation:row.explanation}; }) };
}

async function startAttempt(quizId, studentId) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const quiz=await enrolledQuiz(quizId,studentId,client);
    await client.query(`INSERT INTO quiz_attempts(quiz_id,lesson_id,section_id,student_id) VALUES($1,$2,$3,$4)
      ON CONFLICT(quiz_id,student_id) DO NOTHING`,[quiz.id,quiz.lesson_id,quiz.section_id,studentId]);
    const found=await client.query('SELECT id FROM quiz_attempts WHERE quiz_id=$1 AND student_id=$2 FOR UPDATE',[quizId,studentId]);
    await client.query('COMMIT'); return attemptPayload(found.rows[0].id,studentId);
  } catch(error){await client.query('ROLLBACK');throw error;} finally{client.release();}
}
async function saveAnswer(attemptId, questionId, studentId, answerText) {
  const clean=String(answerText??'').slice(0,10000); const client=await pool.connect();
  try {await client.query('BEGIN'); const found=await client.query(`SELECT a.*,q.status quiz_status FROM quiz_attempts a JOIN lesson_quizzes q ON q.id=a.quiz_id JOIN enrollments e ON e.section_id=a.section_id AND e.student_id=a.student_id
      WHERE a.id=$1 AND a.student_id=$2 AND e.status='APPROVED' FOR UPDATE OF a`,[attemptId,studentId]);
    if(!found.rows.length)throw new AppError('Quiz attempt not found or enrollment is unavailable.',404);
    if(found.rows[0].quiz_status!=='PUBLISHED')throw new AppError('This quiz is currently unavailable.',409);
    if(found.rows[0].status!=='IN_PROGRESS')throw new AppError('Submitted quiz answers cannot be changed.',409);
    const question=await client.query('SELECT id,question_type FROM lesson_quiz_questions WHERE id=$1 AND quiz_id=$2',[questionId,found.rows[0].quiz_id]);
    if(!question.rows.length)throw new AppError('Quiz question not found.',404);
    if(question.rows[0].question_type==='PROBLEM_SOLVING')throw new AppError('Upload a handwritten solution for this question.',400);
    await client.query(`INSERT INTO quiz_attempt_answers(attempt_id,question_id,answer_text) VALUES($1,$2,$3)
      ON CONFLICT(attempt_id,question_id) DO UPDATE SET answer_text=EXCLUDED.answer_text,is_correct=NULL,points_awarded=NULL,updated_at=NOW()`,[attemptId,questionId,clean]);
    await client.query('UPDATE quiz_attempts SET updated_at=NOW() WHERE id=$1',[attemptId]); await client.query('COMMIT');
    return {questionId,answer:clean,savedAt:new Date().toISOString()};
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
async function submitAttempt(attemptId, studentId, { confirmUnanswered = false } = {}) {
  const client=await pool.connect();
  try{await client.query('BEGIN');const found=await client.query(`SELECT a.*,q.status quiz_status FROM quiz_attempts a JOIN lesson_quizzes q ON q.id=a.quiz_id WHERE a.id=$1 AND a.student_id=$2 FOR UPDATE OF a`,[attemptId,studentId]);
    if(!found.rows.length)throw new AppError('Quiz attempt not found.',404); const attempt=found.rows[0];
    await enrolledLesson(attempt.lesson_id,studentId,client);
    if(attempt.quiz_status!=='PUBLISHED')throw new AppError('This quiz is currently unavailable.',409);
    if(finished.includes(attempt.status)){await client.query('COMMIT');return attemptPayload(attemptId,studentId);}
    const questions=await client.query('SELECT * FROM lesson_quiz_questions WHERE quiz_id=$1 ORDER BY question_order',[attempt.quiz_id]);
    const answers=await client.query('SELECT * FROM quiz_attempt_answers WHERE attempt_id=$1',[attemptId]); const answerMap=new Map(answers.rows.map(row=>[row.question_id,row]));
    if(!questions.rows.length)throw new AppError('This quiz has no questions.',409);
    for(const question of questions.rows){const answer=answerMap.get(question.id);const text=answer?.answer_text||'';const manual=['SHORT_ANSWER','PROBLEM_SOLVING'].includes(question.question_type)||question.manual_grading;
      if(question.question_type==='PROBLEM_SOLVING'&&!answer?.solution_file&&confirmUnanswered!==true)throw new AppError('Upload a solution for question '+question.question_order+' before submitting.',422);
      let correct=null,points=null;if(!manual){correct=Boolean(text)&&normalize(text)===normalize(question.correct_answer);points=correct?Number(question.max_points??1):0;}
      await client.query(`INSERT INTO quiz_attempt_answers(attempt_id,question_id,answer_text,is_correct,points_awarded) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(attempt_id,question_id) DO UPDATE SET is_correct=EXCLUDED.is_correct,points_awarded=EXCLUDED.points_awarded,updated_at=NOW()`,[attemptId,question.id,text,correct,points]);
    }
    await client.query("UPDATE quiz_attempts SET status='SUBMITTED',submitted_at=NOW() WHERE id=$1",[attemptId]);
    await recalculateAttempt(attemptId,client); await client.query('COMMIT');return attemptPayload(attemptId,studentId);
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
// Caller holds the attempt row lock. All manual questions contribute to the denominator.
async function recalculateAttempt(attemptId, client = pool) {
  const { rows } = await client.query(`SELECT COALESCE(SUM(qq.max_points),0) max_score,
    COALESCE(SUM(aa.points_awarded),0) score, COUNT(*) FILTER(WHERE aa.points_awarded IS NULL)::int pending
    FROM quiz_attempts a JOIN lesson_quiz_questions qq ON qq.quiz_id=a.quiz_id
    LEFT JOIN quiz_attempt_answers aa ON aa.attempt_id=a.id AND aa.question_id=qq.id WHERE a.id=$1`, [attemptId]);
  const total=rows[0],score=number(total.score),maxScore=number(total.max_score);
  await client.query(`UPDATE quiz_attempts SET status=$2,score=$3,max_score=$4,percentage=$5,updated_at=NOW() WHERE id=$1`,
    [attemptId,total.pending?'SUBMITTED':'GRADED',score,maxScore,total.pending?null:pct(score,maxScore)]);
}
async function quizHistory(studentId, limit=100){const {rows}=await pool.query(`SELECT a.*,q.title quiz_title,l.title lesson_title,s.section_name,sub.code subject_code
  FROM quiz_attempts a JOIN lesson_quizzes q ON q.id=a.quiz_id JOIN lesson_sessions l ON l.id=a.lesson_id JOIN sections s ON s.id=a.section_id JOIN subjects sub ON sub.id=s.subject_id
  WHERE a.student_id=$1 AND a.status IN('SUBMITTED','GRADED') ORDER BY a.submitted_at DESC LIMIT $2`,[studentId,limit]);
  return rows.map(row=>({...safeAttempt(row),quizTitle:row.quiz_title,lessonTitle:row.lesson_title,sectionName:row.section_name,subjectCode:row.subject_code}));}

async function quizAnalytics(quizId,instructorId){
  const quizResult=await pool.query(`SELECT q.*,l.section_id,l.title lesson_title,s.section_name FROM lesson_quizzes q
    JOIN lesson_sessions l ON l.id=q.lesson_id JOIN sections s ON s.id=l.section_id WHERE q.id=$1 AND q.instructor_id=$2`,[quizId,instructorId]);
  if(!quizResult.rows.length)throw new AppError('Quiz not found or access denied.',404);const quiz=quizResult.rows[0];
  const [enrolled,attempts,questions,answers]=await Promise.all([
    pool.query("SELECT COUNT(*)::int count FROM enrollments WHERE section_id=$1 AND status='APPROVED'",[quiz.section_id]),
    pool.query(`SELECT a.*,u.first_name,u.last_name,u.student_number FROM quiz_attempts a JOIN users u ON u.id=a.student_id WHERE a.quiz_id=$1 AND a.status IN('SUBMITTED','GRADED') ORDER BY u.last_name,u.first_name`,[quizId]),
    pool.query('SELECT * FROM lesson_quiz_questions WHERE quiz_id=$1 ORDER BY question_order',[quizId]),
    pool.query(`SELECT aa.* FROM quiz_attempt_answers aa JOIN quiz_attempts a ON a.id=aa.attempt_id WHERE a.quiz_id=$1 AND a.status IN('SUBMITTED','GRADED')`,[quizId])]);
  const percentages=attempts.rows.map(row=>number(row.percentage)).filter(value=>value!=null).sort((a,b)=>a-b);const average=percentages.length?percentages.reduce((a,b)=>a+b,0)/percentages.length:null;
  const median=percentages.length?(percentages.length%2?percentages[(percentages.length-1)/2]:(percentages[percentages.length/2-1]+percentages[percentages.length/2])/2):null;
  const byQuestion=new Map();for(const answer of answers.rows){if(!byQuestion.has(answer.question_id))byQuestion.set(answer.question_id,[]);byQuestion.get(answer.question_id).push(answer);}
  const questionStats=questions.rows.map(q=>{const values=byQuestion.get(q.id)||[];const answeredValues=values.filter(a=>String(a.answer_text||'').trim());const answered=answeredValues.length;const correct=answeredValues.filter(a=>a.is_correct===true).length;const objective=q.question_type!=='SHORT_ANSWER'&&!q.manual_grading;const choices=Array.isArray(q.choices)?q.choices:[];const distribution=objective?choices.map((choice,index)=>({label:String.fromCharCode(65+index),choice,count:answeredValues.filter(a=>normalize(a.answer_text)===normalize(choice)).length,isCorrect:normalize(choice)===normalize(q.correct_answer)})):[];const mostSelectedIncorrect=distribution.filter(item=>!item.isCorrect&&item.count>0).sort((a,b)=>b.count-a.count)[0]||null;return{id:q.id,order:q.question_order,prompt:q.prompt,topic:q.topic||'Unclassified',type:q.question_type,answered,correct,incorrect:objective?Math.max(0,answered-correct):null,percentageCorrect:objective?pct(correct,answered):null,correctAnswer:q.correct_answer,responseDistribution:distribution,mostSelectedIncorrect};});
  const topicBuckets={};for(const q of questions.rows){const topic=q.topic||'Unclassified';if(q.question_type==='SHORT_ANSWER'||q.manual_grading)continue;const values=(byQuestion.get(q.id)||[]).filter(a=>String(a.answer_text||'').trim());const bucket=topicBuckets[topic]||(topicBuckets[topic]={correct:0,scored:0});bucket.correct+=values.filter(a=>a.is_correct===true).length;bucket.scored+=values.length;}
  const answerByAttempt=new Map();for(const a of answers.rows){if(!answerByAttempt.has(a.attempt_id))answerByAttempt.set(a.attempt_id,[]);answerByAttempt.get(a.attempt_id).push(a);}
  const students=attempts.rows.map(row=>{const own=answerByAttempt.get(row.id)||[];const topics={};for(const answer of own){const q=questions.rows.find(item=>item.id===answer.question_id);if(!q||q.question_type==='SHORT_ANSWER'||q.manual_grading||!String(answer.answer_text||'').trim())continue;const label=q.topic||'Unclassified';const b=topics[label]||(topics[label]={correct:0,scored:0});b.scored+=1;if(answer.is_correct===true)b.correct+=1;}return{id:row.student_id,name:`${row.first_name} ${row.last_name}`,studentNumber:row.student_number,...safeAttempt(row),questionsMissed:own.filter(a=>a.is_correct===false).length,topics:Object.entries(topics).map(([topic,v])=>({topic,correct:v.correct,scored:v.scored,percentage:pct(v.correct,v.scored)})).sort((a,b)=>(a.percentage??101)-(b.percentage??101))};});
  const submitted=attempts.rows.length,enrolledCount=enrolled.rows[0].count;
  const ranges=[[0,59],[60,69],[70,79],[80,89],[90,100]];const scoreDistribution=ranges.map(([minimum,maximum])=>({label:`${minimum}–${maximum}%`,minimum,maximum,count:percentages.filter(value=>value>=minimum&&value<=maximum).length}));
  return{quiz:{id:quiz.id,title:quiz.title,status:quiz.status,lessonId:quiz.lesson_id,lessonTitle:quiz.lesson_title,sectionId:quiz.section_id,sectionName:quiz.section_name},overview:{enrolled:enrolledCount,submitted,submissionRate:pct(submitted,enrolledCount),averagePercentage:average==null?null:Math.round(average*100)/100,medianPercentage:median,highestPercentage:percentages.length?percentages.at(-1):null,lowestPercentage:percentages.length?percentages[0]:null},scoreDistribution,questions:questionStats,mostMissed:questionStats.filter(q=>q.percentageCorrect!=null).sort((a,b)=>a.percentageCorrect-b.percentageCorrect).slice(0,5),topics:Object.entries(topicBuckets).map(([topic,v])=>({topic,correct:v.correct,scored:v.scored,percentage:pct(v.correct,v.scored)})),students};
}

function chunkSourceLabel(chunk){const source=chunk.source||{};if(chunk.chunk_type==='WHITEBOARD')return `Whiteboard Page ${source.pageNumber}`;if(chunk.chunk_type==='SPEECH'){const start=Math.floor(Number(source.lessonOffsetStartMs||0)/1000),end=Math.ceil(Number(source.lessonOffsetEndMs||0)/1000);return `Transcript ${Math.floor(start/60)}:${String(start%60).padStart(2,'0')}–${Math.floor(end/60)}:${String(end%60).padStart(2,'0')}`;}if(chunk.chunk_type==='PDF')return `${source.filename||'Lesson PDF'} • Page ${source.pdfPageNumber}`;return source.filename||'Uploaded image';}
function medianValue(values){const sorted=values.filter(v=>v!=null).sort((a,b)=>a-b);return sorted.length?(sorted.length%2?sorted[(sorted.length-1)/2]:(sorted[sorted.length/2-1]+sorted[sorted.length/2])/2):null;}

async function sectionAnalytics(sectionId,instructorId){
  const own=await pool.query('SELECT s.id,s.section_name,s.subject_id,sub.code subject_code FROM sections s JOIN subjects sub ON sub.id=s.subject_id WHERE s.id=$1 AND s.instructor_id=$2',[sectionId,instructorId]);if(!own.rows.length)throw new AppError('Section not found or access denied.',404);
  const [enrolled,attempts,quizzes,questions,answers,chunks,comparisonRows,subjectSections]=await Promise.all([
    pool.query("SELECT COUNT(*)::int count FROM enrollments WHERE section_id=$1 AND status='APPROVED'",[sectionId]),
    pool.query(`SELECT a.*,q.title quiz_title,u.first_name,u.last_name,u.student_number FROM quiz_attempts a JOIN lesson_quizzes q ON q.id=a.quiz_id JOIN users u ON u.id=a.student_id WHERE a.section_id=$1 AND a.status IN('SUBMITTED','GRADED') ORDER BY a.submitted_at DESC`,[sectionId]),
    pool.query(`SELECT q.id,q.title,q.status,q.published_at,q.created_at,l.title lesson_title FROM lesson_quizzes q JOIN lesson_sessions l ON l.id=q.lesson_id WHERE l.section_id=$1 AND q.status IN('PUBLISHED','DISABLED','CLOSED') ORDER BY COALESCE(q.published_at,q.created_at)`,[sectionId]),
    pool.query(`SELECT qq.*,q.lesson_id,q.title quiz_title,COALESCE(q.published_at,q.created_at) assessment_at FROM lesson_quiz_questions qq JOIN lesson_quizzes q ON q.id=qq.quiz_id JOIN lesson_sessions l ON l.id=q.lesson_id WHERE l.section_id=$1 AND q.status IN('PUBLISHED','DISABLED','CLOSED') ORDER BY assessment_at,qq.question_order`,[sectionId]),
    pool.query(`SELECT aa.*,a.quiz_id FROM quiz_attempt_answers aa JOIN quiz_attempts a ON a.id=aa.attempt_id WHERE a.section_id=$1 AND a.status IN('SUBMITTED','GRADED')`,[sectionId]),
    pool.query(`SELECT c.*,v.approved_at,l.ended_at FROM lesson_context_chunks c JOIN lesson_context_versions v ON v.id=c.context_version_id JOIN lesson_sessions l ON l.id=c.lesson_id WHERE v.section_id=$1 AND v.status='APPROVED' AND c.removed=FALSE`,[sectionId]),
    pool.query(`SELECT s.id section_id,s.section_name,qq.topic,q.id quiz_id,q.lesson_id,COALESCE(q.published_at,q.created_at) assessment_at,aa.is_correct,aa.answer_text FROM sections s JOIN lesson_sessions l ON l.section_id=s.id JOIN lesson_quizzes q ON q.lesson_id=l.id AND q.status IN('PUBLISHED','DISABLED','CLOSED') JOIN lesson_quiz_questions qq ON qq.quiz_id=q.id LEFT JOIN quiz_attempts a ON a.quiz_id=q.id AND a.status IN('SUBMITTED','GRADED') LEFT JOIN quiz_attempt_answers aa ON aa.attempt_id=a.id AND aa.question_id=qq.id WHERE s.subject_id=$1 AND s.instructor_id=$2`,[own.rows[0].subject_id,instructorId]),
    pool.query('SELECT COUNT(*)::int count FROM sections WHERE subject_id=$1 AND instructor_id=$2',[own.rows[0].subject_id,instructorId])]);
  const percentages=attempts.rows.map(r=>number(r.percentage)).filter(v=>v!=null);const uniqueSubmitted=new Set(attempts.rows.map(r=>r.student_id)).size;const enrolledCount=enrolled.rows[0].count;
  const answersByQuestion=new Map();for(const answer of answers.rows){if(!answersByQuestion.has(answer.question_id))answersByQuestion.set(answer.question_id,[]);answersByQuestion.get(answer.question_id).push(answer);}
  const topicMap=new Map();for(const q of questions.rows){if(q.question_type==='SHORT_ANSWER'||q.manual_grading)continue;const topic=q.topic||'Unclassified',values=(answersByQuestion.get(q.id)||[]).filter(a=>String(a.answer_text||'').trim());if(!topicMap.has(topic))topicMap.set(topic,{correct:0,scored:0,questions:[]});const bucket=topicMap.get(topic);bucket.correct+=values.filter(a=>a.is_correct===true).length;bucket.scored+=values.length;bucket.questions.push(q);}
  const threshold=ANALYTICS_PERFORMANCE_THRESHOLD_PERCENT,chunkByLabel=new Map(chunks.rows.map(c=>[chunkSourceLabel(c),c]));const progression=[];
  for(const [topic,bucket] of topicMap){const assessments=new Map();for(const q of bucket.questions){if(!assessments.has(q.quiz_id))assessments.set(q.quiz_id,{quizId:q.quiz_id,title:q.quiz_title,date:q.assessment_at,correct:0,scored:0,references:new Set()});const a=assessments.get(q.quiz_id),values=(answersByQuestion.get(q.id)||[]).filter(x=>String(x.answer_text||'').trim());a.correct+=values.filter(x=>x.is_correct===true).length;a.scored+=values.length;(q.source_references||[]).forEach(ref=>a.references.add(ref));}const ordered=[...assessments.values()].sort((a,b)=>new Date(a.date)-new Date(b.date));const cumulativeRefs=new Set();const history=ordered.map(a=>{a.references.forEach(ref=>cumulativeRefs.add(ref));const exposure=[...cumulativeRefs].map(ref=>chunkByLabel.get(ref)).filter(Boolean);return{quizId:a.quizId,title:a.title,date:a.date,performance:pct(a.correct,a.scored),scoredResponses:a.scored,cumulativeLessons:new Set(exposure.map(c=>c.lesson_id)).size,cumulativeExamplesProblems:exposure.filter(c=>['EXAMPLE','PROBLEM'].includes(c.content_type)).length};});const measured=history.filter(item=>item.performance!=null),reached=measured.find(item=>item.performance>=threshold),latest=measured.at(-1)||null;progression.push({topic,threshold,assessmentCount:measured.length,latestPerformance:latest?.performance??null,status:!measured.length?'INSUFFICIENT_DATA':reached?'THRESHOLD_REACHED':'THRESHOLD_NOT_REACHED',thresholdReachedAt:reached||null,lessonsBeforeThreshold:reached?.cumulativeLessons??null,examplesProblemsBeforeThreshold:reached?.cumulativeExamplesProblems??null,history});}
  const comparisons={};for(const row of comparisonRows.rows){const topic=row.topic||'Unclassified',key=`${topic}|${row.section_id}`;const item=comparisons[key]||(comparisons[key]={topic,sectionId:row.section_id,sectionName:row.section_name,lessons:new Set(),assessments:new Map()});item.lessons.add(row.lesson_id);if(!item.assessments.has(row.quiz_id))item.assessments.set(row.quiz_id,{date:row.assessment_at,correct:0,scored:0});const a=item.assessments.get(row.quiz_id);if(String(row.answer_text||'').trim()){a.scored+=1;if(row.is_correct===true)a.correct+=1;}}
  const sectionComparison=Object.values(comparisons).map(item=>{const latest=[...item.assessments.values()].sort((a,b)=>new Date(a.date)-new Date(b.date)).at(-1);return{topic:item.topic,sectionId:item.sectionId,sectionName:item.sectionName,lessonsWithAssessments:item.lessons.size,latestPerformance:latest?pct(latest.correct,latest.scored):null};});
  const studentGroups=new Map();const missedByAttempt=new Map();for(const answer of answers.rows){if(answer.is_correct===false)missedByAttempt.set(answer.attempt_id,(missedByAttempt.get(answer.attempt_id)||0)+1);}for(const row of attempts.rows){const item=studentGroups.get(row.student_id)||{studentId:row.student_id,name:`${row.first_name} ${row.last_name}`,studentNumber:row.student_number,percentages:[],questionsMissed:0,recentScores:[]};const value=number(row.percentage);if(value!=null)item.percentages.push(value);item.questionsMissed+=missedByAttempt.get(row.id)||0;item.recentScores.push({attemptId:row.id,quizTitle:row.quiz_title,score:number(row.score),maxScore:number(row.max_score),percentage:value,submittedAt:row.submitted_at});studentGroups.set(row.student_id,item);}const studentSummaries=[...studentGroups.values()].map(item=>({...item,averagePercentage:item.percentages.length?item.percentages.reduce((a,b)=>a+b,0)/item.percentages.length:null,recentScores:item.recentScores.slice(0,5),percentages:undefined}));
  return{section:own.rows[0],comparableSectionCount:subjectSections.rows[0].count,performanceThreshold:threshold,overview:{enrolled:enrolledCount,submitted:uniqueSubmitted,submissionRate:pct(uniqueSubmitted,enrolledCount),quizCount:quizzes.rows.length,attempts:attempts.rows.length,averagePercentage:percentages.length?percentages.reduce((a,b)=>a+b,0)/percentages.length:null,medianPercentage:medianValue(percentages),highestPercentage:percentages.length?Math.max(...percentages):null,lowestPercentage:percentages.length?Math.min(...percentages):null},quizzes:quizzes.rows.map(q=>{const quizAttempts=attempts.rows.filter(row=>row.quiz_id===q.id),values=quizAttempts.map(row=>number(row.percentage)).filter(value=>value!=null);return{id:q.id,title:q.title,status:q.status,publishedAt:q.published_at,lessonTitle:q.lesson_title,submissions:quizAttempts.length,averagePercentage:values.length?values.reduce((a,b)=>a+b,0)/values.length:null};}),topics:[...topicMap].map(([topic,v])=>({topic,correct:v.correct,scored:v.scored,percentage:pct(v.correct,v.scored)})),conceptProgression:progression.sort((a,b)=>a.topic.localeCompare(b.topic)),sectionComparison,students:studentSummaries};
}

async function systemEvaluation(){
  const [recognition,transcription,generation,context]=await Promise.all([
    pool.query(`SELECT COUNT(*)::int jobs,COUNT(*) FILTER(WHERE status='SUCCEEDED')::int successful,COUNT(*) FILTER(WHERE status='FAILED')::int failed,ROUND(AVG(EXTRACT(EPOCH FROM(completed_at-started_at))*1000) FILTER(WHERE status='SUCCEEDED'),0) average_ms FROM lesson_recognition_attempts`),
    pool.query(`SELECT COUNT(*)::int jobs,COUNT(*) FILTER(WHERE status='SUCCEEDED')::int successful,COUNT(*) FILTER(WHERE status='FAILED')::int failed,ROUND(AVG(EXTRACT(EPOCH FROM(completed_at-started_at))*1000) FILTER(WHERE status='SUCCEEDED'),0) average_ms FROM lesson_transcription_attempts`),
    pool.query(`SELECT (SELECT COUNT(*) FROM generated_lesson_materials)::int generated_materials,(SELECT COUNT(*) FROM lesson_quizzes)::int generated_quizzes`),
    pool.query(`SELECT COUNT(c.id)::int total,COUNT(*) FILTER(WHERE c.edited=FALSE AND c.removed=FALSE)::int accepted,COUNT(*) FILTER(WHERE c.edited=TRUE AND c.removed=FALSE)::int edited,COUNT(*) FILTER(WHERE c.removed=TRUE)::int removed FROM lesson_context_chunks c JOIN lesson_context_versions v ON v.id=c.context_version_id WHERE v.status='APPROVED'`)]);
  const metric=row=>({jobs:row.jobs,successful:row.successful,failed:row.failed,successRate:pct(row.successful,row.jobs),averageProcessingMs:number(row.average_ms)}),c=context.rows[0];
  return{recognition:metric(recognition.rows[0]),transcription:metric(transcription.rows[0]),aiGeneration:{generatedLessonMaterials:generation.rows[0].generated_materials,generatedQuizzes:generation.rows[0].generated_quizzes,failures:null,averageProcessingMs:null},contextReview:{total:c.total,acceptedUnchanged:c.accepted,edited:c.edited,removed:c.removed,acceptanceRate:pct(c.accepted,c.total),correctionRate:pct(c.edited+c.removed,c.total)},groundTruth:{cer:null,wer:null,equationExactMatch:null,timestampMae:null,groundedContentEvaluation:null}};
}

module.exports={recalculateAttempt,dashboard,lessonDetail,publishedLessonData,startAttempt,attemptPayload,saveAnswer,submitAttempt,quizHistory,quizAnalytics,sectionAnalytics,systemEvaluation};
