const pool = require('../db/pool');
const AppError = require('../utils/AppError');
const { RECOGNITION_PROVIDER, GEMINI_MODEL, RECOGNITION_MAX_ATTEMPTS, GEMINI_SHARED_RATE_LIMIT_BACKOFF_MS } = require('../config/env');

function safe(row) {
  if (!row) return null;
  return {
    id:row.id, lessonId:row.lesson_id, sectionId:row.section_id, status:row.status,
    captureCount:row.capture_count, compiledText:row.compiled_text||'', pages:row.pages||[],
    structuredResult:row.structured_result||null, provider:row.provider||null,
    providerVersion:row.provider_version||null, attemptCount:row.attempt_count||0,
    resultAttemptNumber:row.result_attempt_number||null,
    hasPreviousResult:Boolean(row.structured_result)&&['PENDING','PROCESSING','FAILED'].includes(row.status),
    failureCode:row.last_failure_code||null, failureMessage:row.last_failure_message||null,
    requestedAt:row.requested_at||null, processedAt:row.processed_at||null, updatedAt:row.updated_at||null,
  };
}

async function ownedLesson(lessonId,instructorId,client=pool,lock=false) {
  const {rows}=await client.query(`SELECT id,section_id,instructor_id,status FROM lesson_sessions WHERE id=$1${lock?' FOR UPDATE':''}`,[lessonId]);
  if(!rows.length||rows[0].instructor_id!==instructorId) throw new AppError('Lesson not found or access denied.',404);
  return rows[0];
}

async function queueLesson(lessonId,instructorId) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const lesson=await ownedLesson(lessonId,instructorId,client,true);
    if(lesson.status!=='COMPLETED') throw new AppError('Lesson compilation is available after the lesson is completed.',409);
    const captures=await client.query('SELECT id FROM lesson_captures WHERE lesson_id=$1 AND instructor_id=$2 ORDER BY captured_at,id',[lessonId,instructorId]);
    if(!captures.rows.length) throw new AppError('This lesson does not have whiteboard captures to compile.',409);
    const existing=await client.query('SELECT * FROM lesson_recognitions WHERE lesson_id=$1 FOR UPDATE',[lessonId]);
    let recognition=existing.rows[0];
    if(recognition&&['PENDING','PROCESSING'].includes(recognition.status)) { await client.query('COMMIT'); return {recognition:safe(recognition),queued:false}; }
    if(!recognition) {
      const inserted=await client.query(`INSERT INTO lesson_recognitions
        (lesson_id,section_id,instructor_id,status,capture_count,provider,provider_version,attempt_count,requested_at,updated_at)
        VALUES($1,$2,$3,'PENDING',$4,$5,$6,1,NOW(),NOW()) RETURNING *`,
        [lesson.id,lesson.section_id,instructorId,captures.rows.length,RECOGNITION_PROVIDER,GEMINI_MODEL]);
      recognition=inserted.rows[0];
      await client.query(`INSERT INTO lesson_recognition_attempts
        (lesson_recognition_id,attempt_number,request_kind,status,provider,provider_version,next_attempt_at)
        VALUES($1,1,'INITIAL','PENDING',$2,$3,NOW())`,[recognition.id,RECOGNITION_PROVIDER,GEMINI_MODEL]);
    } else {
      const attempt=recognition.attempt_count+1;
      const updated=await client.query(`UPDATE lesson_recognitions SET status='PENDING',capture_count=$2,
        attempt_count=$3,requested_at=NOW(),updated_at=NOW(),last_failure_code=NULL,last_failure_message=NULL
        WHERE id=$1 RETURNING *`,[recognition.id,captures.rows.length,attempt]);
      recognition=updated.rows[0];
      await client.query(`INSERT INTO lesson_recognition_attempts
        (lesson_recognition_id,attempt_number,request_kind,status,provider,provider_version,next_attempt_at)
        VALUES($1,$2,'REPROCESS','PENDING',$3,$4,NOW())`,[recognition.id,attempt,RECOGNITION_PROVIDER,GEMINI_MODEL]);
    }
    await client.query('COMMIT'); return {recognition:safe(recognition),queued:true};
  } catch(error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

async function getLesson(lessonId,instructorId) {
  await ownedLesson(lessonId,instructorId);
  const {rows}=await pool.query('SELECT * FROM lesson_recognitions WHERE lesson_id=$1 AND instructor_id=$2',[lessonId,instructorId]);
  return rows.length?safe(rows[0]):null;
}

async function recoverStaleAttempts(timeoutMs) {
  const client=await pool.connect();
  try { await client.query('BEGIN');
    const {rows}=await client.query(`UPDATE lesson_recognition_attempts SET status='PENDING',next_attempt_at=NOW(),
      worker_id=NULL,locked_at=NULL,failure_code='WORKER_INTERRUPTED',failure_message='Recognition worker was interrupted.'
      WHERE status='PROCESSING' AND locked_at < NOW()-($1::bigint*INTERVAL '1 millisecond') RETURNING lesson_recognition_id`,[timeoutMs]);
    if(rows.length) await client.query(`UPDATE lesson_recognitions SET status='PENDING',updated_at=NOW()
      WHERE id=ANY($1::uuid[]) AND status='PROCESSING'`,[rows.map(row=>row.lesson_recognition_id)]);
    await client.query('COMMIT'); return rows.length;
  } catch(error){await client.query('ROLLBACK');throw error;} finally{client.release();}
}

async function claimNextAttempt(workerId) {
  const client=await pool.connect();
  try { await client.query('BEGIN');
    const {rows}=await client.query(`SELECT id FROM lesson_recognition_attempts WHERE status='PENDING' AND next_attempt_at<=NOW()
      ORDER BY next_attempt_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1`);
    if(!rows.length){await client.query('COMMIT');return null;}
    const result=await client.query(`UPDATE lesson_recognition_attempts SET status='PROCESSING',worker_id=$2,
      locked_at=NOW(),started_at=COALESCE(started_at,NOW()) WHERE id=$1 RETURNING *`,[rows[0].id,workerId]);
    await client.query(`UPDATE lesson_recognitions SET status='PROCESSING',updated_at=NOW() WHERE id=$1`,[result.rows[0].lesson_recognition_id]);
    await client.query('COMMIT');return result.rows[0];
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

async function getAttemptSource(attemptId) {
  const {rows}=await pool.query(`SELECT attempt.*,recognition.lesson_id,recognition.section_id,recognition.instructor_id
    FROM lesson_recognition_attempts attempt JOIN lesson_recognitions recognition ON recognition.id=attempt.lesson_recognition_id
    JOIN lesson_sessions lesson ON lesson.id=recognition.lesson_id
    WHERE attempt.id=$1 AND lesson.instructor_id=recognition.instructor_id AND lesson.status='COMPLETED'`,[attemptId]);
  if(!rows.length){const error=new Error('Lesson compilation ownership validation failed.');error.code='OWNERSHIP_MISMATCH';throw error;}
  const captures=await pool.query(`SELECT id,captured_at,original_storage_key,corrected_storage_key,
    original_width,original_height,corrected_width,corrected_height FROM lesson_captures
    WHERE lesson_id=$1 AND instructor_id=$2 ORDER BY captured_at,id`,[rows[0].lesson_id,rows[0].instructor_id]);
  if(!captures.rows.length){const error=new Error('No lesson captures are available.');error.code='IMAGE_NOT_FOUND';throw error;}
  const captureIds=captures.rows.map(capture=>capture.id);
  const planes=await pool.query(`SELECT id,capture_id,calibration_plane_id,label,plane_order,corners,storage_key,mime_type,width,height
    FROM lesson_capture_planes WHERE capture_id=ANY($1::uuid[]) ORDER BY capture_id,plane_order`,[captureIds]);
  const byCapture=new Map(captureIds.map(id=>[id,[]]));
  planes.rows.forEach(plane=>byCapture.get(plane.capture_id)?.push(plane));
  return {...rows[0],captures:captures.rows.map(capture=>({...capture,planes:byCapture.get(capture.id)||[]}))};
}

async function completeAttempt(attempt,result,source) {
  const structured={schemaVersion:1,lessonId:source.lesson_id,sectionId:source.section_id,
    instructorId:source.instructor_id,captureCount:source.captures.length,captureSetSha256:source.captureSetSha256,
    provider:RECOGNITION_PROVIDER,providerVersion:result.providerVersion,...result.normalized};
  const client=await pool.connect();
  try{await client.query('BEGIN');
    const current=await client.query('SELECT status FROM lesson_recognition_attempts WHERE id=$1 FOR UPDATE',[attempt.id]);
    if(current.rows[0]?.status!=='PROCESSING') throw new Error('Lesson recognition attempt is no longer processing.');
    await client.query(`UPDATE lesson_recognition_attempts SET status='SUCCEEDED',provider_version=$2,
      normalized_result=$3,sanitized_provider_output=$4,completed_at=NOW() WHERE id=$1`,
      [attempt.id,result.providerVersion,JSON.stringify(result.normalized),JSON.stringify(result.sanitizedOutput)]);
    await client.query(`UPDATE lesson_recognitions SET status='REVIEW_REQUIRED',capture_count=$2,capture_set_sha256=$3,
      compiled_text=$4,pages=$5,structured_result=$6,provider=$7,provider_version=$8,result_attempt_number=$9,
      last_failure_code=NULL,last_failure_message=NULL,processed_at=NOW(),updated_at=NOW() WHERE id=$1`,
      [attempt.lesson_recognition_id,source.captures.length,source.captureSetSha256,result.normalized.compiledText,
       JSON.stringify(result.normalized.pages),JSON.stringify(structured),RECOGNITION_PROVIDER,result.providerVersion,attempt.attempt_number]);
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

async function failAttempt(attempt,mapped) {
  const client=await pool.connect();
  try{await client.query('BEGIN');
    const current=await client.query('SELECT status FROM lesson_recognition_attempts WHERE id=$1 FOR UPDATE',[attempt.id]);
    if(current.rows[0]?.status!=='PROCESSING'){await client.query('COMMIT');return;}
    const chain=await client.query(`SELECT COUNT(*)::int AS count FROM lesson_recognition_attempts WHERE lesson_recognition_id=$1
      AND created_at>=(SELECT MAX(created_at) FROM lesson_recognition_attempts WHERE lesson_recognition_id=$1 AND request_kind IN('INITIAL','REPROCESS'))`,[attempt.lesson_recognition_id]);
    const count=chain.rows[0].count;
    await client.query(`UPDATE lesson_recognition_attempts SET status='FAILED',failure_code=$2,failure_message=$3,completed_at=NOW() WHERE id=$1`,[attempt.id,mapped.code,mapped.message]);
    if(mapped.retryable&&count<RECOGNITION_MAX_ATTEMPTS){const next=attempt.attempt_number+1;const delay=mapped.code==='PROVIDER_RATE_LIMITED'?Math.ceil(GEMINI_SHARED_RATE_LIMIT_BACKOFF_MS/1000):count===1?10:30;
      await client.query(`INSERT INTO lesson_recognition_attempts(lesson_recognition_id,attempt_number,request_kind,status,provider,provider_version,next_attempt_at)
        VALUES($1,$2,'AUTO_RETRY','PENDING',$3,$4,NOW()+($5::int*INTERVAL '1 second'))`,[attempt.lesson_recognition_id,next,RECOGNITION_PROVIDER,GEMINI_MODEL,delay]);
      await client.query(`UPDATE lesson_recognitions SET status='PENDING',attempt_count=$2,last_failure_code=$3,last_failure_message=$4,updated_at=NOW() WHERE id=$1`,[attempt.lesson_recognition_id,next,mapped.code,mapped.message]);
    }else await client.query(`UPDATE lesson_recognitions SET status='FAILED',last_failure_code=$2,last_failure_message=$3,updated_at=NOW() WHERE id=$1`,[attempt.lesson_recognition_id,mapped.code,mapped.message]);
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

module.exports={queueLesson,getLesson,recoverStaleAttempts,claimNextAttempt,getAttemptSource,completeAttempt,failAttempt};
