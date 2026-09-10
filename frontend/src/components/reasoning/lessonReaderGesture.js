export const LESSON_PAGE_SWIPE_THRESHOLD = 56;
export const LESSON_PAGE_DIRECTION_RATIO = 1.35;
export const LESSON_PAGE_GESTURE_LOCK_THRESHOLD = 10;

export function resolveLessonGestureAxis(deltaX, deltaY, currentAxis = null) {
  if (currentAxis) return currentAxis;
  const horizontalDistance = Math.abs(deltaX);
  const verticalDistance = Math.abs(deltaY);
  if (Math.max(horizontalDistance, verticalDistance) < LESSON_PAGE_GESTURE_LOCK_THRESHOLD) return null;
  if (horizontalDistance >= verticalDistance * 1.15) return 'horizontal';
  if (verticalDistance >= horizontalDistance * 1.15) return 'vertical';
  return null;
}

export function getLessonPageSwipeDirection({ startX, startY, endX, endY, axis = null }) {
  if (axis === 'vertical') return null;
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const horizontalDistance = Math.abs(deltaX);
  const verticalDistance = Math.abs(deltaY);
  if (horizontalDistance < LESSON_PAGE_SWIPE_THRESHOLD) return null;
  if (horizontalDistance < verticalDistance * LESSON_PAGE_DIRECTION_RATIO) return null;
  return deltaX < 0 ? 'next' : 'previous';
}
