import assert from 'node:assert/strict';
import { getStatusPresentation, normalizeStatus } from './statusPresentation.js';

assert.equal(normalizeStatus('in progress'), 'IN_PROGRESS');
assert.equal(normalizeStatus('needs-retry'), 'NEEDS_RETRY');

for (const status of ['PROCESSING', 'IN_PROGRESS']) assert.equal(getStatusPresentation(status).tone, 'processing');
for (const status of ['SUCCESS', 'COMPLETED', 'APPROVED', 'PUBLISHED', 'GRADED']) assert.equal(getStatusPresentation(status).tone, 'success');
for (const status of ['WAITING', 'PENDING', 'WARNING', 'NEEDS_ATTENTION', 'NEEDS_RETRY']) assert.equal(getStatusPresentation(status).tone, 'warning');
for (const status of ['ERROR', 'FAILED', 'REJECTED']) assert.equal(getStatusPresentation(status).tone, 'error');
assert.equal(getStatusPresentation('DRAFT').tone, 'draft');
assert.equal(getStatusPresentation('DISABLED').tone, 'neutral');
assert.equal(getStatusPresentation('IN_PROGRESS').label, 'In progress');
assert.equal(getStatusPresentation('SUBMITTED_AWAITING_REVIEW').label, 'Awaiting review');
assert.equal(getStatusPresentation('CPE-401').tone, 'neutral');

console.log('status presentation tests passed');
