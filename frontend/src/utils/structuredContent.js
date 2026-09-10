export function humanText(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(humanText).filter(Boolean).join('\n');
  if (!value || typeof value !== 'object') return '';
  for (const key of ['text', 'plainText', 'markdown', 'content', 'value', 'label']) {
    const result = humanText(value[key]);
    if (result) return result;
  }
  return '';
}

export function latexValues(value) {
  const items = Array.isArray(value) ? value : value == null ? [] : [value];
  return items.flatMap(item => {
    if (typeof item === 'string' || typeof item === 'number') return [String(item).trim()];
    if (Array.isArray(item)) return latexValues(item);
    if (!item || typeof item !== 'object') return [];
    if (typeof item.latex === 'string') return [item.latex.trim()];
    if (item.type === 'math') return latexValues(item.value || item.content || item.text);
    return latexValues(item.math || item.mathExpressions || item.blocks);
  }).filter(Boolean);
}
