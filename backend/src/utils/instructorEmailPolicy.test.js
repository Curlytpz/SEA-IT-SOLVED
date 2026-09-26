const test = require('node:test');
const assert = require('node:assert/strict');
const { isAllowedInstructorEmail } = require('./instructorEmailPolicy');

const baseConfig = {
  NODE_ENV: 'development',
  INSTRUCTOR_EMAIL_DOMAIN: 'hau.edu.ph',
  DEV_INSTRUCTOR_TEST_EMAIL: 'instructor-flow-test@example.com',
};

test('allows the exact configured instructor test email outside production', () => {
  assert.equal(isAllowedInstructorEmail(' Instructor-Flow-Test@Example.com ', baseConfig), true);
  assert.equal(isAllowedInstructorEmail('instructor-flow-test+other@example.com', baseConfig), false);
  assert.equal(isAllowedInstructorEmail('other@example.com', baseConfig), false);
  assert.equal(isAllowedInstructorEmail('instructor-flow-test@example.com.evil.test', baseConfig), false);
});

test('ignores the instructor test-email exception in production', () => {
  assert.equal(isAllowedInstructorEmail('instructor-flow-test@example.com', {
    ...baseConfig,
    NODE_ENV: 'production',
  }), false);
});

test('preserves normal instructor institutional-domain behavior', () => {
  assert.equal(isAllowedInstructorEmail('professor@hau.edu.ph', baseConfig), true);
  assert.equal(isAllowedInstructorEmail('professor@other.edu.ph', baseConfig), false);
});
