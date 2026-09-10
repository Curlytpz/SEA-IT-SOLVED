const assert = require('node:assert/strict');
require('../src/config/env');
const pool = require('../src/db/pool');
const service = require('../src/services/lesson-intelligence.service');

async function main() {
  const eligible = await pool.query(
    `SELECT version.lesson_id,version.instructor_id
     FROM lesson_context_versions version
     JOIN users instructor ON instructor.id=version.instructor_id
     WHERE version.status='APPROVED'
       AND instructor.role='INSTRUCTOR'
       AND instructor.status='ACTIVE'
       AND EXISTS (
         SELECT 1 FROM lesson_context_chunks chunk
         WHERE chunk.context_version_id=version.id AND chunk.removed=FALSE
       )
     ORDER BY version.approved_at DESC NULLS LAST,version.updated_at DESC
     LIMIT 1`
  );
  if (!eligible.rows.length) throw new Error('No approved lesson context is available for quiz verification.');

  const { lesson_id: lessonId, instructor_id: instructorId } = eligible.rows[0];
  let quiz;
  try {
    quiz = await service.generateQuiz(lessonId, instructorId, { difficulty: 'EASY', questionCount: 5 });
    assert.equal(quiz.status, 'DRAFT');
    assert.equal(quiz.difficulty, 'EASY');
    assert.equal(quiz.questions.length, 5);
    assert.ok(quiz.questions.every(question => question.prompt && question.correctAnswer && question.sourceReferences.length));
    const persisted = await pool.query(
      'SELECT COUNT(*)::int count FROM lesson_quiz_questions WHERE quiz_id=$1',
      [quiz.id]
    );
    assert.equal(persisted.rows[0].count, 5);
    console.log('CHAT QUIZ CORE GENERATION: PASS');
    console.log('QUESTIONS PERSISTED: 5');
  } finally {
    if (quiz?.id) {
      await service.deleteQuiz(quiz.id, instructorId);
      const removed = await pool.query('SELECT COUNT(*)::int count FROM lesson_quizzes WHERE id=$1', [quiz.id]);
      assert.equal(removed.rows[0].count, 0);
      console.log('VERIFICATION QUIZ CLEANUP: PASS');
      console.log('DELETE SURVIVES REFRESH QUERY: PASS');
    }
    await pool.end();
  }
}

main().catch(error => {
  console.error(`CHAT QUIZ CORE GENERATION: FAIL (${error.message})`);
  process.exitCode = 1;
});
