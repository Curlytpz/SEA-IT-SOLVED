export const STUDENT_EMAIL_UNVERIFIED_CODE = 'STUDENT_EMAIL_UNVERIFIED';
export const VERIFICATION_RESEND_SUCCESS_MESSAGE = 'Verification email sent. Check your HAU Outlook inbox and Junk folder.';

export const INSTRUCTOR_EMAIL_UNVERIFIED_CODE = 'INSTRUCTOR_EMAIL_UNVERIFIED';

export function shouldShowVerificationResend(role, errorCode) {
  return (role === 'student' && errorCode === STUDENT_EMAIL_UNVERIFIED_CODE)
    || (role === 'instructor' && errorCode === INSTRUCTOR_EMAIL_UNVERIFIED_CODE);
}

export function verificationResendActionLabel({ sending, cooldownSeconds }) {
  if (sending) return 'Sending...';
  if (cooldownSeconds > 0) return 'Resend again in ' + cooldownSeconds + 's';
  return 'Resend verification email';
}

export function requestVerificationResend(apiClient, email) {
  return apiClient.post('/auth/verify-email/resend', { email });
}
