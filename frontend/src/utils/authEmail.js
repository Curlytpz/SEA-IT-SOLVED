export const STUDENT_EMAIL_DOMAIN = 'student.hau.edu.ph';
export const STUDENT_EMAIL_HINT = `Use your HAU Student email ending in @${STUDENT_EMAIL_DOMAIN}.`;

export function isStudentEmail(email) {
  return String(email || '').trim().toLowerCase().endsWith(`@${STUDENT_EMAIL_DOMAIN}`);
}
