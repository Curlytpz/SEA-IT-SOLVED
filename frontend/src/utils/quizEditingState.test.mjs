import assert from 'node:assert/strict';
import { getQuizEditingState } from './quizEditingState.js';

const draft = getQuizEditingState('DRAFT');
assert.equal(draft.canEditQuiz, true);
assert.equal(draft.canPublishQuiz, true);
assert.equal(draft.isEditingPublishedQuiz, false);

const published = getQuizEditingState('PUBLISHED');
assert.equal(published.canEditQuiz, false);
assert.equal(published.canPublishQuiz, false);
assert.equal(published.statusLabel, 'published');

const publishedEditing = getQuizEditingState('PUBLISHED', true);
assert.equal(publishedEditing.canEditQuiz, true);
assert.equal(publishedEditing.isEditingPublishedQuiz, true);
assert.equal(publishedEditing.statusLabel, 'Published · Editing');

const disabled = getQuizEditingState('DISABLED');
assert.equal(disabled.canEditQuiz, true, 'Existing disabled-quiz editing remains available.');
assert.equal(disabled.canPublishQuiz, false);

console.log('Quiz editing state verification passed.');
