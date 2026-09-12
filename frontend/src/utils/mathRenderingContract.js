const classNames = node => Array.isArray(node?.properties?.className)
  ? node.properties.className
  : [];

const TALL_INLINE_MATH = /\\(?:frac|dfrac|binom|int|sum|prod|lim|sqrt|begin)(?![A-Za-z])/;
const EXPLICIT_MATH_STYLE = /^\s*\\(?:displaystyle|textstyle|scriptstyle|scriptscriptstyle)(?![A-Za-z])/;

export function withSafeInlineMathStyle(value) {
  const latex = String(value || '').trim();
  if (!latex || EXPLICIT_MATH_STYLE.test(latex) || !TALL_INLINE_MATH.test(latex)) return latex;
  return `\\displaystyle ${latex}`;
}

function visitMarkdownMath(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'inlineMath') node.value = withSafeInlineMathStyle(node.value);
  if (Array.isArray(node.children)) node.children.forEach(visitMarkdownMath);
}

/** Give tall inline formulas full TeX spacing without changing stored source. */
export function remarkMathRenderingContract() {
  return tree => visitMarkdownMath(tree);
}

const nodeText = node => node?.type === 'text'
  ? String(node.value || '')
  : (node?.children || []).map(nodeText).join('');

function decorateMathNode(node, { showReviewFallback, insideDisplay }) {
  const classes = classNames(node);

  if (classes.includes('katex-error')) {
    const fallback = nodeText(node).trim() || 'Mathematical expression could not be rendered';
    node.properties = {
      ...node.properties,
      className: [...new Set([...classes, 'math-invalid-source', ...(showReviewFallback ? ['math-review-needed'] : [])])],
      title: undefined,
      role: 'note',
      'aria-label': showReviewFallback
        ? 'Mathematical expression needs instructor review'
        : 'Mathematical expression shown as source text',
    };
    node.children = [{ type: 'text', value: fallback }];
    return node;
  }

  const isDisplay = classes.includes('katex-display');
  const isInline = !insideDisplay && classes.includes('katex');
  const isTallInline = isInline && /\\displaystyle(?![A-Za-z])/.test(nodeText(node));

  if (Array.isArray(node.children)) {
    node.children = node.children.map(child => transformMathNode(child, {
      showReviewFallback,
      insideDisplay: insideDisplay || isDisplay,
    }));
  }

  if (isInline) {
    return {
      type: 'element',
      tagName: 'span',
      properties: { className: ['math-inline', ...(isTallInline ? ['math-inline-tall'] : [])] },
      children: [node],
    };
  }

  if (!isDisplay) return node;

  // Scrolling belongs to this outer wrapper. The KaTeX node and all of its
  // internal fraction/vertical-layout spans remain controlled by KaTeX CSS.
  return {
    type: 'element',
    tagName: 'span',
    properties: {
      className: ['math-block', 'math-scroll'],
      tabIndex: 0,
      role: 'region',
      'aria-label': 'Scrollable mathematical expression',
    },
    children: [node],
  };
}

function transformMathNode(node, options) {
  if (!node || typeof node !== 'object') return node;
  return decorateMathNode(node, options);
}

/**
 * Shared post-KaTeX layout contract used by every Markdown/math surface.
 * It adds only outer layout hooks and never changes KaTeX's internal DOM.
 */
export function rehypeMathRenderingContract(options = {}) {
  const settings = {
    showReviewFallback: Boolean(options.showReviewFallback),
    insideDisplay: false,
  };
  return tree => {
    if (Array.isArray(tree?.children)) {
      tree.children = tree.children.map(child => transformMathNode(child, settings));
    }
  };
}
