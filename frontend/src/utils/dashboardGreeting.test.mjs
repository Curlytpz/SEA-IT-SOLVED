import assert from 'node:assert/strict';
import {
  RETURNING_STUDENT_MESSAGES,
  clearStudentDashboardGreetingSession,
  studentDashboardGreeting,
} from './dashboardGreeting.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

const student = { id: 'student-1', role: 'STUDENT', successfulLoginCount: 1 };
const session = memoryStorage();
const local = memoryStorage();

const first = studentDashboardGreeting(student, { sessionStorage: session, localStorage: local });
assert.deepEqual(first, {
  title: 'Welcome, Future Engineer!',
  subtitle: 'Your learning journey starts here.',
});

const legacySession = memoryStorage();
const legacyUser = studentDashboardGreeting(
  { id: 'legacy-student', role: 'STUDENT' },
  { sessionStorage: legacySession, localStorage: memoryStorage() }
);
assert.equal(legacyUser.title, 'Welcome back, Future Engineer!', 'an old cached user without the new field must not appear brand new');

const sameSessionAfterRefresh = studentDashboardGreeting(
  { ...student, successfulLoginCount: 1 },
  { sessionStorage: session, localStorage: local }
);
assert.deepEqual(sameSessionAfterRefresh, first, 'the first-login greeting must remain stable during that login session');

clearStudentDashboardGreetingSession(student.id, session);
const returning = studentDashboardGreeting(
  { ...student, successfulLoginCount: 2 },
  { sessionStorage: session, localStorage: local }
);
assert.equal(returning.title, 'Welcome back, Future Engineer!');
assert.ok(RETURNING_STUDENT_MESSAGES.includes(returning.subtitle));
assert.deepEqual(
  studentDashboardGreeting({ ...student, successfulLoginCount: 2 }, { sessionStorage: session, localStorage: local }),
  returning,
  'the motivational phrase must remain stable while the session is active'
);

clearStudentDashboardGreetingSession(student.id, session);
const nextSession = studentDashboardGreeting(
  { ...student, successfulLoginCount: 3 },
  { sessionStorage: session, localStorage: local }
);
assert.notEqual(nextSession.subtitle, returning.subtitle, 'a later session should rotate to another phrase');

console.log('Student dashboard greeting contract passed.');
