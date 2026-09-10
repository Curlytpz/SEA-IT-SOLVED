// Disposable demo regressions: real DB/API, deterministic generation network stub.
// Optional: --browser with PLAYWRIGHT_PACKAGE_PATH pointing to an existing install.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
require('../src/config/env');
const pool = require('../src/db/pool');
const lessons = require('../src/services/lesson.service');
const context = require('../src/services/lesson-context.service');
const intelligence = require('../src/services/lesson-intelligence.service');
const students = require('../src/services/phase6.service');
const transcription = require('../src/services/transcription.service');
const Provider = require('../src/reasoning/GeminiReasoningProvider');
const interactive = require('../src/services/geminiInteractive.service');
const { signToken } = require('../src/utils/jwt');

async function main() {
  const ids = { users: [] };
  const suffix = crypto.randomBytes(6).toString('hex');
  const originalGenerate = Provider.prototype.generateMaterials, originalRun = interactive.run;
  let mode = 'valid', generation = 0, server, browser, page;
  const browserErrors=[];
  const makeSection = type => ({ type, title: type === 'NOTES' ? 'Power rule' : 'Summary',
    markdown: '### Power rule\n\nThe **derivative** measures change.\n\n$$\\frac{d}{dx}x^2=2x$$\n\nGeneration ' + generation,
    sourceReferences: ['Whiteboard Page 1'] });
  Provider.prototype.generateMaterials = async payload => {
    assert(payload.length && payload.every(item => !item.text.includes('EXCLUDED_EVIDENCE')));
    if (mode === 'fail') throw Object.assign(new Error('Test provider unavailable'), { statusCode: 503 });
    if (mode === 'empty') return { materials: [{ type: 'NOTES', markdown: '' }] };
    if (mode === 'race') {
      await context.reopen(ids.lesson, ids.users[0]);
      await context.approve(ids.lesson, ids.users[0]);
    }
    generation++;
    return { materials: (generation === 1 ? ['SUMMARY','NOTES'] : ['NOTES']).map(makeSection) };
  };
  interactive.run = operation => operation();
  try {
    const workflow = await import(pathToFileURL(path.resolve(__dirname,'../../frontend/src/utils/lessonWorkflow.js')));
    const nav = await import(pathToFileURL(path.resolve(__dirname,'../../frontend/src/utils/instructorLessonNavigation.js')));
    assert.equal(workflow.formatLessonDuration(56000), '56 sec');
    assert.equal(workflow.formatLessonDuration(72000), '1 min 12 sec');
    assert.notEqual(workflow.formatLessonDuration(50), '0 min');
    assert.equal(nav.sectionOriginFromState({originalReturnTo:'/instructor/sections/abc?tab=lessons',from:'/instructor/lessons/def/review'}),'/instructor/sections/abc?tab=lessons');
    assert.equal(nav.sectionOriginFromState({returnTo:'https://example.org'}),'');
    for (const role of ['INSTRUCTOR','STUDENT','INSTRUCTOR']) {
      ids.users.push((await pool.query("INSERT INTO users(first_name,last_name,email,password_hash,role,status) VALUES('Demo','Verification',$1,'verification-only',$2,'ACTIVE') RETURNING id", [suffix+role+ids.users.length+(role==='STUDENT'?'@student.hau.edu.ph':'@hau.edu.ph'),role])).rows[0].id);
    }
    const [owner,student,outsider] = ids.users;
    ids.subject=(await pool.query("INSERT INTO subjects(code,name) VALUES($1,'Demo stability verification') RETURNING id",['DS'+suffix])).rows[0].id;
    ids.section=(await pool.query("INSERT INTO sections(subject_id,instructor_id,section_name,join_code) VALUES($1,$2,'Demo stability verification',$3) RETURNING id",[ids.subject,owner,suffix.toUpperCase()])).rows[0].id;
    ids.lesson=(await pool.query("INSERT INTO lesson_sessions(section_id,instructor_id,title,status,started_at,ended_at) VALUES($1,$2,'Demo stability lesson','COMPLETED',NOW()-INTERVAL '56 seconds',NOW()) RETURNING id",[ids.section,owner])).rows[0].id;
    await pool.query("INSERT INTO enrollments(section_id,student_id,status) VALUES($1,$2,'APPROVED')",[ids.section,student]);
    const currentLesson=async()=> (await lessons.getLessons(ids.section,owner)).find(item=>item.id===ids.lesson);
    assert.equal(workflow.lessonPrimaryAction(await currentLesson()).label,'Process Lesson');
    const pages=[{pageNumber:1,plainText:'The derivative of x squared is two x.',blocks:[{type:'math',latex:'\\frac{d}{dx}x^2=2x'}]}];
    await pool.query("INSERT INTO lesson_recognitions(lesson_id,section_id,instructor_id,status,pages) VALUES($1,$2,$3,'FAILED',$4)",[ids.lesson,ids.section,owner,JSON.stringify(pages)]);
    assert.equal(workflow.lessonPrimaryAction(await currentLesson()).label,'Continue Processing');
    ids.recording=(await pool.query("INSERT INTO lesson_audio_recordings(lesson_id,section_id,instructor_id,source_key,hardware_mode,storage_key,mime_type,file_size,duration_ms,started_at,completed_at,recorded_at) VALUES($1,$2,$3,'verification','SIMULATED',$4,'audio/webm',16,56000,NOW()-INTERVAL '56 seconds',NOW(),NOW()) RETURNING id",[ids.lesson,ids.section,owner,'verification-'+suffix])).rows[0].id;
    await pool.query("INSERT INTO lesson_transcriptions(recording_id,lesson_id,section_id,instructor_id,status,last_failure_code,last_failure_message) VALUES($1,$2,$3,$4,'FAILED','FFMPEG_NOT_FOUND','Install FFmpeg: FFMPEG_PATH=C:/private/server')",[ids.recording,ids.lesson,ids.section,owner]);
    const audio=await transcription.getLessonTranscription(ids.lesson,owner);
    assert(audio.recording);
    assert(!audio.transcription.failureMessage.includes('FFMPEG_PATH'));
    assert(!audio.transcription.failureMessage.includes('private'));
    await pool.query("UPDATE lesson_recognitions SET status='REVIEW_REQUIRED' WHERE lesson_id=$1",[ids.lesson]);
    assert.equal(workflow.lessonPrimaryAction(await currentLesson()).label,'Review Context');
    await context.buildDraft(ids.lesson,owner);
    assert.equal((await context.get(ids.lesson,owner)).context.status,'DRAFT');
    await assert.rejects(()=>intelligence.generateMaterials(ids.lesson,owner),{statusCode:409});
    const v1=await context.approve(ids.lesson,owner);
    assert.equal(workflow.lessonPrimaryAction(await currentLesson()).label,'Open Lesson Workspace');
    await assert.rejects(()=>intelligence.generateMaterials(ids.lesson,outsider),{statusCode:404});
    await intelligence.generateMaterials(ids.lesson,owner);
    await intelligence.publishMaterials(ids.lesson,owner);
    const published1=(await students.lessonDetail(ids.lesson,student)).materials;
    assert.equal(published1.length,2);
    const frozen=(await pool.query('SELECT * FROM lesson_context_chunks WHERE context_version_id=$1 ORDER BY chunk_order',[v1.id])).rows;
    await context.reopen(ids.lesson,owner);
    assert.equal((await context.getApprovedForReasoning(ids.lesson,owner)).id,v1.id);
    assert.deepEqual((await pool.query('SELECT * FROM lesson_context_chunks WHERE context_version_id=$1 ORDER BY chunk_order',[v1.id])).rows,frozen);
    await context.approve(ids.lesson,owner);
    assert((await intelligence.list(ids.lesson,owner)).materials.every(item=>item.outdated));
    await assert.rejects(()=>intelligence.publishMaterials(ids.lesson,owner),{statusCode:409});
    assert.deepEqual((await students.lessonDetail(ids.lesson,student)).materials,published1);
    const unchanged=(await pool.query('SELECT * FROM generated_lesson_materials WHERE lesson_id=$1 ORDER BY id',[ids.lesson])).rows;
    for (mode of ['fail','empty']) {
      await assert.rejects(()=>intelligence.generateMaterials(ids.lesson,owner));
      assert.deepEqual((await pool.query('SELECT * FROM generated_lesson_materials WHERE lesson_id=$1 ORDER BY id',[ids.lesson])).rows,unchanged);
      assert.deepEqual((await students.lessonDetail(ids.lesson,student)).materials,published1);
    }
    mode='valid';
    await intelligence.generateMaterials(ids.lesson,owner);
    const updated=(await intelligence.list(ids.lesson,owner)).materials;
    assert.equal(updated.length,1,'Do not mix sections from old and new contexts.');
    assert(updated.every(item=>!item.outdated));
    assert.deepEqual((await students.lessonDetail(ids.lesson,student)).materials,published1,'Only publication replaces the student snapshot.');
    await intelligence.publishMaterials(ids.lesson,owner);
    assert.equal((await students.lessonDetail(ids.lesson,student)).materials.length,1);
    mode='race';
    await assert.rejects(()=>intelligence.generateMaterials(ids.lesson,owner),{statusCode:409});
    assert((await intelligence.list(ids.lesson,owner)).materials.every(item=>item.outdated));
    mode='valid';
    console.log('PASS persisted lesson actions, sub-minute duration, safe legacy audio error, failed audio does not block review');
    console.log('PASS required approval, ownership, immutable source versions, reopen, stale publish rejection');
    console.log('PASS failed/empty/racing regeneration keeps material; last published snapshot survives; no cross-version section mixing');
    if (process.argv.includes('--browser')) {
      const {chromium}=require(process.env.PLAYWRIGHT_PACKAGE_PATH || 'playwright');
      server=require('../src/app').listen(0);
      await new Promise(resolve=>server.once('listening',resolve));
      const base='http://127.0.0.1:'+server.address().port;
      browser=await chromium.launch({channel:'msedge',headless:true});
      page=await browser.newPage({viewport:{width:1440,height:1000}});
      const errors=browserErrors;
      page.on('pageerror',error=>errors.push(error.message));
      await page.addInitScript(({token,user})=>{
        localStorage.setItem('token',token);localStorage.setItem('user',JSON.stringify(user));
      },{token:signToken({id:owner,role:'INSTRUCTOR',authVersion:0}),user:{id:owner,role:'INSTRUCTOR',status:'ACTIVE',firstName:'Demo',lastName:'Verification'}});
      await page.route('**/api/**',async route=>{
        const url=new URL(route.request().url());
        if (url.pathname.endsWith('/context') && route.request().method()==='GET') {
          await new Promise(resolve=>setTimeout(resolve,350));
        }
        try {
          const response=await route.fetch({url:base+url.pathname+url.search});
          if (response.status()===401 || response.status()===429) console.error('Browser API status:',response.status(),url.pathname);
          await route.fulfill({response});
        }
        catch { await route.abort(); }
      });
      const site=process.env.DEMO_FRONTEND_URL || 'http://localhost:5173';
      const workspace='/instructor/lessons/'+ids.lesson+'/review?view=workspace';
      const review='/instructor/lessons/'+ids.lesson+'/review';
      const section='/instructor/sections/'+ids.section;
      const click=async name=>{await page.getByRole('button',{name,exact:true}).filter({visible:true}).first().click();};
      const ready=async name=>page.getByRole('button',{name,exact:true}).filter({visible:true}).first().waitFor();
      await context.reopen(ids.lesson,owner);
      await page.goto(site+section+'?tab=lessons');
      await click('Review Context');
      await page.getByRole('region',{name:'Loading lesson content'}).waitFor();
      await page.getByRole('heading',{name:'Lesson Context Review',exact:true}).waitFor();
      await ready('Approve Lesson Context');
      await click('Approve Lesson Context');await click('Approve Context');
      await page.waitForURL('**'+workspace);
      await ready('Review Sources');
      await page.getByText('Lesson context approved',{exact:true}).first().waitFor();
      await ready('Regenerate from Approved Context');
      assert.equal(await page.getByRole('button',{name:'Republish Materials',exact:true}).count(),0);
      mode='fail';await click('Regenerate from Approved Context');
      await ready('Regenerate from Approved Context');
      await page.getByText(/Test provider unavailable/).waitFor();
      assert(await page.getByText('This generated lesson is based on an older approved context.',{exact:true}).isVisible());
      mode='valid';await click('Regenerate from Approved Context');await ready('Publish Materials');
      await click('Publish Materials');await ready('Republish Materials');
      await page.getByText('Learning materials published',{exact:true}).waitFor();
      await click('Review Sources');
      await ready('View Approved Sources');
      assert.equal(await page.getByText('Whiteboard Page 1',{exact:true}).count(),0);
      await click('View Approved Sources');await ready('Hide Approved Sources');
      await click('Back to Lesson Workspace');await ready('Review Sources');
      await page.goBack();
      await page.waitForURL('**'+section+'?tab=lessons');
      await page.goForward();await ready('Review Sources');
      await click('Back to Lessons');await page.waitForURL('**'+section+'?tab=lessons');
      await click('Open Lesson Workspace');await ready('Review Sources');
      await page.reload();await ready('Back to Lessons');
      // Simulate history state lost on a refresh: per-lesson origin survives.
      await page.evaluate(()=>history.replaceState(null,'',location.href));
      await page.reload();await ready('Back to Lessons');
      await click('Review Sources');await ready('View Approved Sources');
      await page.reload();await ready('Back to Lesson Workspace');
      await page.evaluate(()=>history.replaceState(null,'',location.href));
      await page.reload();await click('Back to Lesson Workspace');await ready('Review Sources');
      await click('Back to Lessons');await page.waitForURL('**'+section+'?tab=lessons');
      // Reviews intentionally shows published quizzes with submitted attempts.
      // Create a real disposable objective attempt, not an empty draft quiz.
      const current=await context.getApprovedForReasoning(ids.lesson,owner);
      ids.quiz=(await pool.query("INSERT INTO lesson_quizzes(lesson_id,context_version_id,instructor_id,title,instructions,difficulty,status,provider,provider_version) VALUES($1,$2,$3,'Demo review quiz','Test','MEDIUM','DRAFT','TEST','demo-stability') RETURNING id",[ids.lesson,current.id,owner])).rows[0].id;
      const quiz=await intelligence.replaceQuizQuestions(ids.quiz,owner,[{type:'TRUE_FALSE',prompt:'Two plus two is four.',choices:['True','False'],correctAnswer:'True',explanation:'Addition.',maxPoints:1}]);
      await intelligence.publishQuiz(ids.quiz,owner);
      const attempt=await students.startAttempt(ids.quiz,student);
      await students.saveAnswer(attempt.attempt.id,quiz.questions[0].id,student,'True');
      await students.submitAttempt(attempt.attempt.id,student);
      await page.goto(site+section+'?tab=reviews');
      await click('View Attempts');
      await page.getByRole('region',{name:'Student attempt'}).waitFor();
      await page.getByRole('heading',{name:'Demo Verification',exact:true}).waitFor();
      await page.reload();
      await page.getByRole('link',{name:'← Back to section reviews',exact:true}).waitFor();
      await page.evaluate(()=>history.replaceState(null,'',location.href));
      await page.reload();
      await page.getByRole('link',{name:'← Back to section reviews',exact:true}).click();
      await page.waitForURL('**'+section+'?tab=reviews');
      await page.getByRole('link',{name:'Demo stability lesson',exact:true}).click();await ready('Review Sources');
      await click('Review Sources');await ready('View Approved Sources');
      await click('Continue to Lesson Workspace');await ready('Review Sources');
      await click('Back to Reviews');await page.waitForURL('**'+section+'?tab=reviews');
      await page.goto(site+review);await ready('View Approved Sources');
      const out=path.resolve(__dirname,'../.demo-qa');
      await fs.mkdir(out,{recursive:true});
      await page.screenshot({path:path.join(out,'approved-context-desktop.png'),fullPage:true});
      await page.setViewportSize({width:390,height:844});
      await page.waitForFunction(()=>document.querySelector('.dashboard-sidebar').getBoundingClientRect().right<=0);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
      await page.screenshot({path:path.join(out,'approved-context-mobile.png'),fullPage:true});
      await click('Continue to Lesson Workspace');await ready('Review Sources');
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
      await page.emulateMedia({reducedMotion:'reduce'});
      assert(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches));
      await page.setViewportSize({width:1440,height:1000});
      await page.goto(site+'/instructor/lessons/'+ids.lesson+'/processing');
      await page.getByRole('region',{name:'Lesson processing stages'}).waitFor();
      await page.getByRole('button',{name:'Retry Transcription',exact:true}).waitFor();
      assert(await page.getByText('Needs attention',{exact:true}).isVisible());
      assert.equal(await page.getByText(/FFMPEG_PATH|Install FFmpeg|private.server/).count(),0);
      await page.getByRole('button',{name:'Open Lesson Workspace',exact:true}).click();
      await ready('Review Sources');
      assert.deepEqual(errors,[],'No runtime React crashes');
      console.log('PASS browser: approval auto-workspace, failure/retry regeneration, safe publish and viewport success toast');
      console.log('PASS browser: Lessons/Reviews origins, nested sources Back, refresh/state-loss fallback, no route loop');
      console.log('PASS browser: compact approved summary, expandable sources, mobile width, reduced motion, no React crashes');
      console.log('PASS browser: real View Attempts, student attempt, refresh/state-loss metadata fallback to Section Reviews');
    }
  } catch (error) {
    if (page) {
      console.error('Browser errors:',browserErrors);
      console.error('Browser route:',new URL(page.url()).pathname);
      console.error('Fixture page text:',(await page.locator('body').innerText()).slice(0,2500));
      await page.screenshot({path:path.resolve(__dirname,'../.demo-qa/workflow-failure.png'),fullPage:true});
    }
    throw error;
  } finally {
    Provider.prototype.generateMaterials=originalGenerate;interactive.run=originalRun;
    if(browser)await browser.close();
    if(server)await new Promise(resolve=>server.close(resolve));
    if(ids.lesson) {
      await pool.query('DELETE FROM quiz_attempts WHERE lesson_id=$1',[ids.lesson]);
      await pool.query('DELETE FROM lesson_sessions WHERE id=$1',[ids.lesson]);
    }
    if(ids.section){await pool.query('DELETE FROM enrollments WHERE section_id=$1',[ids.section]);await pool.query('DELETE FROM sections WHERE id=$1',[ids.section]);}
    if(ids.subject)await pool.query('DELETE FROM subjects WHERE id=$1',[ids.subject]);
    if(ids.users.length)await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[ids.users]);
    await pool.end();
  }
}
main().catch(error=>{console.error('DEMO STABILITY: FAIL',error.message);process.exitCode=1;});
