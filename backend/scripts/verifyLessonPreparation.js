const assert = require('node:assert/strict');
const crypto = require('node:crypto');
require('../src/config/env');
const pool = require('../src/db/pool');
const calibrationService = require('../src/services/calibration.service');
const hardwareSettingsService = require('../src/services/hardware-settings.service');
const lessonService = require('../src/services/lesson.service');
const { signToken } = require('../src/utils/jwt');

async function lessonRow(id) {
  return (await pool.query('SELECT status,started_at FROM lesson_sessions WHERE id=$1', [id])).rows[0];
}

async function main() {
  const suffix = crypto.randomBytes(6).toString('hex');
  const ids = { sections: [], lessons: [] };
  let server;
  let browser;
  let page;
  const browserErrors = [];

  try {
    ids.instructor = (await pool.query(
      "INSERT INTO users(first_name,last_name,email,password_hash,role,status) VALUES('Session','Verification',$1,'verification-only','INSTRUCTOR','ACTIVE') RETURNING id",
      [`session-${suffix}@hau.edu.ph`]
    )).rows[0].id;
    ids.subject = (await pool.query(
      "INSERT INTO subjects(code,name) VALUES($1,'Lesson session verification') RETURNING id",
      [`LS${suffix}`]
    )).rows[0].id;

    for (const label of ['Start', 'Back', 'Failure', 'Atomic']) {
      const section = (await pool.query(
        'INSERT INTO sections(subject_id,instructor_id,section_name,join_code) VALUES($1,$2,$3,$4) RETURNING id',
        [ids.subject, ids.instructor, `Session ${label}`, `${label.slice(0,2)}${suffix.slice(0,8)}`.toUpperCase()]
      )).rows[0].id;
      ids.sections.push(section);
      ids.lessons.push((await pool.query(
        "INSERT INTO lesson_sessions(section_id,instructor_id,title,topic,status) VALUES($1,$2,$3,'Preflight verification','CREATED') RETURNING id",
        [section, ids.instructor, `${label} lesson`]
      )).rows[0].id);
    }

    await hardwareSettingsService.updateSettings(ids.instructor, {
      hardwareMode: 'SIMULATED',
      cameraSourceKey: 'mock-whiteboard-camera',
      microphoneMode: 'SIMULATED',
      microphoneSourceKey: 'mock-lapel-microphone',
      autoCaptureEnabled: false,
      lightingHardwareMode: 'SIMULATED',
      lightingMode: 'AUTO',
    });
    await calibrationService.saveCalibration(ids.instructor, {
      sourceKey: 'mock-whiteboard-camera',
      hardwareMode: 'SIMULATED',
      sourceWidth: 1280,
      sourceHeight: 720,
      points: {
        topLeft: { x: 0.05, y: 0.05 },
        topRight: { x: 0.95, y: 0.05 },
        bottomRight: { x: 0.95, y: 0.95 },
        bottomLeft: { x: 0.05, y: 0.95 },
      },
    });

    const atomic = ids.lessons[3];
    const firstAtomicStart = await lessonService.startLesson(atomic, ids.instructor);
    assert.equal(firstAtomicStart.status, 'ACTIVE');
    await assert.rejects(() => lessonService.startLesson(atomic, ids.instructor), error => error.statusCode === 409);
    assert((await lessonRow(atomic)).started_at, 'Atomic start must create started_at once.');

    const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE_PATH || 'playwright');
    server = require('../src/app').listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    const apiBase = `http://127.0.0.1:${server.address().port}`;
    const site = process.env.FRONTEND_URL || 'http://localhost:5173';
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', error => browserErrors.push(error.message));
    let startRequests = 0;
    page.on('request', request => {
      if (request.method() === 'PATCH' && /\/api\/lessons\/[^/]+\/start$/.test(new URL(request.url()).pathname)) startRequests += 1;
    });
    await page.addInitScript(({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    }, {
      token: signToken({ id: ids.instructor, role: 'INSTRUCTOR', authVersion: 0 }),
      user: { id: ids.instructor, role: 'INSTRUCTOR', status: 'ACTIVE', firstName: 'Session', lastName: 'Verification' },
    });
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      try {
        const response = await route.fetch({ url: apiBase + url.pathname + url.search });
        await route.fulfill({ response });
      } catch {
        await route.abort();
      }
    });

    const startLesson = ids.lessons[0];
    await page.goto(`${site}/instructor/sections/${ids.sections[0]}?tab=lessons`);
    await page.getByRole('button', { name: 'Prepare Session', exact: true }).waitFor();
    assert.equal((await lessonRow(startLesson)).status, 'CREATED');
    await page.getByRole('button', { name: 'Prepare Session', exact: true }).click();
    await page.getByText('READY TO START', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Start Recording Session', exact: true }).waitFor();
    await page.getByText('Monitoring only. No lesson audio is being recorded.', { exact: true }).waitFor();
    assert.equal(startRequests, 0, 'Opening preparation must not call the start endpoint.');
    assert.deepEqual(await lessonRow(startLesson), { status: 'CREATED', started_at: null });
    assert.equal(Number((await pool.query('SELECT COUNT(*) count FROM lesson_audio_recordings WHERE lesson_id=$1', [startLesson])).rows[0].count), 0);
    assert(await page.getByRole('button', { name: 'Capture Whiteboard', exact: true }).isDisabled());

    await page.reload();
    await page.getByText('READY TO START', { exact: true }).waitFor();
    assert.equal(startRequests, 0, 'Refreshing preparation must not start the lesson.');
    assert.deepEqual(await lessonRow(startLesson), { status: 'CREATED', started_at: null });

    await page.getByRole('button', { name: 'Start Camera', exact: true }).click();
    await page.getByText('Preview ready · SIMULATED', { exact: true }).waitFor();
    assert.equal((await lessonRow(startLesson)).status, 'CREATED');
    assert(await page.getByRole('button', { name: 'Capture Whiteboard', exact: true }).isDisabled());

    await page.getByRole('button', { name: 'Start Recording Session', exact: true }).click();
    await page.getByText('LIVE', { exact: true }).waitFor();
    await page.getByText(/● REC/).waitFor();
    assert.equal((await lessonRow(startLesson)).status, 'ACTIVE');
    assert((await lessonRow(startLesson)).started_at);
    assert.equal(startRequests, 1);
    assert.equal(await page.getByRole('button', { name: 'Capture Whiteboard', exact: true }).isDisabled(), false);
    const authoritativeStartedAt = (await lessonRow(startLesson)).started_at.toISOString();

    await page.reload();
    await page.getByText('LIVE', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Start Recording Session', exact: true }).count(), 0);
    assert.equal(startRequests, 1, 'Refreshing ACTIVE must not call start again.');
    assert.equal((await lessonRow(startLesson)).started_at.toISOString(), authoritativeStartedAt);

    const backLesson = ids.lessons[1];
    await page.goto(`${site}/instructor/lessons/${backLesson}/active`);
    await page.getByText('READY TO START', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Back to Section', exact: true }).click();
    await page.waitForURL(`**/instructor/sections/${ids.sections[1]}`);
    assert.deepEqual(await lessonRow(backLesson), { status: 'CREATED', started_at: null });
    assert.equal(Number((await pool.query('SELECT COUNT(*) count FROM lesson_audio_recordings WHERE lesson_id=$1', [backLesson])).rows[0].count), 0);

    const failureLesson = ids.lessons[2];
    await page.route(`**/api/lessons/${failureLesson}/start`, route => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, error: 'Verification start failure.' }),
    }));
    await page.goto(`${site}/instructor/lessons/${failureLesson}/active`);
    await page.getByText('READY TO START', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Start Recording Session', exact: true }).click();
    await page.getByText('Verification start failure.', { exact: true }).waitFor();
    await page.getByText('READY TO START', { exact: true }).waitFor();
    assert.equal(await page.getByText('LIVE', { exact: true }).count(), 0);
    assert.deepEqual(await lessonRow(failureLesson), { status: 'CREATED', started_at: null });

    assert.deepEqual(browserErrors, [], 'No runtime React crashes are allowed.');
    console.log('PASS preparation is non-mutating, microphone monitoring is READY, camera preview works, capture stays disabled');
    console.log('PASS explicit start activates timer/audio/capture; backend transition is atomic');
    console.log('PASS back-before-start, pre-start refresh, ACTIVE refresh, and retryable start failure');
  } catch (error) {
    if (page) {
      console.error('Browser route:', page.url());
      console.error('Browser errors:', browserErrors);
      console.error('Page text:', (await page.locator('body').innerText()).slice(0, 2500));
    }
    throw error;
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
    if (ids.lessons.length) await pool.query('DELETE FROM lesson_sessions WHERE id=ANY($1::uuid[])', [ids.lessons]);
    for (const section of ids.sections) await pool.query('DELETE FROM sections WHERE id=$1', [section]);
    if (ids.subject) await pool.query('DELETE FROM subjects WHERE id=$1', [ids.subject]);
    if (ids.instructor) await pool.query('DELETE FROM users WHERE id=$1', [ids.instructor]);
    await pool.end();
  }
}

main().catch(error => {
  console.error('LESSON PREPARATION: FAIL', error.message);
  process.exitCode = 1;
});
