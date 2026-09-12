const pool = require('../db/pool');
const AppError = require('../utils/AppError');
const { compileTranscriptSegments } = require('../../../shared/transcriptContent.cjs');

function normalizeForDedup(text, math) {
  return `${text || ''} ${(math || []).map(item => typeof item === 'string' ? item : item.latex || '').join(' ')}`
    .normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function humanText(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(humanText).filter(Boolean).join('\n');
  if (!value || typeof value !== 'object') return '';
  for (const key of ['text', 'plainText', 'content', 'value', 'label']) {
    const result = humanText(value[key]);
    if (result) return result;
  }
  return '';
}

function classifyContentType(text, math) {
  const value = humanText(text).toLocaleLowerCase();
  if (/\b(example|for example|e\.g\.|illustration)\b/.test(value)) return 'EXAMPLE';
  if (/\b(problem|exercise|solve|evaluate|calculate|find|determine|given)\b/.test(value) || /\?\s*$/.test(value)) return 'PROBLEM';
  if (/\b(definition|defined as|is called|refers to)\b/.test(value)) return 'DEFINITION';
  if (/\b(explain|because|therefore|reason|concept|means that)\b/.test(value)) return 'EXPLANATION';
  if ((Array.isArray(math) && math.length) && value.length < 120) return 'FORMULA';
  return 'OTHER';
}

function normalizeMath(value) {
  const items = Array.isArray(value) ? value : value == null ? [] : [value];
  return [...new Set(items.flatMap(item => {
    if (typeof item === 'string' || typeof item === 'number') return [String(item).trim()];
    if (Array.isArray(item)) return normalizeMath(item);
    if (!item || typeof item !== 'object') return [];
    if (typeof item.latex === 'string') return [item.latex.trim()];
    if (item.type === 'math') return normalizeMath(item.value || item.content || item.text);
    return normalizeMath(item.math || item.mathExpressions || item.blocks);
  }).filter(Boolean))];
}

function safeVersion(version, chunks = []) {
  if (!version) return null;
  return {
    id: version.id,
    lessonId: version.lesson_id,
    versionNumber: version.version_number,
    status: version.status,
    approvedAt: version.approved_at,
    approvedBy: version.approved_by,
    updatedAt: version.updated_at,
    chunks: chunks.map(row => ({
      id: row.id,
      type: row.chunk_type,
      order: row.chunk_order,
      lessonOffsetMs: row.lesson_offset_ms === null ? null : Number(row.lesson_offset_ms),
      source: row.source,
      rawText: humanText(row.raw_text),
      rawMath: normalizeMath(row.raw_math),
      text: humanText(row.reviewed_text),
      math: normalizeMath(row.reviewed_math),
      uncertain: row.uncertain,
      removed: row.removed,
      edited: row.edited,
      contentType: row.content_type || 'OTHER',
    })),
  };
}

async function ownedLesson(lessonId, instructorId, client = pool, { forUpdate = false } = {}) {
  const { rows } = await client.query(
    `SELECT id,section_id,instructor_id,status,title,topic,started_at,ended_at FROM lesson_sessions WHERE id=$1${forUpdate ? ' FOR UPDATE' : ''}`,
    [lessonId]
  );
  if (!rows.length || rows[0].instructor_id !== instructorId) throw new AppError('Lesson not found or access denied.', 404);
  return rows[0];
}

async function sourceRows(lessonId, instructorId, client = pool) {
  // A transaction client must execute queries sequentially. Parallel client.query()
  // calls are deprecated by pg and will fail in pg 9.
  const recognition = await client.query('SELECT * FROM lesson_recognitions WHERE lesson_id=$1 AND instructor_id=$2', [lessonId, instructorId]);
  const transcription = await client.query('SELECT * FROM lesson_transcriptions WHERE lesson_id=$1 AND instructor_id=$2', [lessonId, instructorId]);
  const materials = await client.query(
    `SELECT material.*,result.plain_text,result.math_expressions,result.pages
     FROM lesson_materials material LEFT JOIN lesson_material_results result ON result.material_id=material.id
     WHERE material.lesson_id=$1 AND material.instructor_id=$2 ORDER BY material.uploaded_at,material.id`, [lessonId, instructorId]
  );
  const captures = await client.query('SELECT id,captured_at FROM lesson_captures WHERE lesson_id=$1 AND instructor_id=$2 ORDER BY captured_at,id', [lessonId, instructorId]);
  return {
    recognition: recognition.rows[0] || null,
    transcription: transcription.rows[0] || null,
    materials: materials.rows,
    captures: captures.rows,
  };
}

function buildChunks(lesson, sources) {
  const timed = [];
  const supporting = [];
  const seenWhiteboards = new Set();
  const pages = sources.recognition?.pages || [];
  pages.forEach((page, index) => {
    const capture = sources.captures[index];
    const math = (page.blocks || []).filter(block => block.type === 'math' && block.latex).map(block => block.latex);
    const fingerprint = normalizeForDedup(page.plainText, math);
    const exactDuplicate = Boolean(fingerprint && seenWhiteboards.has(fingerprint));
    if (fingerprint) seenWhiteboards.add(fingerprint);
    const capturedAt = page.capturedAt || capture?.captured_at;
    timed.push({
      type: 'WHITEBOARD',
      offset: capturedAt && lesson.started_at ? Math.max(0, new Date(capturedAt) - new Date(lesson.started_at)) : null,
      source: { captureId: page.captureId || capture?.id, pageNumber: page.pageNumber || index + 1, capturedAt },
      text: humanText(page.plainText),
      math,
      uncertain: (page.blocks || []).some(block => block.uncertain) || (page.warnings || []).length > 0,
      removed: exactDuplicate,
    });
  });

  const segments = compileTranscriptSegments((sources.transcription?.segments || []).map((segment, index) => ({
    ...segment,
    text: humanText(segment.text),
    originalIndex: index,
  })));
  if (segments.segments.length) {
    const firstSegment = segments.segments[0];
    timed.push({
      type: 'SPEECH',
      offset: firstSegment.lessonOffsetStartMs,
      source: {
        kind: 'LESSON_TRANSCRIPT',
        transcriptionId: sources.transcription.id,
        recordingId: sources.transcription.recording_id,
        segmentCount: segments.segments.length,
        segments: segments.segments.map(segment => ({
          transcriptionSegmentIndex: segment.originalIndex,
          lessonOffsetStartMs: segment.lessonOffsetStartMs,
          lessonOffsetEndMs: segment.lessonOffsetEndMs,
          text: segment.text,
          uncertain: Boolean(segment.uncertain),
        })),
      },
      text: segments.text || humanText(sources.transcription.transcript_text),
      math: [],
      uncertain: segments.segments.some(segment => segment.uncertain),
      removed: false,
    });
  }

  sources.materials.filter(material => ['REVIEW_REQUIRED', 'APPROVED'].includes(material.status)).forEach(material => {
    const pagesForMaterial = material.pages?.length ? material.pages : [{
      pageNumber: 1, text: material.plain_text || '', mathExpressions: material.math_expressions || [], uncertain: false,
    }];
    pagesForMaterial.forEach(page => supporting.push({
      type: material.material_type === 'PDF' ? 'PDF' : 'UPLOADED_IMAGE',
      offset: null,
      source: {
        materialId: material.id,
        filename: material.original_filename,
        pdfPageNumber: material.material_type === 'PDF' ? page.pageNumber : null,
      },
      text: humanText(page.text) || humanText(material.plain_text),
      math: normalizeMath(page.mathExpressions?.length ? page.mathExpressions : material.math_expressions),
      uncertain: Boolean(page.uncertain),
      removed: false,
    }));
  });

  timed.sort((a, b) => {
    if (a.offset === null && b.offset !== null) return 1;
    if (b.offset === null && a.offset !== null) return -1;
    return (a.offset || 0) - (b.offset || 0) || (a.type === 'WHITEBOARD' ? -1 : 1);
  });
  return [...timed, ...supporting];
}

async function buildDraft(lessonId, instructorId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize first-draft construction for this lesson. The partial unique
    // index remains the final invariant, while the row lock lets a concurrent
    // caller observe and reuse the draft created by the winner.
    const lesson = await ownedLesson(lessonId, instructorId, client, { forUpdate: true });
    if (lesson.status !== 'COMPLETED') throw new AppError('Lesson context is available after the lesson is completed.', 409);
    const existing = await client.query(
      `SELECT * FROM lesson_context_versions WHERE lesson_id=$1 AND instructor_id=$2 AND status='DRAFT' FOR UPDATE`,
      [lessonId, instructorId]
    );
    const sources = await sourceRows(lessonId, instructorId, client);
    const running = [sources.recognition?.status, sources.transcription?.status, ...sources.materials.map(item => item.status)]
      .some(status => ['PENDING', 'PROCESSING', 'UPLOADED'].includes(status));
    if (running) throw new AppError('Lesson sources are still processing. Review will be ready when processing finishes.', 409);
    let chunks = buildChunks(lesson, sources);
    if (existing.rows.length) {
      const current = await client.query('SELECT * FROM lesson_context_chunks WHERE context_version_id=$1 ORDER BY chunk_order', [existing.rows[0].id]);
      let currentRows = current.rows;
      const generatedTranscript = chunks.find(chunk => chunk.type === 'SPEECH' && chunk.source?.kind === 'LESSON_TRANSCRIPT');
      if (generatedTranscript) {
        const legacyTranscriptRows = currentRows.filter(row => row.chunk_type === 'SPEECH' && row.source?.kind !== 'LESSON_TRANSCRIPT'
          && (!generatedTranscript.source.recordingId || row.source?.recordingId === generatedTranscript.source.recordingId));
        if (legacyTranscriptRows.length && legacyTranscriptRows.every(row => !row.edited)) {
          await client.query('DELETE FROM lesson_context_chunks WHERE id = ANY($1::uuid[])', [legacyTranscriptRows.map(row => row.id)]);
          const legacyIds = new Set(legacyTranscriptRows.map(row => row.id));
          currentRows = currentRows.filter(row => !legacyIds.has(row.id));
        } else if (legacyTranscriptRows.length) {
          chunks = chunks.filter(chunk => chunk !== generatedTranscript);
        }
      }
      let nextOrder = currentRows.reduce((maximum, row) => Math.max(maximum, row.chunk_order), -1) + 1;
      for (const chunk of chunks) {
        const matched = currentRows.find(row => row.chunk_type === chunk.type && (
          JSON.stringify(row.source) === JSON.stringify(chunk.source)
          || (chunk.type === 'SPEECH' && row.source?.kind === 'LESSON_TRANSCRIPT'
            && row.source?.recordingId === chunk.source?.recordingId)
        ));
        if (!matched) {
          await client.query(
            `INSERT INTO lesson_context_chunks(context_version_id,lesson_id,chunk_type,chunk_order,lesson_offset_ms,
              source,raw_text,raw_math,reviewed_text,reviewed_math,uncertain,removed,edited)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$7,$8,$9,$10,FALSE)`,
            [existing.rows[0].id,lessonId,chunk.type,nextOrder++,chunk.offset,JSON.stringify(chunk.source),
             chunk.text,JSON.stringify(chunk.math),chunk.uncertain,chunk.removed]
          );
        } else if (!matched.edited) {
          await client.query(
            `UPDATE lesson_context_chunks SET lesson_offset_ms=$2,source=$3,raw_text=$4,raw_math=$5,reviewed_text=$4,
              reviewed_math=$5,uncertain=$6,removed=$7,updated_at=NOW() WHERE id=$1`,
            [matched.id,chunk.offset,JSON.stringify(chunk.source),chunk.text,JSON.stringify(chunk.math),chunk.uncertain,chunk.removed]
          );
        }
      }
      const refreshed = await client.query('SELECT * FROM lesson_context_chunks WHERE context_version_id=$1 ORDER BY chunk_order', [existing.rows[0].id]);
      await client.query('COMMIT');
      return { context: safeVersion(existing.rows[0], refreshed.rows), created: false };
    }
    if (!chunks.length) throw new AppError('No processed lesson sources are available for review.', 409);
    const versionResult = await client.query(
      `INSERT INTO lesson_context_versions(lesson_id,section_id,instructor_id,version_number,status)
       VALUES($1,$2,$3,COALESCE((SELECT MAX(version_number)+1 FROM lesson_context_versions WHERE lesson_id=$1),1),'DRAFT')
       RETURNING *`, [lessonId, lesson.section_id, instructorId]
    );
    const version = versionResult.rows[0];
    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      await client.query(
        `INSERT INTO lesson_context_chunks(context_version_id,lesson_id,chunk_type,chunk_order,lesson_offset_ms,
          source,raw_text,raw_math,reviewed_text,reviewed_math,uncertain,removed,edited)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$7,$8,$9,$10,FALSE)`,
        [version.id, lessonId, chunk.type, index, chunk.offset, JSON.stringify(chunk.source), chunk.text,
         JSON.stringify(chunk.math), chunk.uncertain, chunk.removed]
      );
    }
    const inserted = await client.query('SELECT * FROM lesson_context_chunks WHERE context_version_id=$1 ORDER BY chunk_order', [version.id]);
    await client.query('COMMIT');
    return { context: safeVersion(version, inserted.rows), created: true };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

async function tryBuildDraft(lessonId, instructorId) {
  try { return await buildDraft(lessonId, instructorId); }
  catch (error) {
    if (error.statusCode === 409) return null;
    throw error;
  }
}

async function get(lessonId, instructorId) {
  await ownedLesson(lessonId, instructorId);
  const { rows } = await pool.query(
    `SELECT * FROM lesson_context_versions WHERE lesson_id=$1 AND instructor_id=$2
     ORDER BY CASE status WHEN 'DRAFT' THEN 0 WHEN 'APPROVED' THEN 1 ELSE 2 END,version_number DESC LIMIT 1`,
    [lessonId, instructorId]
  );
  if (!rows.length) return { context: null };
  const chunks = await pool.query('SELECT * FROM lesson_context_chunks WHERE context_version_id=$1 ORDER BY chunk_order', [rows[0].id]);
  return { context: safeVersion(rows[0], chunks.rows) };
}

async function saveDraft(lessonId, instructorId, updates) {
  if (!Array.isArray(updates) || updates.length > 1000) throw new AppError('Invalid context updates.', 400);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ownedLesson(lessonId, instructorId, client);
    const version = await client.query(
      `SELECT * FROM lesson_context_versions WHERE lesson_id=$1 AND instructor_id=$2 AND status='DRAFT' FOR UPDATE`,
      [lessonId, instructorId]
    );
    if (!version.rows.length) throw new AppError('No lesson-context draft is available.', 409);
    for (const update of updates) {
      const text = String(update.text ?? '').slice(0, 100000);
      const math = Array.isArray(update.math) ? update.math.slice(0, 200).map(value => String(value).slice(0, 10000)) : [];
      await client.query(
        `UPDATE lesson_context_chunks SET reviewed_text=$4,reviewed_math=$5,removed=$6,
          edited=(raw_text<>$4 OR raw_math<>$5::jsonb OR removed<>$6),updated_at=NOW()
         WHERE id=$1 AND context_version_id=$2 AND lesson_id=$3`,
        [update.id, version.rows[0].id, lessonId, text, JSON.stringify(math), Boolean(update.removed)]
      );
    }
    await client.query('UPDATE lesson_context_versions SET updated_at=NOW() WHERE id=$1', [version.rows[0].id]);
    const chunks = await client.query('SELECT * FROM lesson_context_chunks WHERE context_version_id=$1 ORDER BY chunk_order', [version.rows[0].id]);
    await client.query('COMMIT');
    return safeVersion(version.rows[0], chunks.rows);
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

async function approve(lessonId, instructorId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ownedLesson(lessonId, instructorId, client);
    const draft = await client.query(
      `SELECT * FROM lesson_context_versions WHERE lesson_id=$1 AND instructor_id=$2 AND status='DRAFT' FOR UPDATE`,
      [lessonId, instructorId]
    );
    if (!draft.rows.length) throw new AppError('No lesson-context draft is available to approve.', 409);
    const usable = await client.query(
      'SELECT COUNT(*)::int AS count FROM lesson_context_chunks WHERE context_version_id=$1 AND removed=FALSE AND (reviewed_text<>\'\' OR jsonb_array_length(reviewed_math)>0)',
      [draft.rows[0].id]
    );
    if (!usable.rows[0].count) throw new AppError('Keep at least one reviewed context chunk before approval.', 409);
    const reviewedChunks = await client.query('SELECT id,reviewed_text,reviewed_math FROM lesson_context_chunks WHERE context_version_id=$1 AND removed=FALSE', [draft.rows[0].id]);
    for (const chunk of reviewedChunks.rows) {
      await client.query('UPDATE lesson_context_chunks SET content_type=$2,updated_at=NOW() WHERE id=$1', [chunk.id, classifyContentType(chunk.reviewed_text, chunk.reviewed_math)]);
    }
    await client.query(
      `UPDATE lesson_context_versions SET status='ARCHIVED',updated_at=NOW()
       WHERE lesson_id=$1 AND status='APPROVED'`, [lessonId]
    );
    const approved = await client.query(
      `UPDATE lesson_context_versions SET status='APPROVED',approved_at=NOW(),approved_by=$2,updated_at=NOW()
       WHERE id=$1 RETURNING *`, [draft.rows[0].id, instructorId]
    );
    await client.query(`UPDATE lesson_recognitions SET status='APPROVED',updated_at=NOW() WHERE lesson_id=$1 AND status='REVIEW_REQUIRED'`, [lessonId]);
    await client.query(`UPDATE lesson_transcriptions SET status='APPROVED',updated_at=NOW() WHERE lesson_id=$1 AND status='REVIEW_REQUIRED'`, [lessonId]);
    await client.query(`UPDATE lesson_materials SET status='APPROVED',updated_at=NOW() WHERE lesson_id=$1 AND status='REVIEW_REQUIRED'`, [lessonId]);
    await client.query(`UPDATE generated_lesson_materials SET outdated=TRUE,updated_at=NOW() WHERE lesson_id=$1 AND context_version_id<>$2`, [lessonId, approved.rows[0].id]);
    await client.query(`UPDATE lesson_quizzes SET outdated=TRUE,updated_at=NOW() WHERE lesson_id=$1 AND context_version_id<>$2`, [lessonId, approved.rows[0].id]);
    const chunks = await client.query('SELECT * FROM lesson_context_chunks WHERE context_version_id=$1 ORDER BY chunk_order', [approved.rows[0].id]);
    await client.query('COMMIT');
    return safeVersion(approved.rows[0], chunks.rows);
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

async function reopen(lessonId, instructorId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const lesson = await ownedLesson(lessonId, instructorId, client);
    const draft = await client.query(`SELECT id FROM lesson_context_versions WHERE lesson_id=$1 AND status='DRAFT'`, [lessonId]);
    if (draft.rows.length) throw new AppError('A review draft is already open.', 409);
    const approved = await client.query(
      `SELECT * FROM lesson_context_versions WHERE lesson_id=$1 AND instructor_id=$2 AND status='APPROVED' FOR UPDATE`,
      [lessonId, instructorId]
    );
    if (!approved.rows.length) throw new AppError('There is no approved context to reopen.', 409);
    const created = await client.query(
      `INSERT INTO lesson_context_versions(lesson_id,section_id,instructor_id,version_number,status)
       VALUES($1,$2,$3,(SELECT MAX(version_number)+1 FROM lesson_context_versions WHERE lesson_id=$1),'DRAFT') RETURNING *`,
      [lessonId, lesson.section_id, instructorId]
    );
    await client.query(
      `INSERT INTO lesson_context_chunks(context_version_id,lesson_id,chunk_type,chunk_order,lesson_offset_ms,source,
        raw_text,raw_math,reviewed_text,reviewed_math,uncertain,removed,edited,content_type)
       SELECT $1,lesson_id,chunk_type,chunk_order,lesson_offset_ms,source,raw_text,raw_math,
        reviewed_text,reviewed_math,uncertain,removed,edited,content_type FROM lesson_context_chunks WHERE context_version_id=$2`,
      [created.rows[0].id, approved.rows[0].id]
    );
    const chunks = await client.query('SELECT * FROM lesson_context_chunks WHERE context_version_id=$1 ORDER BY chunk_order', [created.rows[0].id]);
    await client.query('COMMIT');
    return safeVersion(created.rows[0], chunks.rows);
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

async function getApprovedForReasoning(lessonId, instructorId, missingMessage = 'Approve the lesson context before generating materials.') {
  await ownedLesson(lessonId, instructorId);
  const version = await pool.query(
    `SELECT * FROM lesson_context_versions WHERE lesson_id=$1 AND instructor_id=$2 AND status='APPROVED'`, [lessonId, instructorId]
  );
  if (!version.rows.length) throw new AppError(missingMessage, 409);
  const chunks = await pool.query(
    `SELECT * FROM lesson_context_chunks WHERE context_version_id=$1 AND removed=FALSE
     ORDER BY chunk_order`, [version.rows[0].id]
  );
  return safeVersion(version.rows[0], chunks.rows);
}

async function getVersionForReasoning(lessonId, instructorId, contextVersionId) {
  await ownedLesson(lessonId, instructorId);
  const version = await pool.query(
    `SELECT * FROM lesson_context_versions
     WHERE id=$1 AND lesson_id=$2 AND instructor_id=$3 AND status IN ('APPROVED','ARCHIVED')`,
    [contextVersionId, lessonId, instructorId]
  );
  if (!version.rows.length) throw new AppError('The source context for this generated lesson is unavailable.', 409);
  const chunks = await pool.query(
    `SELECT * FROM lesson_context_chunks WHERE context_version_id=$1 AND removed=FALSE
     ORDER BY chunk_order`, [contextVersionId]
  );
  return safeVersion(version.rows[0], chunks.rows);
}

module.exports = { buildDraft, tryBuildDraft, get, saveDraft, approve, reopen, getApprovedForReasoning, getVersionForReasoning };
