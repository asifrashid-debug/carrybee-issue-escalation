import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issueClock, followupPlan } from '../lib/sla.js';

const H = 3600e3;
const raised = new Date('2026-11-14T06:00:00Z');
const at = (h) => new Date(raised.getTime() + h * H);
const issue = (extra = {}) => ({ submitted_at: raised.toISOString(), issue_status: 'Open', issue_pick_time: null, issue_response_datetime: null, ...extra });

test('comment breach after 2h with no comment, not before', () => {
  assert.equal(issueClock(issue(), at(1.9)).commentBreach, false);
  assert.equal(issueClock(issue(), at(2.1)).commentBreach, true);
  assert.equal(issueClock(issue({ issue_response_datetime: at(1).toISOString() }), at(5)).commentBreach, false);
  assert.equal(issueClock(issue({ issue_status: 'Closed' }), at(5)).commentBreach, false);
});

test('KAM followup available until 2.5h, only before pick', () => {
  assert.equal(followupPlan(issue(), [], at(2)).kam.available, true);
  assert.equal(followupPlan(issue(), [], at(2.6)).kam.available, false);
  assert.equal(followupPlan(issue({ issue_pick_time: at(1).toISOString() }), [], at(1.5)).kam.available, false);
});

test('CM followups lock until pick, then chain 2.5h / +2h / +2h', () => {
  const pickAt = at(1);
  const p = followupPlan(issue({ issue_pick_time: pickAt.toISOString() }), [], at(1.5));
  assert.equal(p.cm[0].status, 'due');
  assert.equal(new Date(p.cm[0].dueAt).getTime(), pickAt.getTime() + 2.5 * H);
  assert.equal(new Date(p.cm[1].dueAt).getTime(), pickAt.getTime() + 4.5 * H);
  assert.equal(new Date(p.cm[2].dueAt).getTime(), pickAt.getTime() + 6.5 * H);
  const notPicked = followupPlan(issue(), [], at(1));
  assert.ok(notPicked.cm.every((c) => c.status === 'locked' && !c.unlocked));
});

test('overdue follow-up and sequential completion', () => {
  const pick = { issue_pick_time: at(1).toISOString() };
  const late = followupPlan(issue(pick), [], at(5));
  assert.equal(late.cm[0].status, 'overdue');
  assert.equal(late.cm[1].status, 'waiting');
  const after1 = followupPlan(issue(pick), [{ level: 1, done_at: at(3).toISOString() }], at(5));
  assert.equal(after1.cm[0].status, 'done');
  assert.equal(after1.cm[1].status, 'due'); // 2nd due at pick+4.5h = 5.5h, so at 5h it is still due
});
