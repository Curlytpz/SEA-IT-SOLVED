import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  requestVerificationResend,
  shouldShowVerificationResend,
  verificationResendActionLabel,
  VERIFICATION_RESEND_SUCCESS_MESSAGE,
} from './authVerificationResend.js';
import { readCapsLockState } from './capsLock.js';
import { togglePasswordVisibility } from './passwordVisibility.js';

assert.equal(shouldShowVerificationResend('student', 'STUDENT_EMAIL_UNVERIFIED'), true);
assert.equal(shouldShowVerificationResend('instructor', 'INSTRUCTOR_EMAIL_UNVERIFIED'), true);
assert.equal(shouldShowVerificationResend('student', 'INVALID_CREDENTIALS'), false);
assert.equal(shouldShowVerificationResend('instructor', 'STUDENT_EMAIL_UNVERIFIED'), false);
assert.equal(shouldShowVerificationResend('admin', 'STUDENT_EMAIL_UNVERIFIED'), false);

let postedRequest;
await requestVerificationResend({
  post: async (url, body) => { postedRequest = { url, body }; return { data: {} }; },
}, 'student@student.hau.edu.ph');
assert.deepEqual(postedRequest, {
  url: '/auth/verify-email/resend',
  body: { email: 'student@student.hau.edu.ph' },
});
assert.equal(verificationResendActionLabel({ sending: true, cooldownSeconds: 0 }), 'Sending...');
assert.equal(verificationResendActionLabel({ sending: false, cooldownSeconds: 30 }), 'Resend again in 30s');
assert.equal(verificationResendActionLabel({ sending: false, cooldownSeconds: 0 }), 'Resend verification email');
assert.equal(VERIFICATION_RESEND_SUCCESS_MESSAGE, 'Verification email sent. Check your HAU Outlook inbox and Junk folder.');

assert.equal(readCapsLockState({ getModifierState: key => key === 'CapsLock' }), true);
assert.equal(readCapsLockState({ getModifierState: () => false }), false);
assert.equal(readCapsLockState({}), false);

let passwordVisible = false;
assert.equal(passwordVisible, false, 'Passwords must be hidden by default.');
passwordVisible = togglePasswordVisibility(passwordVisible);
assert.equal(passwordVisible, true, 'The first eye-button activation must reveal the password.');
passwordVisible = togglePasswordVisibility(passwordVisible);
assert.equal(passwordVisible, false, 'The second eye-button activation must hide the password.');

const passwordInputSource = fs.readFileSync(new URL('../components/public/AuthPasswordInput.jsx', import.meta.url), 'utf8');
assert.match(passwordInputSource, /useState\(false\)/, 'The shared password input must initialize hidden.');
assert.match(passwordInputSource, /type=\{visible \? 'text' : 'password'\}/, 'Visibility must control the native input type.');
assert.match(passwordInputSource, /type="button"/, 'The eye toggle must not submit authentication forms.');
assert.match(passwordInputSource, /aria-label=\{visible \? 'Hide password' : 'Show password'\}/, 'The toggle must expose its state accessibly.');
assert.match(passwordInputSource, /setVisible\(togglePasswordVisibility\)/, 'The eye button must toggle visibility.');
assert.match(passwordInputSource, /onKeyDown=/, 'Caps Lock state must update on keydown.');
assert.match(passwordInputSource, /onKeyUp=/, 'Caps Lock state must update on keyup.');
assert.match(passwordInputSource, /setFocused\(false\)/, 'Caps Lock warning must hide on blur.');
assert.match(passwordInputSource, /aria-live="polite"/, 'Caps Lock warning must be announced politely.');
assert.match(passwordInputSource, /Caps Lock is on/);

const authPages = [
  ['Login.jsx', 1],
  ['RegisterStudent.jsx', 2],
  ['RegisterInstructor.jsx', 2],
  ['ResetPassword.jsx', 2],
];
for (const [file, expectedCount] of authPages) {
  const source = fs.readFileSync(new URL('../pages/' + file, import.meta.url), 'utf8');
  assert.equal((source.match(/<AuthPasswordInput\b/g) || []).length, expectedCount, file + ' must cover every password field.');
  assert.doesNotMatch(source, /<Input\s+type="password"/, file + ' must not bypass the shared Caps Lock-aware input.');
}
assert.equal((passwordInputSource.match(/<button\b/g) || []).length, 1, 'Caps Lock support and the eye toggle must share one reusable password component.');

const loginSource = fs.readFileSync(new URL('../pages/Login.jsx', import.meta.url), 'utf8');
assert.match(loginSource, /shouldShowVerificationResend\(selectedRole, loginErrorCode\)/);
const requestsSource = fs.readFileSync(new URL('../pages/admin/InstructorRequests.jsx', import.meta.url), 'utf8');
assert.match(requestsSource, /disabled=\{!r\.emailVerifiedAt\}/);
assert.match(requestsSource, /Instructor must verify their institutional email before approval\./);
const verifyEmailSource = fs.readFileSync(new URL('../pages/VerifyEmail.jsx', import.meta.url), 'utf8');
assert.match(verifyEmailSource, /response\.data\?\.data\?\.role/);

console.log('Authentication UX tests passed.');
