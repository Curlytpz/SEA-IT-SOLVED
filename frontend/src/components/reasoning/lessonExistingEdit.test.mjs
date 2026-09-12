import assert from 'node:assert/strict';
import fs from 'node:fs';

const assistant = fs.readFileSync(new URL('./LessonChatAssistant.jsx', import.meta.url), 'utf8');
const document = fs.readFileSync(new URL('./GeneratedLessonDocument.jsx', import.meta.url), 'utf8');
const workspace = fs.readFileSync(new URL('../../pages/instructor/LessonContextReview.jsx', import.meta.url), 'utf8');

assert.match(assistant, /action === 'EDIT_LESSON'/);
for (const stage of ['Preparing current lesson', 'Locating requested content', 'Applying requested changes', 'Rebuilding document layout']) {
  assert.ok(assistant.includes(stage), stage);
}
assert.match(assistant, /function pageMaterialTarget/);
assert.match(assistant, /pageContext\?\.pageMaterialIds\?\.\[pageNumber - 1\]/);
assert.match(assistant, /pageMaterialTarget\(clean, documentPageContext, materials\) \|\| semanticMaterialTarget/);
assert.match(assistant, /const wholeLessonEdit = editing && isWholeLessonEdit\(clean\)/);
assert.match(assistant, /detail: taskAction === 'EDIT_LESSON' \? '✓ Lesson updated'/);
assert.match(document, /onPaginationContextChange/);
assert.match(document, /pageMaterialIds: pages\.map\(page => \[\.\.\.new Set\(page\.map\(block => block\.materialId\)\.filter\(Boolean\)\)\]\)/);
assert.match(workspace, /documentPageContext=\{documentPageContext\}/);
assert.match(workspace, /onPaginationContextChange=\{setDocumentPageContext\}/);
assert.match(document, /paginateMeasuredBlocks/);

console.log('EXISTING LESSON EDIT UI CONTRACT: PASS');
