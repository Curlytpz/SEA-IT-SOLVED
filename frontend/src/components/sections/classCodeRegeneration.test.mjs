import assert from 'node:assert/strict';
import fs from 'node:fs';

const component = fs.readFileSync(new URL('./ClassCode.jsx', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../../services/teachingWorkspaceApi.js', import.meta.url), 'utf8');

assert.match(api, /api\.post\(`\/sections\/\$\{sectionId\}\/regenerate-code`\)/);
assert.match(component, /Generate a new section code\?/);
assert.match(component, /Students will no longer be able to use the previous code to join this section\./);
assert.match(component, /Create New Code/);
assert.match(component, /RefreshCw/);
assert.match(component, /if \(!sectionId \|\| generatingRef\.current\) return;/, 'Repeated requests must be guarded synchronously.');
assert.match(component, /disabled=\{generating\}/, 'The regeneration action must be disabled while loading.');
assert.match(component, /setCurrentCode\(nextCode\)/, 'The modal must replace the displayed code without a page reload.');
assert.match(component, /writeClipboard\(normalizedCode\)/, 'Copy must use the current regenerated code.');
assert.match(component, /New section code created\./);
assert.match(component, /Unable to create a new section code\. Please try again\./);
assert.match(component, /loadingLabel="Generating\.\.\."/);

console.log('Class code regeneration UX tests passed.');
