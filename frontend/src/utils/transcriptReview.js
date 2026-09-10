import '../../../shared/transcriptContent.cjs';

const transcriptContent = globalThis[Symbol.for('sea-it-solved.transcriptContent')];
const { compileTranscriptSegments } = transcriptContent;

function transcriptKey(chunk) {
  return String(chunk?.source?.recordingId || chunk?.source?.transcriptionId || 'lesson-transcript');
}

function rawSegmentsForChunk(chunk) {
  if (Array.isArray(chunk?.source?.segments) && chunk.source.segments.length) {
    return chunk.source.segments.map((segment, index) => ({ ...segment, originalIndex: segment.transcriptionSegmentIndex ?? segment.originalIndex ?? index }));
  }
  return [{
    text: chunk?.rawText || chunk?.text || '',
    lessonOffsetStartMs: chunk?.source?.lessonOffsetStartMs ?? chunk?.lessonOffsetMs,
    lessonOffsetEndMs: chunk?.source?.lessonOffsetEndMs ?? chunk?.lessonOffsetMs,
    originalIndex: chunk?.source?.transcriptionSegmentIndex ?? 0,
    uncertain: Boolean(chunk?.uncertain),
  }];
}

export function buildTranscriptReviewSources(chunks) {
  const values = Array.isArray(chunks) ? chunks : [];
  const groups = new Map();
  values.filter(chunk => chunk.type === 'SPEECH').forEach(chunk => {
    const key = transcriptKey(chunk);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(chunk);
  });
  const emitted = new Set();
  const results = [];
  values.forEach(chunk => {
    if (chunk.type !== 'SPEECH') { results.push(chunk); return; }
    const key = transcriptKey(chunk);
    if (emitted.has(key)) return;
    emitted.add(key);
    const members = groups.get(key).slice().sort((a, b) =>
      Number(a.lessonOffsetMs ?? a.source?.lessonOffsetStartMs ?? 0) - Number(b.lessonOffsetMs ?? b.source?.lessonOffsetStartMs ?? 0)
    );
    const raw = compileTranscriptSegments(members.flatMap(rawSegmentsForChunk));
    const reviewed = compileTranscriptSegments(members.map((member, index) => ({
      text: member.text,
      lessonOffsetStartMs: member.lessonOffsetMs ?? member.source?.lessonOffsetStartMs ?? index,
      originalIndex: index,
    })));
    const first = members[0];
    const fullyRemoved = members.every(member => member.removed);
    const partiallyRemoved = !fullyRemoved && members.some(member => member.removed);
    results.push({
      ...first,
      id: `transcript:${key}`,
      source: { ...first.source, kind: 'LESSON_TRANSCRIPT', recordingId: first.source?.recordingId, segmentCount: raw.segments.length },
      rawText: raw.text,
      text: reviewed.text || raw.text,
      math: [],
      uncertain: members.some(member => member.uncertain),
      removed: fullyRemoved,
      partiallyRemoved,
      edited: members.some(member => member.edited),
      isTranscriptGroup: true,
      memberIds: members.map(member => member.id),
      transcriptSegments: raw.segments,
    });
  });
  return results;
}

export function patchTranscriptReviewSource(chunks, source, patch) {
  if (!source?.isTranscriptGroup) return chunks.map(chunk => chunk.id === source?.id ? { ...chunk, ...patch } : chunk);
  const ids = new Set(source.memberIds || []);
  return chunks.map(chunk => {
    if (!ids.has(chunk.id)) return chunk;
    const next = { ...chunk };
    if (Object.prototype.hasOwnProperty.call(patch, 'removed')) next.removed = patch.removed;
    if (Object.prototype.hasOwnProperty.call(patch, 'text')) {
      next.text = chunk.id === source.memberIds[0] ? patch.text : '';
    }
    return next;
  });
}

export function formatTranscriptTime(value) {
  const seconds = Math.max(0, Math.floor(Number(value || 0) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
