const ROLE_GREETINGS = {
  INSTRUCTOR: 'Welcome back, Professor',
  ADMIN: 'Welcome back, Administrator',
};

export const RETURNING_STUDENT_MESSAGES = Object.freeze([
  'Let’s cook!',
  'Ready for another round?',
  'Let’s make progress today.',
  'Back at it — one step closer.',
  'Time to sharpen those engineering skills.',
  'Let’s build something great today.',
  'Ready to level up?',
  'Another day, another problem to solve.',
  'Let’s keep the momentum going.',
]);

const SESSION_KEY_PREFIX = 'sea-student-dashboard-greeting:';
const LAST_MESSAGE_KEY_PREFIX = 'sea-student-dashboard-last-message:';

function browserStorage(name) {
  try { return typeof window === 'undefined' ? null : window[name]; }
  catch { return null; }
}

function readJson(storage, key) {
  try { return JSON.parse(storage?.getItem(key) || 'null'); }
  catch { return null; }
}

function chooseReturningMessage(userId, localStorage) {
  const lastKey = `${LAST_MESSAGE_KEY_PREFIX}${userId}`;
  const previous = Number.parseInt(localStorage?.getItem(lastKey) || '', 10);
  const next = Number.isInteger(previous)
    ? (previous + 1) % RETURNING_STUDENT_MESSAGES.length
    : Math.floor(Math.random() * RETURNING_STUDENT_MESSAGES.length);
  try { localStorage?.setItem(lastKey, String(next)); } catch { /* storage may be unavailable */ }
  return RETURNING_STUDENT_MESSAGES[next];
}

export function clearStudentDashboardGreetingSession(userId, storage = browserStorage('sessionStorage')) {
  if (!userId) return;
  try { storage?.removeItem(`${SESSION_KEY_PREFIX}${userId}`); } catch { /* storage may be unavailable */ }
}

export function studentDashboardGreeting(user, options = {}) {
  const userId = user?.id || 'anonymous';
  const sessionStorage = options.sessionStorage ?? browserStorage('sessionStorage');
  const localStorage = options.localStorage ?? browserStorage('localStorage');
  const sessionKey = `${SESSION_KEY_PREFIX}${userId}`;
  const cached = readJson(sessionStorage, sessionKey);
  if (cached?.title && cached?.subtitle) return cached;

  const loginCount = Number(user?.successfulLoginCount);
  const loginStateIsKnown = Number.isInteger(loginCount) && loginCount >= 0;
  const greeting = loginStateIsKnown && loginCount === 1
    ? {
        title: 'Welcome, Future Engineer!',
        subtitle: 'Your learning journey starts here.',
      }
    : {
        title: 'Welcome back, Future Engineer!',
        subtitle: chooseReturningMessage(userId, localStorage),
      };

  try { sessionStorage?.setItem(sessionKey, JSON.stringify(greeting)); } catch { /* storage may be unavailable */ }
  return greeting;
}

export function dashboardGreeting(user) {
  const role = String(user?.role || '').toUpperCase();
  if (role === 'STUDENT') return studentDashboardGreeting(user);
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
  return {
    title: ROLE_GREETINGS[role] || 'Welcome back',
    name,
  };
}
