export function normalizeVerificationCode(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 8);
}

export function maskEmail(value) {
  const normalized = String(value || '').trim().toLowerCase();
  const at = normalized.indexOf('@');
  if (at <= 0) return normalized;
  const local = normalized.slice(0, at);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'*'.repeat(Math.max(3, local.length - visible.length))}${normalized.slice(at)}`;
}
