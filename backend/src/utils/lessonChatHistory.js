const MAX_TITLE_LENGTH = 72;

function clean(value) {
  return String(value || '')
    .replace(/[`*_#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactTopic(value) {
  return clean(value)
    .replace(/^\b(?:please\s+)?(?:generate|create|make|write|prepare)\b\s*/i, '')
    .replace(/^\b(?:an?\s+)?(?:\d+[- ]?(?:item|question)?\s*)?(?:easy|medium|hard)?\s*(?:multiple[- ]choice|true[- ]false|problem[- ]solving)?\s*quiz\b\s*/i, '')
    .replace(/^\b(?:about|on|for|covering)\b\s*/i, '')
    .replace(/[.!?]+$/g, '')
    .trim();
}

function truncate(value, maxLength = MAX_TITLE_LENGTH) {
  const text = clean(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function conversationTitle(firstMessage) {
  const message = clean(firstMessage);
  if (!message) return 'New Conversation';

  const explain = message.match(/^\s*(?:please\s+)?explain\s+(.+)$/i);
  if (explain) return truncate(`Explain: ${explain[1].replace(/[.!?]+$/g, '')}`);

  const rewrite = message.match(/^\s*(?:please\s+)?(?:rewrite|revise)\s+(?:the\s+)?(.+)$/i);
  if (rewrite) {
    const topic = compactTopic(rewrite[1].replace(/\bnotes?\b/gi, '').trim()) || 'Lesson Notes';
    return truncate(`Rewrite Notes: ${topic}`);
  }

  if (/\bquiz\b/i.test(message)) {
    const topic = compactTopic(message) || 'Lesson';
    return truncate(`Quiz: ${topic}`);
  }

  return truncate(message);
}

module.exports = { conversationTitle, truncate };
