function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isAllowedInstructorEmail(email, config) {
  const normalizedEmail = normalizeEmail(email);
  const institutionalDomain = normalizeEmail(config?.INSTRUCTOR_EMAIL_DOMAIN);

  if (!institutionalDomain || normalizedEmail.endsWith(`@${institutionalDomain}`)) {
    return true;
  }

  const developmentTestEmail = normalizeEmail(config?.DEV_INSTRUCTOR_TEST_EMAIL);
  return config?.NODE_ENV !== 'production'
    && Boolean(developmentTestEmail)
    && normalizedEmail === developmentTestEmail;
}

module.exports = { isAllowedInstructorEmail, normalizeEmail };
