import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { completionBlock, clearBlock, hasText } from '../lib/finalResponse.js';

const open = { ops_status: 'Pending', final_response: null };
const withFinal = { ops_status: 'Pending', final_response: 'Customer refunded, closed with hub.' };
const done = { ops_status: 'Completed', final_response: null };

test('Completed is refused without a Final Response', () => {
  assert.ok(completionBlock(open, 'Completed')?.error);
  assert.ok(completionBlock({ ops_status: 'Pending', final_response: '   ' }, 'Completed')?.error);
});

test('Completed is allowed once a Final Response exists', () => {
  assert.equal(completionBlock(withFinal, 'Completed'), null);
});

test('rows already Completed are not re-checked, and other statuses pass', () => {
  assert.equal(completionBlock(done, 'Completed'), null);
  assert.equal(completionBlock(open, 'Pending'), null);
  assert.equal(completionBlock(open, 'In Progress'), null);
});

test('Final Response cannot be cleared while Ops Status is Completed', () => {
  assert.ok(clearBlock({ ops_status: 'Completed', final_response: 'x' }, 'final_response', '')?.error);
  assert.equal(clearBlock(withFinal, 'final_response', ''), null);
  assert.equal(clearBlock({ ops_status: 'Completed' }, 'final_response', 'new text'), null);
  assert.equal(clearBlock({ ops_status: 'Completed' }, 'layer1_response', ''), null);
});

test('hasText ignores whitespace and null', () => {
  assert.equal(hasText(null), false);
  assert.equal(hasText('  '), false);
  assert.equal(hasText('ok'), true);
});

// Source-level checks: the sheet layout is read from lib/sheets.js so a column move cannot silently break the mapping.
function arrayFrom(src, name) {
  const m = src.match(new RegExp(`export const ${name} = (\\[[\\s\\S]*?\\]);`));
  assert.ok(m, `${name} not found`);
  return Function(`return ${m[1]}`)();
}
const sheets = readFileSync(new URL('../lib/sheets.js', import.meta.url), 'utf8');
const COLS = arrayFrom(sheets, 'COLS');
const HEADERS = arrayFrom(sheets, 'HEADERS');

test('COLS and HEADERS line up, with Final Response right after Layer 3', () => {
  assert.equal(COLS.length, HEADERS.length);
  assert.equal(COLS.length, 35);
  const l3 = COLS.indexOf('layer3_response');
  assert.equal(COLS[l3 + 1], 'final_response');
  assert.equal(HEADERS[l3 + 1], 'Final Response');
  assert.equal(HEADERS[l3], 'Layer 3 Response (Regional Lead)');
});

test('sheet ranges use the new last column AI, and no fixed AH range is left', () => {
  // 3 explicit row writes (pushToSheet update, pushToSheet append, appendLegacyRows batch) go through rowRanges,
  // which writes A:T and V:AI so column U (the sheet formula) is never overwritten. Definition + 3 uses = 4.
  assert.equal((sheets.match(/rowRanges\(/g) || []).length, 5); // definition + 3 uses + 1 doc comment
  assert.equal((sheets.match(/:AI\$\{/g) || []).length, 1);
  assert.equal((sheets.match(/Active!A1:AI5000/g) || []).length, 1);
  assert.equal(/:AH\$\{|AH5000/.test(sheets), false);
});

test('reconcile finds row version and derived cells by name, not by fixed position', () => {
  const rec = readFileSync(new URL('../app/api/sync/reconcile/route.js', import.meta.url), 'utf8');
  assert.match(rec, /COLS\.indexOf\('row_version'\)/);
  assert.match(rec, /COLS\.length - 3/);
  assert.equal(/\[31, 32, 33\]|s\.vals\[28\]/.test(rec), false);
});

test('Apps Script maps the Final Response header to final_response', () => {
  const gs = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
  assert.match(gs, /'Final Response': 'final_response'/);
});
