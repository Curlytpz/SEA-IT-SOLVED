const TIMING_MAPPING_VERSION = 1;
const TIMING_TOLERANCE_MS = 2000;

function timeMs(value) { return new Date(value).getTime(); }

function createTimelineMapper({ recordingStartedAt, recordingCompletedAt, lessonStartedAt, durationMs, pauses }) {
  const recordingStart = timeMs(recordingStartedAt);
  const recordingEnd = timeMs(recordingCompletedAt);
  const lessonStart = timeMs(lessonStartedAt);
  const orderedPauses = [...pauses].sort((a, b) => timeMs(a.pausedAt) - timeMs(b.pausedAt));
  const totalPauseMs = orderedPauses.reduce((sum, pause) => sum + Math.max(0, timeMs(pause.resumedAt) - timeMs(pause.pausedAt)), 0);
  const expectedActiveMs = Math.max(0, recordingEnd - recordingStart - totalPauseMs);
  const driftMs = expectedActiveMs - Number(durationMs);
  const timingWarning = Math.abs(driftMs) > TIMING_TOLERANCE_MS
    ? `Recording timing differs from media duration by ${Math.abs(driftMs)} ms; audio timestamps were preserved.`
    : null;

  function toWallTime(audioOffsetMs) {
    let remaining = audioOffsetMs;
    let cursor = recordingStart;
    for (const pause of orderedPauses) {
      const pausedAt = timeMs(pause.pausedAt);
      const activeSpan = Math.max(0, pausedAt - cursor);
      if (remaining <= activeSpan) return cursor + remaining;
      remaining -= activeSpan;
      cursor = timeMs(pause.resumedAt);
    }
    return cursor + remaining;
  }

  return {
    metadata: {
      mappingVersion: TIMING_MAPPING_VERSION,
      recordingStartedAt,
      lessonStartedAt,
      pauseCount: orderedPauses.length,
      timingWarning,
      timingDriftMs: driftMs,
    },
    mapSegment(segment) {
      return {
        ...segment,
        lessonOffsetStartMs: toWallTime(segment.audioStartMs) - lessonStart,
        lessonOffsetEndMs: toWallTime(segment.audioEndMs) - lessonStart,
      };
    },
  };
}

module.exports = { createTimelineMapper, TIMING_MAPPING_VERSION };
