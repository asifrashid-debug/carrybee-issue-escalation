import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initials, spanText, sla, pickLine, fbText, hubText, PRI_PILL } from '../lib/trackerCard.mjs';

const NOW = new Date('2026-11-28T06:00:00Z');
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3600e3).toISOString();

test('initials use at most two letters and never a full name', () => {
  assert.equal(initials('asif.rashid@carrybee.com'), 'AR');
  assert.equal(initials(''), '?');
  assert.equal(initials(null), '?');
});

test('spanText: hours below a day, days and hours above', () => {
  assert.equal(spanText(5.4), '5h');
  assert.equal(spanText(-3), '0h');
  assert.equal(spanText(50), '2d 2h');
});

test('sla: no comment after 2h is a breach; comment within the limit is on track', () => {
  assert.deepEqual(sla({ submitted_at: hoursAgo(3) }, NOW).state, 'br');
  const ok = sla({ submitted_at: hoursAgo(1), issue_response_datetime: hoursAgo(0.5), business_pick_time: hoursAgo(0.8), resolution_days: 3 }, NOW);
  assert.equal(ok.state, 'ok');
  assert.match(ok.text, /^Resolve in /);
});

test('sla: resolved ops issue shows Resolved', () => {
  assert.deepEqual(sla({ submitted_at: hoursAgo(100), ops_issue_status: 'Resolved' }, NOW), { state: 'ok', text: 'Resolved' });
});

test('sla: a breached resolution is flagged', () => {
  const r = sla({ submitted_at: hoursAgo(100), issue_response_datetime: hoursAgo(99), business_pick_time: hoursAgo(98), resolution_days: 3, resolution_breach: true }, NOW);
  assert.equal(r.state, 'br');
  assert.match(r.text, /^Resolution overdue/);
});

test('pickLine: only for CM-assigned issues', () => {
  assert.equal(pickLine({ cm_assigned: false }, NOW), null);
  assert.deepEqual(pickLine({ cm_assigned: true, business_pick_time: 'x', pick_missed: false }, NOW), { cls: 'sla-ok', text: 'Picked on time' });
  assert.equal(pickLine({ cm_assigned: true, pick_due_at: new Date(NOW.getTime() + 10 * 60e3).toISOString() }, NOW).text, 'Pick due in 10 min');
});

test('fbText: uses the feedback phase from the API', () => {
  assert.equal(fbText({ feedback_phase: 'escalated' }, NOW).text, 'Feedback failure · Team Lead');
  assert.equal(fbText({ kam_feedback_status: 'Resolved' }, NOW).text, 'Closed · KAM feedback Resolved');
  assert.equal(fbText({ kam_feedback_status: 'Pending' }, NOW).text, 'Feedback: Pending');
});

test('hubText: first layer response, shortened to 90 characters', () => {
  assert.equal(hubText({ layer2_response: '  ok  ' }), 'ok');
  assert.equal(hubText({}), '');
  assert.equal(hubText({ layer1_response: 'x'.repeat(120) }).length, 90);
});

test('priority pills match the main tracker', () => {
  assert.deepEqual(PRI_PILL, { P1: 'p-urg', P2: 'p-crit', P3: 'p-reg', P4: 'p-res' });
});
