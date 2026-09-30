export function normalizeVerificationCode(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 8);
}
