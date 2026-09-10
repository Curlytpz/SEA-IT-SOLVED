const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
require('../src/config/env');
const pool = require('../src/db/pool');
const service = require('../src/services/solution-activity.service');
const { solutionSubmissionStorage } = require('../src/storage');

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

const normalizedSolution = {
  plainText: 'Let f(x) = x squared. Therefore f prime of x is 2x.',
  mathExpressions: [{ latex: "f'(x)=2x", display: true }],
  blocks: [],
  warnings: [],
};

const advisoryReview = {
  assessment: 'LIKELY_CORRECT',
  summary: 'The derivative shown is consistent with the submitted work.',
  strengths: ['The student states the derivative clearly.'],
  possible_errors: [],
  suggested_feedback: 'Explain the power rule used in the final step.',
  confidence: 0.82,
};

function expectStatus(expected) {
  return error => error?.statusCode === expected;
}

async function main() {
  const migration = await fs.readFile(path.resolve(__dirname, '../src/db/migration_solution_activities.sql'), 'utf8');
  await pool.query(migration);

  const suffix = crypto.randomBytes(5).toString('hex');
  const ids = { users: [], activities: [], storageKeys: [] };
  let subjectId;
  let sectionId;
  let lessonId;

  try {
    for (const user of [
      ['Test', 'Instructor', `solution-instructor-${suffix}@hau.edu.ph`, null, 'INSTRUCTOR'],
      ['Other', 'Instructor', `solution-other-${suffix}@hau.edu.ph`, null, 'INSTRUCTOR'],
      ['Test', 'Student', `solution-student-${suffix}@student.hau.edu.ph`, `SA-${suffix}`, 'STUDENT'],
      ['Other', 'Student', `solution-outsider-${suffix}@student.hau.edu.ph`, `SO-${suffix}`, 'STUDENT'],
    ]) {
      const { rows } = await pool.query(
        `INSERT INTO users(first_name,last_name,email,student_number,password_hash,role,status)
         VALUES($1,$2,$3,$4,'verification-only',$5,'ACTIVE') RETURNING id`,
        user
      );
      ids.users.push(rows[0].id);
    }
    const [instructorId, otherInstructorId, studentId, outsiderId] = ids.users;

    const subject = await pool.query(
      'INSERT INTO subjects(code,name) VALUES($1,$2) RETURNING id',
      [`SA${suffix}`.slice(0, 20).toUpperCase(), 'Solution Activity Verification']
    );
    subjectId = subject.rows[0].id;
    const section = await pool.query(
      `INSERT INTO sections(subject_id,instructor_id,section_name,join_code)
       VALUES($1,$2,$3,$4) RETURNING id`,
      [subjectId, instructorId, `Verification ${suffix}`, `S${suffix}`.slice(0, 12).toUpperCase()]
    );
    sectionId = section.rows[0].id;
    const lesson = await pool.query(
      `INSERT INTO lesson_sessions(section_id,instructor_id,title,topic,status)
       VALUES($1,$2,$3,$4,'CREATED') RETURNING id`,
      [sectionId, instructorId, 'Solution Activity Test Lesson', 'Differentiation']
    );
    lessonId = lesson.rows[0].id;
    await pool.query(
      `INSERT INTO enrollments(section_id,student_id,status,approved_at)
       VALUES($1,$2,'APPROVED',NOW())`,
      [sectionId, studentId]
    );

    const draft = await service.createActivity(lessonId, instructorId, {
      title: 'Differentiate a polynomial',
      problemText: 'Find the derivative of f(x) = x^2.',
      instructions: 'Upload a clear image of your complete handwritten solution.',
      rubricText: 'Power rule identified and applied correctly.',
      maxPoints: 20,
    });
    ids.activities.push(draft.id);
    assert.equal(draft.status, 'DRAFT');
    assert.equal(draft.rubricText.includes('Power rule'), true);
    assert.equal((await service.listStudent(lessonId, studentId)).length, 0, 'Draft must be hidden from students.');
    await assert.rejects(() => service.listStudent(lessonId, outsiderId), expectStatus(404));
    await assert.rejects(() => service.listInstructor(lessonId, otherInstructorId), expectStatus(404));

    const published = await service.setActivityStatus(draft.id, instructorId, 'publish');
    assert.equal(published.status, 'PUBLISHED');
    const studentActivities = await service.listStudent(lessonId, studentId);
    assert.equal(studentActivities.length, 1);
    assert.equal(Object.hasOwn(studentActivities[0], 'rubricText'), false, 'Student payload must not contain the rubric.');
    assert.equal(studentActivities[0].submission, null);

    let advisoryCalls = 0;
    const file = { buffer: PNG, size: PNG.length, mimetype: 'image/png', originalname: 'handwritten-solution.png' };
    const firstSubmission = await service.submitSolution(draft.id, studentId, file, {
      recognize: async () => normalizedSolution,
      review: async () => { advisoryCalls += 1; return advisoryReview; },
    });
    assert.equal(firstSubmission.recognitionStatus, 'READY');
    assert.equal(firstSubmission.status, 'READY_FOR_REVIEW');
    assert.equal(firstSubmission.finalScore, null);
    assert.equal(advisoryCalls, 0, 'Uploading must not run the advisory AI review.');
    const firstStored = await pool.query('SELECT storage_key FROM solution_submissions WHERE id=$1', [firstSubmission.id]);
    ids.storageKeys.push(firstStored.rows[0].storage_key);
    const opened = await solutionSubmissionStorage.open(firstStored.rows[0].storage_key);
    assert.equal(opened.size, PNG.length, 'Original image must be retained in protected storage.');
    opened.stream.destroy();

    await assert.rejects(
      () => service.submissionImage(firstSubmission.id, { id: outsiderId, role: 'STUDENT' }),
      expectStatus(404)
    );
    await assert.rejects(
      () => service.listSubmissions(draft.id, otherInstructorId),
      expectStatus(404)
    );

    const reviewed = await service.analyzeSubmission(firstSubmission.id, instructorId, {
      review: async input => {
        advisoryCalls += 1;
        assert.equal(input.activity.expectedSolutionOrRubric.includes('Power rule'), true);
        assert(input.studentSolution.extractedText.length > 0);
        assert(input.approvedLessonContextExcerpt.length <= 3500);
        return advisoryReview;
      },
    });
    assert.equal(advisoryCalls, 1);
    assert.equal(reviewed.status, 'AI_REVIEWED');
    assert.equal(reviewed.aiReview.assessment, 'LIKELY_CORRECT');
    assert.equal(reviewed.finalScore, null, 'AI review must never write a final score.');
    const scoreAfterAi = await pool.query('SELECT final_score,graded_by FROM solution_submissions WHERE id=$1', [firstSubmission.id]);
    assert.equal(scoreAfterAi.rows[0].final_score, null);
    assert.equal(scoreAfterAi.rows[0].graded_by, null);

    const beforeFailedAnalysis = await pool.query(
      `SELECT submission.extracted_solution_text,submission.final_score,
        (SELECT COUNT(*)::int FROM solution_submission_ai_reviews review WHERE review.submission_id=submission.id) review_count
       FROM solution_submissions submission WHERE submission.id=$1`,
      [firstSubmission.id]
    );
    await assert.rejects(
      () => service.analyzeSubmission(firstSubmission.id, instructorId, { review: async () => { throw new Error('simulated provider 503'); } }),
      /simulated provider 503/
    );
    const afterFailedAnalysis = await pool.query(
      `SELECT submission.extracted_solution_text,submission.final_score,
        (SELECT COUNT(*)::int FROM solution_submission_ai_reviews review WHERE review.submission_id=submission.id) review_count
       FROM solution_submissions submission WHERE submission.id=$1`,
      [firstSubmission.id]
    );
    assert.deepEqual(afterFailedAnalysis.rows[0], beforeFailedAnalysis.rows[0], 'A failed AI call must not alter OCR, grade, or saved reviews.');

    const secondSubmission = await service.submitSolution(draft.id, studentId, file, {
      recognize: async () => ({ ...normalizedSolution, plainText: 'Revised solution using the power rule.' }),
    });
    assert.equal(secondSubmission.revision, 2);
    const instructorAfterResubmit = await service.listSubmissions(draft.id, instructorId);
    assert.equal(instructorAfterResubmit[0].aiReview, null, 'A prior-revision AI review must not attach to a resubmission.');
    const submissionCount = await pool.query('SELECT COUNT(*)::int count FROM solution_submissions WHERE activity_id=$1 AND student_id=$2', [draft.id, studentId]);
    assert.equal(submissionCount.rows[0].count, 1, 'Resubmission must update, not duplicate, the submission.');

    await service.analyzeSubmission(firstSubmission.id, instructorId, { review: async () => advisoryReview });
    const graded = await service.gradeSubmission(firstSubmission.id, instructorId, {
      finalScore: 18,
      instructorFeedback: 'Correct work. Include the power-rule statement next time.',
    });
    assert.equal(graded.status, 'GRADED');
    assert.equal(graded.finalScore, 18);
    await assert.rejects(() => service.submitSolution(draft.id, studentId, file, { recognize: async () => normalizedSolution }), expectStatus(409));
    await assert.rejects(() => service.gradeSubmission(firstSubmission.id, otherInstructorId, { finalScore: 1 }), expectStatus(404));

    const studentResult = (await service.listStudent(lessonId, studentId))[0];
    assert.equal(studentResult.submission.finalScore, 18);
    assert.equal(studentResult.submission.instructorFeedback.includes('Correct work'), true);
    assert.equal(Object.hasOwn(studentResult.submission, 'aiReview'), false);
    assert.equal(Object.hasOwn(studentResult.submission, 'extractedSolutionText'), false);

    const reopenedSubmission = await service.reopenSubmission(firstSubmission.id, instructorId);
    assert.equal(reopenedSubmission.status, 'READY_FOR_REVIEW');
    assert.equal(reopenedSubmission.finalScore, null);
    assert.equal(reopenedSubmission.aiReview, null, 'Explicit reopen must invalidate the prior advisory review revision.');
    const resubmittedAfterReopen = await service.submitSolution(draft.id, studentId, file, { recognize: async () => normalizedSolution });
    assert.equal(resubmittedAfterReopen.status, 'READY_FOR_REVIEW');
    assert(resubmittedAfterReopen.revision > secondSubmission.revision);

    const failureActivity = await service.createActivity(lessonId, instructorId, {
      title: 'Recognition failure preservation', problemText: 'Solve x + 1 = 2.', instructions: '', rubricText: '', maxPoints: 5,
    });
    ids.activities.push(failureActivity.id);
    await service.setActivityStatus(failureActivity.id, instructorId, 'publish');
    const failedRecognition = await service.submitSolution(failureActivity.id, studentId, file, {
      recognize: async () => { throw new Error('verification recognition failure'); },
    });
    assert.equal(failedRecognition.recognitionStatus, 'FAILED');
    const failedStored = await pool.query('SELECT storage_key FROM solution_submissions WHERE id=$1', [failedRecognition.id]);
    ids.storageKeys.push(failedStored.rows[0].storage_key);
    const preserved = await solutionSubmissionStorage.open(failedStored.rows[0].storage_key);
    assert.equal(preserved.size, PNG.length);
    preserved.stream.destroy();

    await service.setActivityStatus(failureActivity.id, instructorId, 'close');
    const closed = (await service.listStudent(lessonId, studentId)).find(item => item.id === failureActivity.id);
    assert.equal(closed.status, 'CLOSED');
    assert.equal(closed.acceptingSubmissions, false);
    await assert.rejects(() => service.submitSolution(failureActivity.id, studentId, file, { recognize: async () => normalizedSolution }), expectStatus(409));

    console.log('PASS draft/create/publish/close lifecycle');
    console.log('PASS student visibility excludes draft, rubric, AI review, and OCR internals');
    console.log('PASS original image persistence and recognition-failure preservation');
    console.log('PASS advisory AI runs only after explicit instructor action');
    console.log('PASS failed AI analysis preserves submission, OCR, grade, and prior review');
    console.log('PASS AI review cannot set or release the final grade');
    console.log('PASS resubmission increments revision without duplicating or reusing stale AI review');
    console.log('PASS graded resubmission requires explicit instructor reopen');
    console.log('PASS instructor grade/feedback release and student result visibility');
    console.log('PASS instructor/student IDOR protections');
  } finally {
    if (ids.activities.length) {
      const stored = await pool.query('SELECT storage_key FROM solution_submissions WHERE activity_id=ANY($1::uuid[])', [ids.activities]);
      for (const row of stored.rows) ids.storageKeys.push(row.storage_key);
      await pool.query('DELETE FROM solution_activities WHERE id=ANY($1::uuid[])', [ids.activities]);
    }
    for (const key of new Set(ids.storageKeys)) await solutionSubmissionStorage.delete(key).catch(() => {});
    if (lessonId) await pool.query('DELETE FROM lesson_sessions WHERE id=$1', [lessonId]);
    if (sectionId) {
      await pool.query('DELETE FROM enrollments WHERE section_id=$1', [sectionId]);
      await pool.query('DELETE FROM sections WHERE id=$1', [sectionId]);
    }
    if (subjectId) await pool.query('DELETE FROM subjects WHERE id=$1', [subjectId]);
    if (ids.users.length) await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [ids.users]);
    await pool.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
