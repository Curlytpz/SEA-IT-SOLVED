const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
require('../src/config/env');
const pool = require('../src/db/pool');
const chat = require('../src/services/lesson-chat.service');

async function main() {
  await pool.query(fs.readFileSync(path.join(__dirname, '../src/db/migration_lesson_chat_history.sql'), 'utf8'));
  const suffix=crypto.randomBytes(5).toString('hex');
  const ids={ lessons:[], sections:[], subjects:[], users:[] };
  try{
    const instructor=(await pool.query(
      "INSERT INTO users(first_name,last_name,email,password_hash,role,status) VALUES('History','Owner',$1,'verification-only','INSTRUCTOR','ACTIVE') RETURNING id",
      [`history-owner-${suffix}@hau.edu.ph`]
    )).rows[0].id;
    const intruder=(await pool.query(
      "INSERT INTO users(first_name,last_name,email,password_hash,role,status) VALUES('History','Other',$1,'verification-only','INSTRUCTOR','ACTIVE') RETURNING id",
      [`history-other-${suffix}@hau.edu.ph`]
    )).rows[0].id;
    ids.users.push(instructor,intruder);

    async function lessonFixture(owner,label){
      const subject=(await pool.query("INSERT INTO subjects(code,name) VALUES($1,$2) RETURNING id",[`CH${suffix}${label}`,`Chat history ${label}`])).rows[0].id;
      const section=(await pool.query("INSERT INTO sections(subject_id,instructor_id,section_name,join_code) VALUES($1,$2,$3,$4) RETURNING id",[subject,owner,`History ${label}`,`${suffix}${label}`.toUpperCase()])).rows[0].id;
      const lesson=(await pool.query("INSERT INTO lesson_sessions(section_id,instructor_id,title) VALUES($1,$2,$3) RETURNING id",[section,owner,`History lesson ${label}`])).rows[0].id;
      const context=(await pool.query("INSERT INTO lesson_context_versions(lesson_id,section_id,instructor_id,version_number,status,approved_at) VALUES($1,$2,$3,1,'APPROVED',NOW()) RETURNING id",[lesson,section,owner])).rows[0].id;
      await pool.query("INSERT INTO lesson_context_chunks(context_version_id,lesson_id,chunk_type,chunk_order,source,reviewed_text) VALUES($1,$2,'WHITEBOARD',1,$3,$4)",[context,lesson,JSON.stringify({pageNumber:1}),`Approved lesson context ${label}`]);
      ids.subjects.push(subject);ids.sections.push(section);ids.lessons.push(lesson);
      return lesson;
    }

    const lessonA=await lessonFixture(instructor,'A');
    const lessonB=await lessonFixture(instructor,'B');
    const prompts=['Generate a quiz about limits','Generate a quiz about derivatives','Generate a quiz about integrals'];
    const created=[];
    for(const message of prompts){
      const result=await chat.send(lessonA,instructor,{message,newConversation:true});
      assert.equal(result.message.action,'QUIZ_OPTIONS_REQUIRED');
      assert.ok(result.conversation?.id);
      created.push(result.conversation.id);
    }
    assert.equal(new Set(created).size,3,'New Chat must create distinct conversations.');

    const history=await chat.list(lessonA,instructor);
    assert.equal(history.conversations.length,3);
    assert.equal(history.activeConversationId,created[2]);
    assert.equal(history.messages.length,2);
    assert.equal(history.messages[0].content,prompts[2]);
    assert.deepEqual(history.messages[1].missingQuizParameters.sort(),['difficulty','questionCount','questionType'].sort());

    const selected=await chat.list(lessonA,instructor,created[0]);
    assert.equal(selected.activeConversationId,created[0]);
    assert.equal(selected.messages[0].content,prompts[0]);

    const otherLesson=await chat.list(lessonB,instructor);
    assert.equal(otherLesson.conversations.length,0,'Lesson history must not leak across lessons.');

    await assert.rejects(
      chat.send(lessonA,instructor,{message:'Make question 1 harder',newConversation:true}),
      error=>error.statusCode===409
    );
    const failedRequest=await chat.list(lessonA,instructor);
    assert.equal(failedRequest.conversations.length,4,'A sent user message must not leave an empty conversation when an action fails.');
    assert.equal(failedRequest.messages.length,1);
    assert.equal(failedRequest.messages[0].role,'USER');

    await assert.rejects(
      chat.deleteConversation(lessonA,intruder,created[0]),
      error => [403,404].includes(error.statusCode||error.status)
    );
    await chat.deleteConversation(lessonA,instructor,created[1]);
    const afterDelete=await chat.list(lessonA,instructor);
    assert.equal(afterDelete.conversations.length,3);
    assert.ok(!afterDelete.conversations.some(item=>item.id===created[1]));

    console.log('Lesson chat history persistence, selection, scoping, pending quiz, authorization, and deletion: PASS');
  }finally{
    for(const lesson of ids.lessons.reverse())await pool.query('DELETE FROM lesson_sessions WHERE id=$1',[lesson]).catch(()=>{});
    for(const section of ids.sections.reverse())await pool.query('DELETE FROM sections WHERE id=$1',[section]).catch(()=>{});
    for(const subject of ids.subjects.reverse())await pool.query('DELETE FROM subjects WHERE id=$1',[subject]).catch(()=>{});
    for(const user of ids.users.reverse())await pool.query('DELETE FROM users WHERE id=$1',[user]).catch(()=>{});
    await pool.end();
  }
}

main().catch(error=>{console.error(error);process.exitCode=1;});
