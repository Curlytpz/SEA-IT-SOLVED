const assert = require('node:assert/strict');
const { conversationTitle } = require('./lessonChatHistory');

assert.equal(conversationTitle("Explain L'Hopital's Rule"), "Explain: L'Hopital's Rule");
assert.equal(conversationTitle('Generate a 10-item quiz about limits'), 'Quiz: limits');
assert.equal(conversationTitle('Rewrite the derivative notes'), 'Rewrite Notes: derivative');
assert.equal(conversationTitle(''), 'New Conversation');
assert.ok(conversationTitle('A'.repeat(100)).length <= 72);

console.log('Lesson chat history title tests passed.');
