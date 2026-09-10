const AppError = require('./AppError');
const { normalizeLessonMathContent } = require('./mathContent');

// Instructor-only configuration. Student DTOs explicitly pick the allowed fields.
function questionSettings(body = {}, previous = {}) {
  const maxPoints = Math.round(Number(body.maxPoints ?? previous.max_points ?? 1) * 100) / 100;
  if (!Number.isFinite(maxPoints) || maxPoints <= 0 || maxPoints > 10000) throw new AppError('Maximum points must be between 0.01 and 10000.', 422);
  const incoming = body.problemSettings ?? previous.problem_settings ?? {};
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) throw new AppError('Invalid problem-solving settings.', 422);
  for (const key of ['allowTip', 'allowFormula']) {
    if (incoming[key] != null && typeof incoming[key] !== 'boolean') throw new AppError('Help settings must be ON or OFF.', 422);
  }
  const text = (key, limit) => {
    const raw = String(incoming[key] ?? '');
    if (raw.length > limit) throw new AppError(key + ' is too long.', 422);
    const result = normalizeLessonMathContent(raw);
    if (result.needsReview.length) throw new AppError('Please review the math in ' + key + ' before saving.', 422);
    return result.content;
  };
  return { maxPoints, problemSettings: body.type === 'PROBLEM_SOLVING' ? {
    instructions: text('instructions', 4000), rubric: text('rubric', 12000),
    allowTip: incoming.allowTip === true, tip: text('tip', 4000),
    allowFormula: incoming.allowFormula === true, formula: text('formula', 4000),
  } : {} };
}

function studentSolution(row) {
  return row?.solution_file ? { id: row.id, revision: row.solution_revision,
    imageUrl: `/api/quiz-attempt-answers/${row.id}/solution-image?revision=${row.solution_revision}` } : null;
}

module.exports = { questionSettings, studentSolution };
