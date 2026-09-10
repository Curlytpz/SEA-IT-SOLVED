const ROLE_GREETINGS = {
  INSTRUCTOR: 'Welcome back, Professor',
  STUDENT: 'Welcome back, Future Engineer',
  ADMIN: 'Welcome back, Administrator',
};

export function dashboardGreeting(user) {
  const role = String(user?.role || '').toUpperCase();
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
  return {
    title: ROLE_GREETINGS[role] || 'Welcome back',
    name,
  };
}
