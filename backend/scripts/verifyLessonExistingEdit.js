const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
require('../src/config/env');
const pool = require('../src/db/pool');
const GeminiLessonChatProvider = require('../src/reasoning/GeminiLessonChatProvider');

async function main() {
  await pool.query(fs.readFileSync(path.join(__dirname, '../src/db/migration_lesson_chat_history.sql'), 'utf8'));
  const originalEdit = GeminiLessonChatProvider.prototype.edit;
  const originalEditDocument = GeminiLessonChatProvider.prototype.editDocument;
  let targetedCalls = 0;
  let documentCalls = 0;
  GeminiLessonChatProvider.prototype.edit = async input => {
    targetedCalls += 1;
    assert.equal(input.context[0].text, 'Context used by the existing generated lesson.');
    assert.equal(input.selectedSection, 'NOTES');
    assert.match(input.materials.find(item => item.section === 'NOTES').markdown, /Original detailed notes/);
    return {
      action: 'UPDATE_SECTION', operation: 'rewrite', targetSection: 'NOTES', title: 'Lesson Notes',
      markdown: '## Simpler limits\n\nA limit describes the value a function approaches.',
      sourceReferences: ['Whiteboard Page 1'], confidence: 0.99, message: 'Lesson notes simplified.',
    };
  };
  GeminiLessonChatProvider.prototype.editDocument = async input => {
    documentCalls += 1;
    assert.equal(input.context[0].text, 'Context used by the existing generated lesson.');
    return {
      message: 'The complete current lesson was simplified.',
      sections: input.materials.map(item => ({
        targetSection: item.section,
        markdown: `## Simple ${item.title}\n\nSimplified from the current generated ${item.section.toLowerCase()} section.`,
        sourceReferences: ['Whiteboard Page 1'],
      })),
    };
  };

  const chat = require('../src/services/lesson-chat.service');
  const intelligence = require('../src/services/lesson-intelligence.service');
  const suffix = crypto.randomBytes(5).toString('hex');
  const ids = { lessons: [], sections: [], subjects: [], users: [] };
  try {
    const instructor = (await pool.query(
      "INSERT INTO users(first_name,last_name,email,password_hash,role,status) VALUES('Existing','Editor',$1,'verification-only','INSTRUCTOR','ACTIVE') RETURNING id",
      [`existing-edit-${suffix}@hau.edu.ph`]
    )).rows[0].id;
    ids.users.push(instructor);

    async function createLesson(label) {
      const subject = (await pool.query("INSERT INTO subjects(code,name) VALUES($1,$2) RETURNING id", [`EE${suffix}${label}`, `Existing edit ${label}`])).rows[0].id;
      const section = (await pool.query("INSERT INTO sections(subject_id,instructor_id,section_name,join_code) VALUES($1,$2,$3,$4) RETURNING id", [subject, instructor, `Existing edit ${label}`, `${suffix}${label}`.toUpperCase()])).rows[0].id;
      const lesson = (await pool.query("INSERT INTO lesson_sessions(section_id,instructor_id,title,status) VALUES($1,$2,$3,'COMPLETED') RETURNING id", [section, instructor, `Existing lesson ${label}`])).rows[0].id;
      ids.subjects.push(subject); ids.sections.push(section); ids.lessons.push(lesson);
      return { lesson, section };
    }

    const fixture = await createLesson('A');
    const oldContext = (await pool.query(
      "INSERT INTO lesson_context_versions(lesson_id,section_id,instructor_id,version_number,status,approved_at) VALUES($1,$2,$3,1,'ARCHIVED',NOW()) RETURNING id",
      [fixture.lesson, fixture.section, instructor]
    )).rows[0].id;
    const currentContext = (await pool.query(
      "INSERT INTO lesson_context_versions(lesson_id,section_id,instructor_id,version_number,status,approved_at) VALUES($1,$2,$3,2,'APPROVED',NOW()) RETURNING id",
      [fixture.lesson, fixture.section, instructor]
    )).rows[0].id;
    await pool.query(
      "INSERT INTO lesson_context_chunks(context_version_id,lesson_id,chunk_type,chunk_order,source,reviewed_text) VALUES($1,$2,'WHITEBOARD',1,$3,$4),($5,$2,'WHITEBOARD',1,$3,$6)",
      [oldContext, fixture.lesson, JSON.stringify({ pageNumber: 1 }), 'Context used by the existing generated lesson.', currentContext, 'Newer approved context that must not replace the edit baseline.']
    );
    const publishedSnapshot = { title: 'Lesson Notes', content: { markdown: 'Original detailed notes.' }, sourceReferences: ['Whiteboard Page 1'], displayOrder: 1 };
    const notes = (await pool.query(
      `INSERT INTO generated_lesson_materials(lesson_id,context_version_id,instructor_id,material_type,title,content,source_references,provider,provider_version,outdated,display_order,published_at,published_snapshot)
       VALUES($1,$2,$3,'NOTES','Lesson Notes',$4,$5,'TEST','existing-edit',TRUE,1,NOW(),$6) RETURNING id`,
      [fixture.lesson, oldContext, instructor, JSON.stringify({ markdown: '## Detailed limits\n\nOriginal detailed notes.' }), JSON.stringify(['Whiteboard Page 1']), JSON.stringify(publishedSnapshot)]
    )).rows[0].id;
    const summary = (await pool.query(
      `INSERT INTO generated_lesson_materials(lesson_id,context_version_id,instructor_id,material_type,title,content,source_references,provider,provider_version,outdated,display_order)
       VALUES($1,$2,$3,'SUMMARY','Lesson Summary',$4,$5,'TEST','existing-edit',TRUE,0) RETURNING id`,
      [fixture.lesson, oldContext, instructor, JSON.stringify({ markdown: 'Original summary must remain unchanged.' }), JSON.stringify(['Whiteboard Page 1'])]
    )).rows[0].id;

    const targeted = await chat.send(fixture.lesson, instructor, {
      message: 'Make page 4 simpler.', intent: 'EDIT_LESSON', selectedMaterialId: notes, newConversation: true,
    });
    assert.equal(targeted.edited, true);
    assert.equal(targeted.changedMaterialId, notes, 'The page reference must resolve to the stable material ID supplied by the viewer.');
    assert.equal(targeted.newerApprovedContextAvailable, true, 'A newer context is non-blocking metadata.');
    assert.equal(targetedCalls, 1);
    assert.match((await pool.query('SELECT content FROM generated_lesson_materials WHERE id=$1', [notes])).rows[0].content.markdown, /Simpler limits/);
    assert.equal((await pool.query('SELECT content FROM generated_lesson_materials WHERE id=$1', [summary])).rows[0].content.markdown, 'Original summary must remain unchanged.');
    assert.equal((await pool.query('SELECT COUNT(*)::int count FROM generated_lesson_materials WHERE lesson_id=$1 AND context_version_id=$2', [fixture.lesson, currentContext])).rows[0].count, 0, 'Editing must not regenerate against the latest context.');
    assert.deepEqual((await pool.query('SELECT published_snapshot FROM generated_lesson_materials WHERE id=$1', [notes])).rows[0].published_snapshot, publishedSnapshot, 'Student-visible published snapshot must remain unchanged.');
    assert.equal((await chat.list(fixture.lesson, instructor)).canUndo, true, 'Old-context generated lesson edits must retain undo history.');

    await chat.undo(fixture.lesson, instructor);
    assert.match((await pool.query('SELECT content FROM generated_lesson_materials WHERE id=$1', [notes])).rows[0].content.markdown, /Original detailed notes/);

    const whole = await chat.send(fixture.lesson, instructor, {
      message: 'Edit the lesson material and change all of it; make it simple.', newConversation: true,
    });
    assert.equal(whole.edited, true);
    assert.equal(whole.changedMaterialId, null);
    assert.equal(documentCalls, 1, 'Whole-document simplification must use editing, not regeneration.');
    assert.equal(targetedCalls, 1);
    assert.match((await pool.query('SELECT content FROM generated_lesson_materials WHERE id=$1', [notes])).rows[0].content.markdown, /Simplified from the current generated notes section/);
    assert.match((await pool.query('SELECT content FROM generated_lesson_materials WHERE id=$1', [summary])).rows[0].content.markdown, /Simplified from the current generated summary section/);
    assert.deepEqual((await pool.query('SELECT published_snapshot FROM generated_lesson_materials WHERE id=$1', [notes])).rows[0].published_snapshot, publishedSnapshot);
    await assert.rejects(() => intelligence.publishMaterials(fixture.lesson, instructor), error => error.statusCode === 409, 'Stale edited material must not bypass latest-context publication safety.');

    const empty = await createLesson('B');
    const emptyContext = (await pool.query(
      "INSERT INTO lesson_context_versions(lesson_id,section_id,instructor_id,version_number,status,approved_at) VALUES($1,$2,$3,1,'APPROVED',NOW()) RETURNING id",
      [empty.lesson, empty.section, instructor]
    )).rows[0].id;
    await pool.query(
      "INSERT INTO lesson_context_chunks(context_version_id,lesson_id,chunk_type,chunk_order,source,reviewed_text) VALUES($1,$2,'WHITEBOARD',1,$3,'Empty lesson context')",
      [emptyContext, empty.lesson, JSON.stringify({ pageNumber: 1 })]
    );
    await assert.rejects(
      () => chat.send(empty.lesson, instructor, { message: 'Make section 2 simpler.', intent: 'EDIT_LESSON', newConversation: true }),
      error => error.statusCode === 409 && /No generated lesson exists yet/.test(error.message)
    );

    console.log('EXISTING GENERATED LESSON EDIT: PASS');
    console.log('OLDER CONTEXT + TARGETED + WHOLE DOCUMENT + UNDO + PUBLISHED SNAPSHOT: PASS');
  } finally {
    GeminiLessonChatProvider.prototype.edit = originalEdit;
    GeminiLessonChatProvider.prototype.editDocument = originalEditDocument;
    for (const lesson of ids.lessons.reverse()) await pool.query('DELETE FROM lesson_sessions WHERE id=$1', [lesson]).catch(() => {});
    for (const section of ids.sections.reverse()) await pool.query('DELETE FROM sections WHERE id=$1', [section]).catch(() => {});
    for (const subject of ids.subjects.reverse()) await pool.query('DELETE FROM subjects WHERE id=$1', [subject]).catch(() => {});
    for (const user of ids.users.reverse()) await pool.query('DELETE FROM users WHERE id=$1', [user]).catch(() => {});
    await pool.end();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
