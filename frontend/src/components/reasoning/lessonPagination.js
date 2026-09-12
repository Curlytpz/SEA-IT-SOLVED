export const PAGE_BOTTOM_SAFE_AREA = 48;

export function paginateMeasuredBlocks({
  blocks = [],
  heights = [],
  blockGap = 0,
  capacity,
  shouldKeepWithNext = () => false,
}) {
  if (!Number.isFinite(capacity) || capacity <= 0) {
    return [];
  }

  const pages = [];

  let page = [];
  let used = 0;

  const finishPage = () => {
    if (!page.length) return;

    pages.push(page);
    page = [];
    used = 0;
  };

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];

    const blockHeight = Number.isFinite(heights[index])
      ? Math.max(0, heights[index])
      : 0;

    const nextHeight = Number.isFinite(heights[index + 1])
      ? Math.max(0, heights[index + 1])
      : null;

    /*
     * Space required for this block on the current page.
     */
    const gapBefore = page.length > 0 ? blockGap : 0;
    const required = gapBefore + blockHeight;

    /*
     * If it doesn't fit, close the current page BEFORE
     * adding the block.
     */
    if (
      page.length > 0 &&
      used + required > capacity
    ) {
      finishPage();
    }

    /*
     * Keep headings with the following block only when the
     * heading + following block can actually fit on one page.
     */
    if (
      page.length > 0 &&
      shouldKeepWithNext(block) &&
      nextHeight !== null
    ) {
      const headingGap = blockGap;
      const pairHeight =
        blockHeight +
        headingGap +
        nextHeight;

      const currentGap = page.length > 0
        ? blockGap
        : 0;

      if (
        pairHeight <= capacity &&
        used + currentGap + pairHeight > capacity
      ) {
        finishPage();
      }
    }

    /*
     * Recalculate gap because finishPage() may have just
     * created a new page.
     */
    const finalGap = page.length > 0 ? blockGap : 0;

    page.push(block);
    used += finalGap + blockHeight;

    /*
     * Defensive check:
     *
     * A single block taller than an entire page cannot be solved
     * by ordinary pagination. It needs to be split beforehand.
     *
     * Keep it by itself rather than allowing later blocks to pile
     * underneath it.
     */
    if (blockHeight >= capacity) {
      finishPage();
    }
  }

  finishPage();

  return pages;
}