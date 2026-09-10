const COMMAND_TEXT = {
  cdot: '·', times: '×', div: '÷', pm: '±', mp: '∓', neq: '≠', ne: '≠',
  leq: '≤', le: '≤', geq: '≥', ge: '≥', approx: '≈', to: '→', rightarrow: '→',
  leftarrow: '←', infty: '∞', partial: '∂', nabla: '∇', pi: 'π', theta: 'θ',
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', lambda: 'λ', mu: 'μ', sigma: 'σ',
  Delta: 'Δ', sin: 'sin ', cos: 'cos ', tan: 'tan ', log: 'log ', ln: 'ln ', lim: 'lim ',
};

function row(children = []) {
  const compact = [];
  for (const child of children.filter(Boolean)) {
    if (child.type === 'row') compact.push(...child.children);
    else if (child.type === 'text' && compact.at(-1)?.type === 'text') compact[compact.length - 1].text += child.text;
    else compact.push(child);
  }
  return { type: 'row', children: compact };
}

function parseLatex(value) {
  const source = String(value || '')
    .replace(/^\s*(?:\$\$?|\\\[|\\\()|(?:\$\$?|\\\]|\\\))\s*$/g, '')
    .replace(/\\displaystyle|\\textstyle/g, '')
    .trim();
  let index = 0;

  const skipSpace = () => { while (/\s/.test(source[index] || '')) index += 1; };
  let sequence;
  let primary;
  const group = () => {
    skipSpace();
    if (source[index] !== '{') return primary();
    index += 1;
    const valueNode = sequence('}');
    if (source[index] === '}') index += 1;
    return valueNode;
  };
  const scriptValue = () => {
    skipSpace();
    return source[index] === '{' ? group() : primary();
  };
  const command = () => {
    index += 1;
    if (/[,;! ]/.test(source[index] || '')) { index += 1; return { type: 'text', text: ' ' }; }
    const match = source.slice(index).match(/^[A-Za-z]+/);
    if (!match) return { type: 'text', text: source[index++] || '' };
    const name = match[0];
    index += name.length;
    if (['frac', 'dfrac', 'tfrac'].includes(name)) return { type: 'fraction', numerator: group(), denominator: group() };
    if (name === 'sqrt') {
      skipSpace();
      let degree = null;
      if (source[index] === '[') {
        index += 1;
        degree = sequence(']');
        if (source[index] === ']') index += 1;
      }
      return { type: 'radical', degree, body: group() };
    }
    if (name === 'int') return { type: 'integral' };
    if (name === 'sum' || name === 'prod') return { type: 'nary', symbol: name === 'sum' ? '∑' : '∏' };
    if (name === 'left' || name === 'right') return primary();
    if (name === 'text' || name === 'mathrm' || name === 'operatorname') return group();
    if (name === 'begin' || name === 'end') { group(); return { type: 'text', text: ' ' }; }
    return { type: 'text', text: COMMAND_TEXT[name] || name };
  };
  primary = () => {
    skipSpace();
    if (index >= source.length) return null;
    if (source[index] === '\\') return command();
    if (source[index] === '{') return group();
    const character = source[index++];
    return { type: 'text', text: /[+=<>-]/.test(character) ? ` ${character} ` : character };
  };
  const scripted = () => {
    let base = primary();
    if (!base) return null;
    let superScript = null;
    let subScript = null;
    while (source[index] === '^' || source[index] === '_') {
      const operator = source[index++];
      const valueNode = scriptValue();
      if (operator === '^') superScript = valueNode;
      else subScript = valueNode;
    }
    if (superScript && subScript) base = { type: 'subsup', base, superScript, subScript };
    else if (superScript) base = { type: 'sup', base, superScript };
    else if (subScript) base = { type: 'sub', base, subScript };
    return base;
  };
  sequence = stop => {
    const children = [];
    while (index < source.length && source[index] !== stop) {
      const before = index;
      const child = scripted();
      if (child) children.push(child);
      if (index === before) index += 1;
    }
    return row(children);
  };

  return sequence(null);
}

const SUPERSCRIPT = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', '=': '⁼', n: 'ⁿ', i: 'ⁱ' };
const SUBSCRIPT = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋', '=': '₌' };

function mapScript(text, map, marker) {
  return [...text].every(character => map[character]) ? [...text].map(character => map[character]).join('') : `${marker}(${text})`;
}

function mathToUnicode(node) {
  if (!node) return '';
  if (node.type === 'text') return node.text;
  if (node.type === 'row') return node.children.map(mathToUnicode).join('').replace(/\s{2,}/g, ' ').trim();
  if (node.type === 'fraction') return `(${mathToUnicode(node.numerator)})⁄(${mathToUnicode(node.denominator)})`;
  if (node.type === 'radical') return `${node.degree ? mathToUnicode(node.degree) : ''}√(${mathToUnicode(node.body)})`;
  if (node.type === 'integral') return '∫';
  if (node.type === 'nary') return node.symbol;
  if (node.type === 'sup') return `${mathToUnicode(node.base)}${mapScript(mathToUnicode(node.superScript), SUPERSCRIPT, '^')}`;
  if (node.type === 'sub') return `${mathToUnicode(node.base)}${mapScript(mathToUnicode(node.subScript), SUBSCRIPT, '_')}`;
  if (node.type === 'subsup') return `${mathToUnicode(node.base)}${mapScript(mathToUnicode(node.subScript), SUBSCRIPT, '_')}${mapScript(mathToUnicode(node.superScript), SUPERSCRIPT, '^')}`;
  return '';
}

module.exports = { mathToUnicode, parseLatex };