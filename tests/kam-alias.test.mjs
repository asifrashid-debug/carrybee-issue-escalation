import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canView, isNamedKam } from '../lib/roles.js';
import { isFeedbackOwner } from '../lib/feedback.js';
import { scopeFilter } from '../lib/visibility.js';

const sazzad = { email: 'sazzad.haider@carrybee.com', role: 'requester', teams: ['Activation'], display_name: 'Sazzad Haider', kam_aliases: ['Mohammad Sazzad Haider'] };
const mxIssue = { email: 'someone@carrybee.com', channel: 'MX', kam_name: 'Mohammad Sazzad Haider' };
const kamIssue = { email: 'someone@carrybee.com', channel: 'KAM', kam_name: 'Mohammad Sazzad Haider' };
const otherMx = { email: 'someone@carrybee.com', channel: 'MX', kam_name: 'Rakib' };

test('named KAM sees and owns MX issues by alias', () => {
  assert.equal(canView(sazzad, mxIssue, null), true);
  assert.equal(isNamedKam(sazzad, mxIssue), true);
  assert.equal(isFeedbackOwner(sazzad, mxIssue), true);
});

test('named KAM does not see KAM-channel issues or other KAMs MX issues', () => {
  assert.equal(canView(sazzad, kamIssue, null), false);
  assert.equal(canView(sazzad, otherMx, null), false);
});

test('name match is case and spacing insensitive in memory', () => {
  const esc = { email: 'x@carrybee.com', channel: 'MX', kam_name: '  mohammad   SAZZAD haider ' };
  assert.equal(canView(sazzad, esc, null), true);
});

test('management and hub roles never gain access through a name', () => {
  const mgmt = { email: 'm@carrybee.com', role: 'management', teams: [], display_name: 'Sazzad Haider', kam_aliases: ['Mohammad Sazzad Haider'] };
  assert.equal(canView(mgmt, mxIssue, null), false);
});

test('scope filter adds the MX name clause only when the viewer has names', () => {
  const f = scopeFilter({ emails: [sazzad.email], pickedIds: [], pool: false, kamNameList: ['Sazzad Haider', 'Mohammad Sazzad Haider'] });
  assert.match(f, /and\(channel\.eq\.MX,kam_name\.in\.\("Sazzad Haider","Mohammad Sazzad Haider"\)\)/);
  const none = scopeFilter({ emails: [], pickedIds: [], pool: false, kamNameList: [] });
  assert.equal(none.includes('channel.eq.MX'), false);
});

test('MX-role KAM (for example Rakib) sees MX issues named to them', () => {
  const rakib = { email: 'rakib.c@carrybee.com', role: 'mx', teams: ['IB'], display_name: 'MD Rakib Chowdhury', kam_aliases: ['Rakib'] };
  assert.equal(canView(rakib, { email: 'someone@carrybee.com', channel: 'MX', kam_name: 'Rakib' }, null), true);
  assert.equal(isFeedbackOwner(rakib, { email: 'someone@carrybee.com', channel: 'MX', kam_name: 'Rakib' }), true);
});
