import assert from 'node:assert/strict';
import {
  getLessonPageSwipeDirection,
  LESSON_PAGE_SWIPE_THRESHOLD,
  resolveLessonGestureAxis,
} from './lessonReaderGesture.js';

assert.equal(resolveLessonGestureAxis(6, 5), null, 'small movement must not lock');
assert.equal(resolveLessonGestureAxis(18, 5), 'horizontal', 'horizontal movement should lock horizontally');
assert.equal(resolveLessonGestureAxis(5, 18), 'vertical', 'vertical movement should lock vertically');
assert.equal(resolveLessonGestureAxis(40, 4, 'vertical'), 'vertical', 'an established vertical lock must remain stable');

assert.equal(getLessonPageSwipeDirection({ startX: 160, startY: 40, endX: 160 - LESSON_PAGE_SWIPE_THRESHOLD, endY: 44, axis: 'horizontal' }), 'next');
assert.equal(getLessonPageSwipeDirection({ startX: 80, startY: 40, endX: 80 + LESSON_PAGE_SWIPE_THRESHOLD, endY: 36, axis: 'horizontal' }), 'previous');
assert.equal(getLessonPageSwipeDirection({ startX: 100, startY: 40, endX: 40, endY: 150, axis: 'vertical' }), null, 'vertical scrolling must never change the page');
assert.equal(getLessonPageSwipeDirection({ startX: 100, startY: 40, endX: 58, endY: 44, axis: 'horizontal' }), null, 'short horizontal movement must not change the page');
assert.equal(getLessonPageSwipeDirection({ startX: 100, startY: 40, endX: 38, endY: 100 }), null, 'diagonal movement must not change the page');

console.log(JSON.stringify({ mobileLessonReaderGestures: 'PASS' }));
