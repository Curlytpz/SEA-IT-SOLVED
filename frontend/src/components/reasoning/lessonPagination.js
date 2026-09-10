export const PAGE_BOTTOM_SAFE_AREA = 48;

export function paginateMeasuredBlocks({
  blocks = [],
  heights = [],
  blockGap = 0,
  capacity,
  shouldKeepWithNext = () => false,
}) {
  if (!Number.isFinite(capacity) || capacity <= 0) return [];
  const pages = [];
  let page = [];
  let used = 0;

  blocks.forEach((block, index) => {
    const blockHeight = Number.isFinite(heights[index]) ? Math.max(0, heights[index]) : 0;
    const gap = page.length ? blockGap : 0;
    const nextHeight = heights[index + 1];
    const keepWithNext = shouldKeepWithNext(block)
      && Number.isFinite(nextHeight)
      && blockHeight + blockGap + nextHeight <= capacity;
    const wouldOverflow = used + gap + blockHeight > capacity;
    const wouldOrphanNext = keepWithNext
      && used + gap + blockHeight + blockGap + nextHeight > capacity;

    if (page.length && (wouldOverflow || wouldOrphanNext)) {
      pages.push(page);
      page = [];
      used = 0;
    }

    page.push(block);
    used += blockHeight + (page.length > 1 ? blockGap : 0);
  });

  if (page.length) pages.push(page);
  return pages;
}
