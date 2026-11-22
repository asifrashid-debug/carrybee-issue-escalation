import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RAISED, STATUSES, CLOSED_STATUSES, VALIDATIONS, PICK_WINDOW_MIN, RESOLVE_WINDOW_H, ACTIONS,
  windowsFrom, newIssueLifecycle, applyAction, applyValidation, dueState, planSyncLifecycle,
} from '../lib/opsLifecycle.mjs';

const MIN = 60e3;
const HOUR = 3600e3;
const T0 = new Date('2026-11-22T10:00:00Z');
const at = (ms) => new Date(T0.getTime() + ms);
const EMAIL = 'kam@carrybee.com';

// An issue as the DB returns it, raised at T0.
const raised = (over = {}) => ({
  issue_id: 'CB-22-11-K7P3', issue_status: 'Raised', validation: null,
  raised_at: T0.toISOString(), ...windowsFrom(T0), picked_at: null, closed_at: null,
  ...over,
});

test('statuses are the five the user named, in order', () => {
  assert.deepEqual(STATUSES, ['Raised', 'Picked', 'In Progress', 'Resolved', 'Not Resolved']);
  assert.deepEqual(CLOSED_STATUSES, ['Resolved', 'Not Resolved']);
});

test('validation values match the existing dropdown set', () => {
  assert.deepEqual(VALIDATIONS, ['Valid', 'Invalid', 'Duplicate', 'No proper info']);
});

test('windows: pick 30 minutes and close 24 hours from raise', () => {
  assert.equal(PICK_WINDOW_MIN, 30);
  assert.equal(RESOLVE_WINDOW_H, 24);
  const w = windowsFrom(T0);
  assert.equal(new Date(w.pick_due_at).getTime() - T0.getTime(), 30 * MIN);
  assert.equal(new Date(w.resolve_due_at).getTime() - T0.getTime(), 24 * HOUR);
});

test('a new issue starts at Raised with both windows set', () => {
  const life = newIssueLifecycle(T0);
  assert.equal(life.issue_status, RAISED);
  assert.equal(life.raised_at, T0.toISOString());
  assert.equal(life.pick_due_at, windowsFrom(T0).pick_due_at);
  assert.equal(life.resolve_due_at, windowsFrom(T0).resolve_due_at);
});

test('the flow runs Raised -> Picked -> In Progress -> Resolved, and each step needs the one before', () => {
  let issue = raised();
  const p1 = applyAction(issue, 'pick', EMAIL, at(5 * MIN));
  assert.equal(p1.patch.issue_status, 'Picked');
  assert.equal(p1.patch.picked_at, at(5 * MIN).toISOString());
  assert.equal(p1.patch.picked_by, EMAIL);
  assert.deepEqual(p1.cells, { H: 'Picked' });
  issue = { ...issue, ...p1.patch };

  const p2 = applyAction(issue, 'start', EMAIL, at(10 * MIN));
  assert.equal(p2.patch.issue_status, 'In Progress');
  assert.equal(p2.patch.in_progress_at, at(10 * MIN).toISOString());
  issue = { ...issue, ...p2.patch };

  const p3 = applyAction(issue, 'resolve', EMAIL, at(3 * HOUR));
  assert.equal(p3.patch.issue_status, 'Resolved');
  assert.equal(p3.patch.closed_at, at(3 * HOUR).toISOString());
  assert.equal(p3.patch.closed_by, EMAIL);
  assert.deepEqual(p3.cells, { H: 'Resolved' });
});

test('Not Resolved is also reached from In Progress', () => {
  const issue = raised({ issue_status: 'In Progress', picked_at: at(MIN).toISOString() });
  const p = applyAction(issue, 'not_resolved', EMAIL, at(HOUR));
  assert.equal(p.patch.issue_status, 'Not Resolved');
  assert.equal(p.patch.closed_by, EMAIL);
  assert.deepEqual(p.cells, { H: 'Not Resolved' });
});

test('a status can only move on from the status before it (409 otherwise)', () => {
  const r = applyAction(raised(), 'start', EMAIL, T0);             // Raised cannot go straight to In Progress
  assert.equal(r.status, 409);
  const again = applyAction(raised({ issue_status: 'Picked' }), 'pick', EMAIL, T0); // no second pick
  assert.equal(again.status, 409);
  const early = applyAction(raised({ issue_status: 'Picked' }), 'resolve', EMAIL, T0); // must be In Progress first
  assert.equal(early.status, 409);
  const closed = applyAction(raised({ issue_status: 'Resolved' }), 'not_resolved', EMAIL, T0);
  assert.equal(closed.status, 409);                                 // closed is final
});

test('unknown actions and missing issues are rejected', () => {
  assert.equal(applyAction(raised(), 'delete', EMAIL, T0).status, 400);
  assert.equal(applyAction(raised(), 'constructor', EMAIL, T0).status, 400);
  assert.equal(applyAction(null, 'pick', EMAIL, T0).status, 404);
});

test('rollback restores the values before the action', () => {
  const p = applyAction(raised(), 'pick', EMAIL, at(MIN));
  assert.deepEqual(p.rollback, { issue_status: 'Raised', picked_at: null, picked_by: null });
  const s = applyAction(raised({ issue_status: 'Picked' }), 'start', EMAIL, at(MIN));
  assert.deepEqual(s.rollback, { issue_status: 'Picked', in_progress_at: null });
});

test('ACTIONS keys are the only accepted actions', () => {
  assert.deepEqual(Object.keys(ACTIONS).sort(), ['not_resolved', 'pick', 'resolve', 'start']);
});

test('KAM validation: one of the four values, any time, recorded with who and when', () => {
  const v = applyValidation(raised({ issue_status: 'Resolved' }), 'Valid', EMAIL, at(HOUR));
  assert.equal(v.patch.validation, 'Valid');
  assert.equal(v.patch.validated_at, at(HOUR).toISOString());
  assert.equal(v.patch.validated_by, EMAIL);
  assert.deepEqual(v.cells, { I: 'Valid' });
  assert.equal(applyValidation(raised(), '  Duplicate ', EMAIL, T0).patch.validation, 'Duplicate');
});

test('KAM validation rejects values outside the list, including the blank value', () => {
  assert.equal(applyValidation(raised(), 'Maybe', EMAIL, T0).status, 400);
  assert.equal(applyValidation(raised(), '', EMAIL, T0).status, 400);
  assert.equal(applyValidation(null, 'Valid', EMAIL, T0).status, 404);
});

test('validation rollback restores the previous value', () => {
  const v = applyValidation(raised({ validation: 'Invalid', validated_at: '2026-11-22T09:00:00Z', validated_by: 'x@y' }), 'Valid', EMAIL, T0);
  assert.deepEqual(v.rollback, { validation: 'Invalid', validated_at: '2026-11-22T09:00:00Z', validated_by: 'x@y' });
});

test('pick clock: pending, then overdue after 30 minutes, then picked on time or late', () => {
  assert.equal(dueState(raised(), at(29 * MIN)).pick, 'pick_due');
  assert.equal(dueState(raised(), at(31 * MIN)).pick, 'pick_overdue');
  assert.equal(dueState(raised({ issue_status: 'Picked', picked_at: at(20 * MIN).toISOString() }), at(40 * MIN)).pick, 'picked_on_time');
  assert.equal(dueState(raised({ issue_status: 'Picked', picked_at: at(31 * MIN).toISOString() }), at(40 * MIN)).pick, 'picked_late');
});

test('close clock: due, overdue after 24 hours, then closed on time or late', () => {
  assert.equal(dueState(raised({ issue_status: 'In Progress' }), at(23 * HOUR)).resolve, 'resolve_due');
  assert.equal(dueState(raised({ issue_status: 'In Progress' }), at(25 * HOUR)).resolve, 'resolve_overdue');
  assert.equal(dueState(raised({ issue_status: 'Resolved', closed_at: at(HOUR).toISOString() }), at(30 * HOUR)).resolve, 'closed_on_time');
  assert.equal(dueState(raised({ issue_status: 'Not Resolved', closed_at: at(25 * HOUR).toISOString() }), at(30 * HOUR)).resolve, 'closed_late');
});

test('overdue flag: only for open issues past a window; a closed issue is never overdue', () => {
  assert.equal(dueState(raised(), at(31 * MIN)).overdue, true);
  assert.equal(dueState(raised({ issue_status: 'Resolved', picked_at: at(MIN).toISOString(), closed_at: at(HOUR).toISOString() }), at(30 * HOUR)).overdue, false);
  assert.equal(dueState(raised({ issue_status: 'In Progress', picked_at: at(MIN).toISOString() }), at(25 * HOUR)).overdue, true);
});

test('minutes to pick count down and go negative once overdue', () => {
  assert.equal(dueState(raised(), at(10 * MIN)).minutesToPick, 20);
  assert.equal(dueState(raised(), at(40 * MIN)).minutesToPick, -10);
});

test('an issue with no raise time has no windows', () => {
  const d = dueState({ issue_status: 'New', raised_at: null }, T0);
  assert.equal(d.pick, 'n/a');
  assert.equal(d.resolve, 'n/a');
  assert.equal(d.overdue, false);
});

test('sync: a new row starts at Raised whatever the sheet says, and the sheet cell is corrected', () => {
  const p = planSyncLifecycle({ dbRow: null, sheet: { issue_status: 'Resolved', validation: '' }, now: T0 });
  assert.equal(p.isNew, true);
  assert.equal(p.insert.issue_status, 'Raised');
  assert.deepEqual(p.sheetCells, { H: 'Raised' });
});

test('sync: a new row already showing Raised needs no sheet write', () => {
  const p = planSyncLifecycle({ dbRow: null, sheet: { issue_status: 'Raised', validation: '' }, now: T0 });
  assert.deepEqual(p.sheetCells, {});
});

test('sync: for an existing row the DB status wins; a changed sheet cell is rewritten from the DB', () => {
  const p = planSyncLifecycle({
    dbRow: { issue_status: 'Picked', validation: 'Valid', created_at: T0.toISOString() },
    sheet: { issue_status: 'Raised', validation: 'Invalid' },
    now: at(HOUR),
  });
  assert.equal(p.isNew, false);
  assert.equal(p.status, 'Picked');
  assert.equal(p.validation, 'Valid');
  assert.deepEqual(p.sheetCells, { H: 'Picked', I: 'Valid' });
  assert.equal(p.backfill, null);
});

test('sync: a blank sheet cell is filled from the DB, and a matching cell is left alone', () => {
  const p = planSyncLifecycle({
    dbRow: { issue_status: 'In Progress', validation: null, created_at: T0.toISOString() },
    sheet: { issue_status: 'In Progress', validation: '' },
    now: at(HOUR),
  });
  assert.deepEqual(p.sheetCells, {});
});

test('sync: an old row with no status is backfilled with windows from its created_at', () => {
  const p = planSyncLifecycle({
    dbRow: { issue_status: null, validation: null, created_at: T0.toISOString() },
    sheet: { issue_status: '', validation: '' },
    now: at(HOUR),
  });
  assert.equal(p.backfill.issue_status, 'Raised');
  assert.equal(p.backfill.raised_at, T0.toISOString());
  assert.equal(p.backfill.pick_due_at, windowsFrom(T0).pick_due_at);
  assert.equal(p.status, 'Raised');
});
