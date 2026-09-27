function jsonByteLength(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function compactQuizContext(items = []) {
  return items.map(item => {
    const math = [...new Set((Array.isArray(item.math) ? item.math : [])
      .map(value => String(value || '').trim())
      .filter(Boolean))];
    return {
      type: String(item.type || 'OTHER'),
      source: String(item.source || ''),
      text: String(item.text || '').trim(),
      ...(math.length ? { math } : {}),
    };
  }).filter(item => item.text || item.math?.length);
}

function compactQuizContextWithMetrics(items = []) {
  const compact = compactQuizContext(items);
  return {
    payload: compact,
    metrics: {
      originalBytes: jsonByteLength(items),
      compactBytes: jsonByteLength(compact),
      chunkCount: compact.length,
    },
  };
}

module.exports = { compactQuizContext, compactQuizContextWithMetrics, jsonByteLength };
