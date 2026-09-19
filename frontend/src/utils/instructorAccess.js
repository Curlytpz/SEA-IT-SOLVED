export const INSTRUCTOR_ACCESS_NOTICE_KEY = 'instructorAccessNotice';

export const INSTRUCTOR_ACCESS_NOTICES = {
  INSTRUCTOR_PENDING: {
    type: 'info',
    title: 'Awaiting Admin Approval',
    message: 'Your instructor account is awaiting admin approval. Your registration was successful, but an administrator must approve your account before you can access the instructor dashboard. Please try again after your account has been approved.',
  },
  INSTRUCTOR_REJECTED: {
    type: 'warning',
    title: 'Your instructor account was not approved.',
    message: 'Please contact the administrator if you believe this was a mistake or need more information.',
  },
  INSTRUCTOR_SUSPENDED: {
    type: 'warning',
    title: 'Your instructor account is unavailable.',
    message: 'Please contact the administrator for more information.',
  },
};

export function instructorAccessCodeForStatus(status) {
  if (status === 'PENDING') return 'INSTRUCTOR_PENDING';
  if (status === 'REJECTED') return 'INSTRUCTOR_REJECTED';
  if (status === 'SUSPENDED') return 'INSTRUCTOR_SUSPENDED';
  return null;
}

export function isInstructorAccessCode(code) {
  return Object.hasOwn(INSTRUCTOR_ACCESS_NOTICES, code);
}
