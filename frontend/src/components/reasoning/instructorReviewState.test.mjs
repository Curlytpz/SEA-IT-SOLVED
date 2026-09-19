import assert from 'node:assert/strict';
import test from 'node:test';
import { instructorReviewState } from './instructorReviewState.js';

test('fresh instructor with no submissions sees the empty state', () => {
  assert.equal(instructorReviewState({ rows: [], totalSubmissions: 0 }), 'empty');
});

test('pending work remains visible when some submissions await review', () => {
  assert.equal(instructorReviewState({ rows: [{ pending: 2 }], totalSubmissions: 3 }), 'pending');
});

test('reviewed message requires at least one submitted response', () => {
  assert.equal(instructorReviewState({ rows: [], totalSubmissions: 3 }), 'reviewed');
});

test('sections or enrollments without submissions do not imply reviewed work', () => {
  assert.equal(instructorReviewState({ rows: [], totalSubmissions: 0 }), 'empty');
});

test('missing count never defaults to the reviewed state', () => {
  assert.equal(instructorReviewState({ rows: [], totalSubmissions: null }), 'unavailable');
});
