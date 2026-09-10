function timestamp(value) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export function computePausedMs(lesson, now = Date.now()) {
  if (!lesson) return 0;

  if (Array.isArray(lesson.pauseEvents)) {
    const lessonEnd = timestamp(lesson.endedAt);
    return lesson.pauseEvents.reduce((total, event) => {
      const pausedAt = timestamp(event.pausedAt);
      if (pausedAt === null) return total;
      const resumedAt = timestamp(event.resumedAt);
      const pauseEnd = resumedAt ?? lessonEnd ?? now;
      return total + Math.max(0, pauseEnd - pausedAt);
    }, 0);
  }

  return Math.max(0, Number(lesson.totalPausedMs) || 0);
}

export function computeLessonTimers(lesson, now = Date.now()) {
  const pausedMs = computePausedMs(lesson, now);
  const startedAt = timestamp(lesson?.startedAt);
  if (startedAt === null) return { elapsedMs: 0, pausedMs };

  const endedAt = timestamp(lesson.endedAt);
  const totalMs = Math.max(0, (endedAt ?? now) - startedAt);
  return { elapsedMs: Math.max(0, totalMs - pausedMs), pausedMs };
}
