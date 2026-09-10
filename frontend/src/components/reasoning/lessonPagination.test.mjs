import assert from 'node:assert/strict';
import katex from 'katex';
import { PAGE_BOTTOM_SAFE_AREA, paginateMeasuredBlocks } from './lessonPagination.js';

const PAGE_HEIGHT = 1028;
const PAGE_PADDING_TOP = 64;
const PAGE_PADDING_BOTTOM = 80;
const PAGE_FOOTER_HEIGHT = 36;
const BLOCK_GAP = 22;
const CAPACITY = PAGE_HEIGHT - PAGE_PADDING_TOP - PAGE_PADDING_BOTTOM - PAGE_FOOTER_HEIGHT - PAGE_BOTTOM_SAFE_AREA;

const block = (id, type, height, latex = '') => ({ id, type, height, latex });
const keepWithNext = item => ['heading', 'subheading'].includes(item.type);

function paginate(profile) {
  return paginateMeasuredBlocks({
    blocks: profile,
    heights: profile.map(item => item.height),
    blockGap: BLOCK_GAP,
    capacity: CAPACITY,
    shouldKeepWithNext: keepWithNext,
  });
}

function verifyProfile(name, profile) {
  const pages = paginate(profile);
  const byId = new Map(profile.map(item => [item.id, item]));
  const placedIds = pages.flat().map(item => item.id);
  assert.deepEqual(placedIds, profile.map(item => item.id), `${name}: blocks changed order or disappeared`);
  assert.equal(new Set(placedIds).size, profile.length, `${name}: a block was duplicated or split`);
  pages.forEach((page, pageIndex) => {
    const used = page.reduce((total, item, index) => total + byId.get(item.id).height + (index ? BLOCK_GAP : 0), 0);
    assert.ok(used <= CAPACITY, `${name}: page ${pageIndex + 1} exceeds usable page height`);
  });
  profile.filter(item => item.latex).forEach(item => {
    katex.renderToString(item.latex, { displayMode: true, throwOnError: true });
    assert.equal(placedIds.filter(id => id === item.id).length, 1, `${name}: math block ${item.id} was split`);
  });
  return pages;
}

const paragraphsAndLists = [
  block('a-heading', 'heading', 92),
  block('a-p1', 'paragraph', 154),
  block('a-list1', 'list', 206),
  block('a-subheading', 'subheading', 68),
  block('a-p2', 'paragraph', 188),
  block('a-list2', 'list', 224),
  block('a-p3', 'paragraph', 142),
];

const mathHeavy = [
  block('b-heading', 'heading', 88),
  block('b-intro', 'paragraph', 126),
  block('b-limit', 'math', 112, String.raw`\lim_{x\to0}\frac{\sin x}{x}=1`),
  block('b-fraction', 'math', 126, String.raw`\frac{x\cos x-\sin x}{x^2}`),
  block('b-derivative', 'math', 148, String.raw`\frac{d}{dx}\left(\frac{f}{g}\right)=\frac{gf'-fg'}{g^2}`),
  block('b-scripts', 'math', 106, String.raw`x_i^2+x_{i+1}^2=y^2`),
  block('b-current', 'math', 132, String.raw`f(-0.01)=\frac{\sin(-0.01)}{-0.01}=0.999983`),
  block('b-close', 'paragraph', 168),
];

const longWorkedExample = [
  block('c-heading', 'heading', 94),
  block('c-context', 'paragraph', 184),
  block('c-step1', 'paragraph', 146),
  block('c-eq1', 'math', 142, String.raw`\frac{x^2-1}{x-1}=\frac{(x-1)(x+1)}{x-1}`),
  block('c-step2', 'paragraph', 158),
  block('c-eq2', 'math', 176, String.raw`\begin{aligned}f(x)&=\frac{x^2-1}{x-1}\\&=x+1\end{aligned}`),
  block('c-analysis', 'paragraph', 218),
  block('c-eq3', 'math', 164, String.raw`\frac{1}{1+\frac{x}{1+x}}=\frac{1+x}{1+2x}`),
  block('c-conclusion', 'paragraph', 202),
];

const pagesA = verifyProfile('paragraphs-and-lists', paragraphsAndLists);
const pagesB = verifyProfile('math-heavy', mathHeavy);
const pagesC = verifyProfile('long-worked-example', longWorkedExample);

const regenerated = [...paragraphsAndLists, block('a-regenerated', 'paragraph', 650)];
const regeneratedPages = verifyProfile('regenerated-notes', regenerated);
assert.ok(regeneratedPages.length > pagesA.length, 'regeneration did not recalculate page count');

const reopenedPages = verifyProfile('reopened-notes', regenerated);
assert.deepEqual(reopenedPages.map(page => page.map(item => item.id)), regeneratedPages.map(page => page.map(item => item.id)), 'reopen produced unstable pagination');

const aiEdited = longWorkedExample.map(item => item.id === 'c-analysis' ? { ...item, height: 690 } : item);
const aiEditedPages = verifyProfile('ai-edited-existing-lesson', aiEdited);
assert.notDeepEqual(aiEditedPages.map(page => page.map(item => item.id)), pagesC.map(page => page.map(item => item.id)), 'AI edit did not trigger a fresh pagination layout');

console.log(JSON.stringify({
  globalPagination: 'PASS',
  paragraphsAndLists: { pages: pagesA.length, status: 'PASS' },
  mathHeavy: { pages: pagesB.length, status: 'PASS' },
  longWorkedExample: { pages: pagesC.length, status: 'PASS' },
  regeneratedNotes: { pages: regeneratedPages.length, status: 'PASS' },
  reopenedNotes: { pages: reopenedPages.length, status: 'PASS' },
  aiEditedExistingLesson: { pages: aiEditedPages.length, status: 'PASS' },
  bottomSafeArea: PAGE_BOTTOM_SAFE_AREA,
}, null, 2));
