/*
 * The provider payload is retained separately for audit. This module works on
 * the normalized, compiled representation only: it can therefore make the
 * lesson readable without rewriting a provider's raw recognition evidence.
 */
function clean(value) {
  return String(value == null ? '' : value)
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTextForComparison(value) {
  return clean(value)
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeMathForComparison(value) {
  let result = clean(value)
    .replace(/\\left|\\right/g, '')
    .replace(/\\(?:,|;|!|quad|qquad)/g, '')
    .replace(/[−–—]/g, '-')
    .replace(/[→⟶]/g, '\\to');

  // Only flatten simple, visible fractions for comparison. The original
  // LaTeX remains untouched in the selected display block.
  let previous;
  do {
    previous = result;
    result = result.replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '$1/$2');
  } while (result !== previous);

  return result
    .replace(/\\([A-Za-z]+)/g, '$1')
    .replace(/[{}\s]/g, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}+\-*/=^().,<>]/gu, '');
}

function normalizedContent(block) {
  const display = block?.type === 'math' ? block?.latex : block?.text;
  const key = block?.type === 'math'
    ? normalizeMathForComparison(display)
    : normalizeTextForComparison(display);
  return { key, type: block?.type || 'text' };
}

function comparisonTokens(value) {
  return new Set(String(value || '').split(/[\s,]+/).filter(token => token.length > 1));
}

function textSimilarity(first, second) {
  const a = comparisonTokens(first);
  const b = comparisonTokens(second);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  a.forEach(token => { if (b.has(token)) shared += 1; });
  return shared / Math.max(a.size, b.size);
}

function equivalentContent(first, second) {
  const a = normalizedContent(first);
  const b = normalizedContent(second);
  if (!a.key || !b.key) return false;
  if (a.key === b.key) return true;
  // Mathematical blocks are deliberately exact after the conservative
  // normalization above; near-matches can be different equations.
  if (a.type === 'math' || b.type === 'math') return false;
  return Math.min(a.key.length, b.key.length) >= 18 && textSimilarity(a.key, b.key) >= 0.94;
}

function validBounds(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  const width = Number(value?.width);
  const height = Number(value?.height);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
    width: Math.max(0, Math.min(1, width)),
    height: Math.max(0, Math.min(1, height)),
  };
}

function boundsFor(block) {
  return validBounds(block?.reconciliationBounds || block?.bounds);
}

function sameSpatialScope(first, second) {
  return String(first?.reconciliationScope || '') === String(second?.reconciliationScope || '');
}

function spatiallyDuplicate(first, second) {
  if (!sameSpatialScope(first, second)) return false;
  const a = boundsFor(first);
  const b = boundsFor(second);
  if (!a || !b) return false;
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  if (!intersection) return false;
  const aArea = a.width * a.height;
  const bArea = b.width * b.height;
  const iou = intersection / (aArea + bArea - intersection);
  const coverage = intersection / Math.min(aArea, bArea);
  const centerDistance = Math.hypot((a.x + a.width / 2) - (b.x + b.width / 2), (a.y + a.height / 2) - (b.y + b.height / 2));
  const widthRatio = Math.min(a.width, b.width) / Math.max(a.width, b.width);
  const heightRatio = Math.min(a.height, b.height) / Math.max(a.height, b.height);
  return iou >= 0.35 || coverage >= 0.68 || (centerDistance <= 0.035 && widthRatio >= 0.72 && heightRatio >= 0.72);
}

function quality(block) {
  const value = Number(block?.confidence);
  const confidence = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5;
  const content = block?.type === 'math' ? block?.latex : block?.text;
  const detail = Math.min(clean(content).length / 500, 0.18);
  const area = boundsFor(block);
  const areaScore = area ? Math.min(area.width * area.height, 0.08) : 0;
  return confidence + detail + areaScore + (block?.uncertain ? 0 : 0.14) + (block?.type === 'math' ? 0.02 : 0);
}

const GRID_SIZE = 8;

function gridKeys(block) {
  const bounds = boundsFor(block);
  if (!bounds) return [];
  const startX = Math.max(0, Math.min(GRID_SIZE - 1, Math.floor(bounds.x * GRID_SIZE)));
  const endX = Math.max(0, Math.min(GRID_SIZE - 1, Math.floor(Math.min(0.999999, bounds.x + bounds.width) * GRID_SIZE)));
  const startY = Math.max(0, Math.min(GRID_SIZE - 1, Math.floor(bounds.y * GRID_SIZE)));
  const endY = Math.max(0, Math.min(GRID_SIZE - 1, Math.floor(Math.min(0.999999, bounds.y + bounds.height) * GRID_SIZE)));
  const keys = [];
  for (let y = startY; y <= endY; y += 1) {
    for (let x = startX; x <= endX; x += 1) keys.push(`${block.reconciliationScope || ''}:${x}:${y}`);
  }
  return keys;
}

function stableReadingOrder(first, second) {
  const order = Number(first.order) - Number(second.order);
  if (Number.isFinite(order) && order !== 0) return order;
  const a = boundsFor(first);
  const b = boundsFor(second);
  if (a && b) {
    const vertical = a.y - b.y;
    if (Math.abs(vertical) > 0.02) return vertical;
    const horizontal = a.x - b.x;
    if (horizontal !== 0) return horizontal;
  }
  return Number(first._sourceIndex) - Number(second._sourceIndex);
}

function stripInternal(block, order) {
  const { reconciliationBounds, reconciliationScope, _sourceIndex, ...publicBlock } = block;
  return { ...publicBlock, order };
}

function reconcileRecognitionBlocks(inputBlocks, { scope = '' } = {}) {
  const candidates = (Array.isArray(inputBlocks) ? inputBlocks : [])
    .map((block, index) => ({ ...block, reconciliationScope: block.reconciliationScope ?? scope, _sourceIndex: index }))
    .sort(stableReadingOrder);
  const buckets = new Map();
  const accepted = [];
  const suppressed = new Set();

  for (const candidate of candidates) {
    const nearby = new Set();
    gridKeys(candidate).forEach(key => (buckets.get(key) || []).forEach(item => nearby.add(item)));
    let duplicate = null;
    for (const prior of nearby) {
      if (suppressed.has(prior)) continue;
      if (spatiallyDuplicate(prior, candidate) && equivalentContent(prior, candidate)) {
        duplicate = prior;
        break;
      }
    }
    if (!duplicate) {
      accepted.push(candidate);
      gridKeys(candidate).forEach(key => {
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(candidate);
      });
      continue;
    }
    if (quality(candidate) > quality(duplicate) + 0.02) {
      suppressed.add(duplicate);
      accepted.push(candidate);
      gridKeys(candidate).forEach(key => {
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(candidate);
      });
    } else {
      suppressed.add(candidate);
    }
  }

  const blocks = accepted.filter(block => !suppressed.has(block)).sort(stableReadingOrder)
    .map((block, index) => stripInternal(block, index + 1));
  return { blocks, suppressedCount: candidates.length - blocks.length };
}

function plainTextFromBlocks(blocks) {
  return (Array.isArray(blocks) ? blocks : [])
    .filter(block => block.type === 'text' && clean(block.text))
    .map(block => clean(block.text))
    .join('\n\n');
}

module.exports = {
  normalizeTextForComparison,
  normalizeMathForComparison,
  equivalentContent,
  spatiallyDuplicate,
  reconcileRecognitionBlocks,
  plainTextFromBlocks,
};
