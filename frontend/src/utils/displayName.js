/**
 * Presentation-only normalization for names supplied by existing records.
 * It deliberately leaves intentional mixed casing alone.
 */
export function formatDisplayName(value = '') {
  const normalized = String(value).trim().replace(/\s+/g, ' ');
  if (!normalized) return '';

  const letters = normalized.replace(/[^A-Za-z]/g, '');
  const isUniformCase = letters.length > 1 && (letters === letters.toLowerCase() || letters === letters.toUpperCase());
  if (!isUniformCase) return normalized;

  return normalized.replace(/[A-Za-z]+/g, word => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`);
}

export function formatPersonName(person = {}) {
  const fullName = [person.lastName, person.firstName].filter(Boolean).join(', ');
  return formatDisplayName(fullName || person.name || 'Unknown student');
}
