export function instructorReviewState({ rows, totalSubmissions }) {
  if (!Array.isArray(rows)) return 'unavailable';
  if (rows.length > 0) return 'pending';
  if (totalSubmissions === 0) return 'empty';
  if (Number.isInteger(totalSubmissions) && totalSubmissions > 0) return 'reviewed';
  return 'unavailable';
}
