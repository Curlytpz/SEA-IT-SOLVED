const assert = require('assert/strict');
const crypto = require('crypto');
require('../src/config/env');
const pool = require('../src/db/pool');
const contextService = require('../src/services/lesson-context.service');
const { compileTranscriptSegments } = require('../../shared/transcriptContent.cjs');
const { signToken } = require('../src/utils/jwt');

const fixtureSegments = [
  { text: 'Today we will find the critical values', lessonOffsetStartMs: 0, lessonOffsetEndMs: 1800 },
  { text: 'critical values, critical points, or roots.', lessonOffsetStartMs: 1700, lessonOffsetEndMs: 3300 },
  { text: 'First solve f prime of x equals zero.', lessonOffsetStartMs: 3400, lessonOffsetEndMs: 5200 },
  { text: 'Next classify each critical point.', lessonOffsetStartMs: 5300, lessonOffsetEndMs: 6800 },
  { text: 'Use the first derivative test.', lessonOffsetStartMs: 6900, lessonOffsetEndMs: 8200 },
  { text: 'Now consider the second derivative.', lessonOffsetStartMs: 8300, lessonOffsetEndMs: 9700 },
  { text: 'A positive value gives a local minimum.', lessonOffsetStartMs: 9800, lessonOffsetEndMs: 11300 },
  { text: 'A negative value gives a local maximum.', lessonOffsetStartMs: 11400, lessonOffsetEndMs: 12900 },
  { text: 'Finally compare the endpoint values.', lessonOffsetStartMs: 13000, lessonOffsetEndMs: 14500 },
  { text: 'This completes the example.', lessonOffsetStartMs: 14600, lessonOffsetEndMs: 15800 },
];

async function main() {
  const suffix = crypto.randomBytes(6).toString('hex');
  let instructorId;
  let subjectId;
  let sectionId;
  let lessonId;
  let server;
  let browser;
  try {
    ({ rows: [{ id: instructorId }] } = await pool.query(
      `INSERT INTO users(first_name,last_name,email,password_hash,role,status)
       VALUES('Transcript','Verification',$1,'verification-only','INSTRUCTOR','ACTIVE') RETURNING id`,
      [`transcript-verification-${suffix}@hau.edu.ph`]
    ));
    ({ rows: [{ id: subjectId }] } = await pool.query(
      'INSERT INTO subjects(code,name) VALUES($1,$2) RETURNING id',
      [`TV${suffix.slice(0, 8).toUpperCase()}`, `Transcript Verification ${suffix}`]
    ));
    ({ rows: [{ id: sectionId }] } = await pool.query(
      `INSERT INTO sections(subject_id,instructor_id,section_name,join_code)
       VALUES($1,$2,$3,$4) RETURNING id`,
      [subjectId, instructorId, `Transcript Verification ${suffix}`, `TV${suffix.slice(0, 8).toUpperCase()}`]
    ));
    ({ rows: [{ id: lessonId }] } = await pool.query(
      `INSERT INTO lesson_sessions(section_id,instructor_id,title,topic,status,started_at,ended_at)
       VALUES($1,$2,'Transcript grouping verification','Critical points','COMPLETED',NOW()-INTERVAL '20 minutes',NOW()) RETURNING id`,
      [sectionId, instructorId]
    ));
    const { rows: [recording] } = await pool.query(
      `INSERT INTO lesson_audio_recordings(
        lesson_id,section_id,instructor_id,source_key,hardware_mode,storage_provider,storage_key,mime_type,
        file_size,duration_ms,started_at,completed_at,recorded_at
      ) VALUES($1,$2,$3,$4,'BROWSER','LOCAL',$5,'audio/webm',128,16000,NOW()-INTERVAL '20 minutes',NOW(),NOW()) RETURNING id`,
      [lessonId, sectionId, instructorId, `transcript-fixture-${suffix}`, `fixtures/${suffix}.webm`]
    );
    await pool.query(
      `INSERT INTO lesson_transcriptions(
        recording_id,lesson_id,section_id,instructor_id,status,language,transcript_text,segments,provider,provider_version
      ) VALUES($1,$2,$3,$4,'REVIEW_REQUIRED','en',$5,$6,'FIXTURE','1')`,
      [recording.id, lessonId, sectionId, instructorId, fixtureSegments.map(item => item.text).join(' '), JSON.stringify(fixtureSegments)]
    );

    const compiled = compileTranscriptSegments(fixtureSegments);
    assert.equal((compiled.text.match(/critical values/g) || []).length, 1, 'Adjacent STT overlap must be reconciled once.');
    assert.equal(compiled.segments.length, 10, 'Timestamp evidence must remain complete.');
    assert.ok(compiled.text.startsWith('Today we will find the critical values, critical points'));

    const built = await contextService.buildDraft(lessonId, instructorId);
    assert.equal(built.context.chunks.length, 1, 'One transcription must create one logical context source.');
    const transcript = built.context.chunks[0];
    assert.equal(transcript.type, 'SPEECH');
    assert.equal(transcript.source.kind, 'LESSON_TRANSCRIPT');
    assert.equal(transcript.source.segments.length, 10);
    assert.equal(transcript.text, compiled.text);

    const storedSegments = (await pool.query('SELECT segments FROM lesson_transcriptions WHERE lesson_id=$1', [lessonId])).rows[0].segments;
    assert.deepEqual(storedSegments, fixtureSegments, 'Compiling a review source must not rewrite provider segments.');

    const reviewedText = `${compiled.text} Instructor-reviewed closing note.`;
    const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE_PATH || 'playwright');
    server = require('../src/app').listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    const apiBase = `http://127.0.0.1:${server.address().port}`;
    const site = process.env.FRONTEND_URL || 'http://localhost:5173';
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.addInitScript(({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    }, {
      token: signToken({ id: instructorId, role: 'INSTRUCTOR', authVersion: 0 }),
      user: { id: instructorId, role: 'INSTRUCTOR', status: 'ACTIVE', firstName: 'Transcript', lastName: 'Verification' },
    });
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === `/api/audio-recordings/${recording.id}/audio`) {
        await route.fulfill({ status: 200, contentType: 'audio/webm', body: Buffer.from([26, 69, 223, 163]) });
        return;
      }
      const response = await route.fetch({ url: apiBase + url.pathname + url.search });
      await route.fulfill({ response });
    });
    await page.goto(`${site}/instructor/lessons/${lessonId}/review`);
    await page.getByRole('heading', { name: 'Lesson Context Review' }).waitFor();
    await page.locator('.context-source-card').waitFor();
    assert.equal(await page.locator('.context-source-card').count(), 1, 'The review must render one transcript source card.');
    assert.equal(await page.getByText('Lesson Transcript', { exact: true }).count(), 1);
    assert.equal(await page.locator('.context-source-card audio').count(), 1, 'The transcript card must contain one audio preview.');
    const timestampSummary = page.getByText('View timestamped segments (10)', { exact: true });
    await timestampSummary.waitFor();
    const timestampDetails = page.locator('details').filter({ has: timestampSummary });
    assert.equal(await timestampDetails.getAttribute('open'), null, 'Timestamp evidence must be collapsed initially.');
    await timestampSummary.click();
    assert.equal(await timestampDetails.locator('time').count(), 10);
    await page.getByText('Edit Transcript', { exact: true }).click();
    await page.getByLabel('Reviewed transcript').fill(reviewedText);
    await Promise.all([
      page.waitForResponse(response => response.request().method() === 'PUT' && response.url().includes(`/api/lessons/${lessonId}/context/draft`)),
      page.getByRole('button', { name: 'Save Draft' }).click(),
    ]);
    await page.reload();
    await page.getByText('Lesson Transcript', { exact: true }).waitFor();
    assert.equal(await page.locator('.context-source-card').count(), 1);
    await page.getByText('Edit Transcript', { exact: true }).click();
    assert.equal(await page.getByLabel('Reviewed transcript').inputValue(), reviewedText);
    await page.getByRole('button', { name: 'Exclude Lesson Transcript' }).click();
    await Promise.all([
      page.waitForResponse(response => response.request().method() === 'PUT' && response.url().includes(`/api/lessons/${lessonId}/context/draft`)),
      page.getByRole('button', { name: 'Save Draft' }).click(),
    ]);
    await page.reload();
    await page.getByRole('button', { name: 'Include Lesson Transcript' }).waitFor();
    await page.getByRole('button', { name: 'Include Lesson Transcript' }).click();
    await Promise.all([
      page.waitForResponse(response => response.request().method() === 'PUT' && response.url().includes(`/api/lessons/${lessonId}/context/draft`)),
      page.getByRole('button', { name: 'Save Draft' }).click(),
    ]);
    assert.deepEqual(pageErrors, [], `Browser errors: ${pageErrors.join('; ')}`);
    await browser.close();
    browser = null;
    await new Promise(resolve => server.close(resolve));
    server = null;

    let saved = await contextService.saveDraft(lessonId, instructorId, [{
      id: transcript.id, text: reviewedText, math: [], removed: false,
    }]);
    assert.equal(saved.chunks[0].text, reviewedText);
    assert.equal(saved.chunks[0].rawText, compiled.text);

    saved = await contextService.saveDraft(lessonId, instructorId, [{
      id: transcript.id, text: reviewedText, math: [], removed: true,
    }]);
    assert.equal(saved.chunks[0].removed, true, 'The logical transcript exclusion must persist.');
    saved = await contextService.saveDraft(lessonId, instructorId, [{
      id: transcript.id, text: reviewedText, math: [], removed: false,
    }]);
    assert.equal(saved.chunks[0].removed, false, 'The logical transcript can be included again.');

    const approved = await contextService.approve(lessonId, instructorId);
    const reasoning = await contextService.getApprovedForReasoning(lessonId, instructorId);
    assert.equal(reasoning.chunks.length, 1);
    assert.equal(reasoning.chunks[0].text, reviewedText, 'Approved reasoning must receive the complete reviewed transcript.');
    const frozenBefore = await pool.query(
      'SELECT reviewed_text,raw_text,source,removed FROM lesson_context_chunks WHERE context_version_id=$1',
      [approved.id]
    );

    const reopened = await contextService.reopen(lessonId, instructorId);
    await contextService.saveDraft(lessonId, instructorId, [{
      id: reopened.chunks[0].id, text: `${reviewedText} New draft only.`, math: [], removed: false,
    }]);
    const frozenAfter = await pool.query(
      'SELECT reviewed_text,raw_text,source,removed FROM lesson_context_chunks WHERE context_version_id=$1',
      [approved.id]
    );
    assert.deepEqual(frozenAfter.rows, frozenBefore.rows, 'Editing a reopened draft must not mutate approved history.');

    const { buildTranscriptReviewSources } = await import('../../frontend/src/utils/transcriptReview.js');
    const legacyChunks = fixtureSegments.map((segment, index) => ({
      id: `legacy-${index}`,
      type: 'SPEECH',
      lessonOffsetMs: segment.lessonOffsetStartMs,
      source: { recordingId: recording.id, transcriptionSegmentIndex: index, ...segment },
      rawText: segment.text,
      text: segment.text,
      math: [],
      removed: false,
      edited: false,
    }));
    const groupedLegacy = buildTranscriptReviewSources([
      ...legacyChunks,
      { id: 'whiteboard-1', type: 'WHITEBOARD', source: { pageNumber: 1 }, text: 'Board source', rawText: 'Board source', math: [], removed: false },
    ]);
    assert.equal(groupedLegacy.filter(item => item.type === 'SPEECH').length, 1, 'Existing per-segment contexts must render as one transcript card.');
    assert.equal(groupedLegacy.find(item => item.type === 'SPEECH').transcriptSegments.length, 10);
    assert.equal(groupedLegacy.filter(item => item.type === 'WHITEBOARD').length, 1, 'Other source types must not be merged.');

    console.log('PASS one transcription creates one logical context source');
    console.log('PASS one-card UI, one audio preview, transcript editor, and collapsed timestamp evidence');
    console.log('PASS adjacent STT overlap is reconciled conservatively');
    console.log('PASS all 10 timestamped segments remain available as evidence');
    console.log('PASS transcript edit and group include/exclude persist');
    console.log('PASS full reviewed transcript reaches approved reasoning context');
    console.log('PASS existing per-segment contexts group at presentation time');
    console.log('PASS approved history remains immutable after reopen');
    console.log('PASS non-transcript sources remain independent');
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
    if (lessonId) await pool.query('DELETE FROM lesson_sessions WHERE id=$1', [lessonId]);
    if (sectionId) await pool.query('DELETE FROM sections WHERE id=$1', [sectionId]);
    if (subjectId) await pool.query('DELETE FROM subjects WHERE id=$1', [subjectId]);
    if (instructorId) await pool.query('DELETE FROM users WHERE id=$1', [instructorId]);
    await pool.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
