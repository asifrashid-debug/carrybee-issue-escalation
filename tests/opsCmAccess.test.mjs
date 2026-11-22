import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visibleOpsIssues, canEditKamFeedback } from '../lib/opsIssues.mjs';
import { canOpenTab } from '../lib/access.js';
import { CM_ROLES } from '../lib/roles.js';

const issues = [
  { issue_id: 'CB-NAMED', kam_name: 'Ahmed Asif Rashid' },
  { issue_id: 'CB-CMQ', kam_name: 'CM' },
  { issue_id: 'CB-OTHER', kam_name: 'Rizvi Ahmed Chowdhury' },
];
const cmLead = { email: 'asif.rashid@carrybee.com', role: 'cm_lead', display_name: 'Ahmed Asif Rashid', kam_aliases: [] };
const cmMember = { email: 'nuruzzaman.nahid@carrybee.com', role: 'cm_member', display_name: 'Nuruzzaman Nahid', kam_aliases: [] };
const cmOther = { email: 'iniat.islam@carrybee.com', role: 'cm_member', display_name: 'Tanzim Iniat Islam', kam_aliases: [] };
const requester = { email: 'k@carrybee.com', role: 'requester', display_name: 'Ahmed Asif Rashid', kam_aliases: [] };

test('CM roles are cm_member and cm_lead', () => {
  assert.deepEqual([...CM_ROLES].sort(), ['cm_lead', 'cm_member']);
});

test('CM lead and CM member can open the Ops-KAM tab', () => {
  assert.equal(canOpenTab('cm_lead', 'kam_issues'), true);
  assert.equal(canOpenTab('cm_member', 'kam_issues'), true);
});

test('CM lead sees the issue named to them and the CM queue, not other KAMs', () => {
  assert.deepEqual(visibleOpsIssues(cmLead, issues).map((i) => i.issue_id), ['CB-NAMED', 'CB-CMQ']);
});

test('CM member sees the CM queue, and only their own named issues', () => {
  assert.deepEqual(visibleOpsIssues(cmMember, issues).map((i) => i.issue_id), ['CB-CMQ']);
  assert.deepEqual(visibleOpsIssues(cmOther, issues).map((i) => i.issue_id), ['CB-CMQ']);
});

test('a requester does not see the CM queue', () => {
  assert.deepEqual(visibleOpsIssues(requester, issues).map((i) => i.issue_id), ['CB-NAMED']);
});

test('CM users can act only on issues named to them, not on the CM queue', () => {
  assert.equal(canEditKamFeedback(cmLead, issues[0]), true);
  assert.equal(canEditKamFeedback(cmLead, issues[1]), false);
  assert.equal(canEditKamFeedback(cmMember, issues[1]), false);
});
