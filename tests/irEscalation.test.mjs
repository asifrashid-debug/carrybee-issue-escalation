import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  IR_HEADERS, IR_STATUSES, routesFromBody, routeError, attachmentError, cleanMailSubject,
  attachmentZipName, irSlaCell, irTargetsFromEnv, irStatusStamps, irRowFromEsc, irSlaCells,
} from '../lib/irEscalation.mjs';

test('IR sheet has the 18 headers in the agreed order', () => {
  assert.equal(IR_HEADERS.length, 18);
  assert.equal(IR_HEADERS[0], 'Issue ID');
  assert.equal(IR_HEADERS[8], 'Mail Subject Line');
  assert.equal(IR_HEADERS[10], 'Drive Link');
  assert.equal(IR_HEADERS[11], 'Status From KAM');
  assert.equal(IR_HEADERS[15], 'IR Status');
  assert.equal(IR_HEADERS[17], 'IR Resolve SLA');
});

test('IR status list has the four dropdown values', () => {
  assert.deepEqual(IR_STATUSES, ['Open', 'Picked', 'In Progress', 'Resolved']);
});

test('KAM routing comes from the three boxes; MX always goes to the hub sheet', () => {
  assert.deepEqual(routesFromBody({ route_hub: true, route_ir: true }, 'KAM'), { hub: true, ir: true, sort_tnl: false });
  assert.deepEqual(routesFromBody({}, 'KAM'), { hub: false, ir: false, sort_tnl: false });
  assert.deepEqual(routesFromBody({ route_ir: false }, 'MX'), { hub: true, ir: false, sort_tnl: false });
});

test('at least one box must be ticked', () => {
  assert.match(routeError({ hub: false, ir: false, sort_tnl: false }), /Tick at least one/);
  assert.equal(routeError({ hub: false, ir: false, sort_tnl: true }), null);
  assert.equal(routeError({ hub: true, ir: true, sort_tnl: false }), null);
});

test('attachments are only accepted for IR, with a file count and size cap', () => {
  const small = [{ size: 1000 }];
  assert.equal(attachmentError({ hub: true, ir: false, sort_tnl: false }, []), null);
  assert.match(attachmentError({ hub: true, ir: false, sort_tnl: false }, small), /only accepted when the IR box/);
  assert.equal(attachmentError({ hub: false, ir: true, sort_tnl: false }, small), null);
  assert.match(attachmentError({ hub: false, ir: true, sort_tnl: false }, Array(11).fill({ size: 1 })), /at most 10/);
  assert.match(attachmentError({ hub: false, ir: true, sort_tnl: false }, [{ size: 21 * 1024 * 1024 }]), /20 MB/);
});

test('mail subject is optional, trimmed and capped at 200 characters', () => {
  assert.equal(cleanMailSubject('   '), null);
  assert.equal(cleanMailSubject(undefined), null);
  assert.equal(cleanMailSubject('  Late COD  '), 'Late COD');
  assert.equal(cleanMailSubject('x'.repeat(300)).length, 200);
});

test('zip name follows the Issue ID', () => {
  assert.equal(attachmentZipName('CB-25-11-ABCD'), 'CB-25-11-ABCD_attachments.zip');
});

test('SLA cells: Pending until the status is reached, No SLA set without a target', () => {
  const raised = '2026-11-14T06:00:00Z';
  assert.equal(irSlaCell(raised, null, 2), 'Pending');
  assert.equal(irSlaCell(raised, '2026-11-14T07:00:00Z', null), 'No SLA set');
  assert.equal(irSlaCell(raised, '2026-11-14T07:00:00Z', undefined), 'No SLA set');
});

test('SLA cells: within or breached against the target hours (clock hours)', () => {
  const raised = '2026-11-14T06:00:00Z';
  assert.equal(irSlaCell(raised, '2026-11-14T07:59:00Z', 2), 'Within SLA');
  assert.equal(irSlaCell(raised, '2026-11-14T08:01:00Z', 2), 'Breached');
  assert.equal(irSlaCell(raised, '2026-11-15T06:00:00Z', 24), 'Within SLA');
});

test('targets come from the environment and stay null when unset', () => {
  assert.deepEqual(irTargetsFromEnv({}), { pickHours: null, resolveHours: null });
  assert.deepEqual(irTargetsFromEnv({ IR_PICK_SLA_HOURS: '2', IR_RESOLVE_SLA_HOURS: '48' }), { pickHours: 2, resolveHours: 48 });
});

test('only Picked stamps the pick time, and only the first time', () => {
  const now = '2026-11-14T09:00:00Z';
  assert.deepEqual(irStatusStamps({}, 'Open', now), { ir_resolved_at: null });
  assert.deepEqual(irStatusStamps({}, 'Picked', now), { ir_picked_at: now, ir_resolved_at: null });
  assert.deepEqual(irStatusStamps({ ir_picked_at: '2026-11-14T08:00:00Z' }, 'Picked', now), { ir_resolved_at: null });
  assert.deepEqual(irStatusStamps({}, 'In Progress', now), { ir_resolved_at: null });
  assert.deepEqual(irStatusStamps({}, 'Resolved', now), { ir_resolved_at: now });
});

test('Resolved stamps the resolve time, keeps the first one, and clears it when the status moves away', () => {
  const now = '2026-11-14T09:00:00Z';
  assert.deepEqual(irStatusStamps({ ir_picked_at: 'p' }, 'Resolved', now), { ir_resolved_at: now });
  assert.deepEqual(irStatusStamps({ ir_picked_at: 'p', ir_resolved_at: 'r' }, 'Resolved', now), { ir_resolved_at: 'r' });
  assert.deepEqual(irStatusStamps({ ir_resolved_at: 'r' }, 'In Progress', now), { ir_resolved_at: null });
});

test('skipping Picked leaves the pick SLA Pending', () => {
  const e = { submitted_at: '2026-11-14T06:00:00Z', ir_picked_at: null, ir_resolved_at: '2026-11-14T08:00:00Z' };
  assert.deepEqual(irSlaCells(e, { IR_PICK_SLA_HOURS: '2', IR_RESOLVE_SLA_HOURS: '24' }), { pick: 'Pending', resolve: 'Within SLA' });
});

test('IR row has 18 values in header order, with the form fields in 1-10', () => {
  const e = {
    issue_id: 'CB-25-11-ABCD', submitted_at: '2026-11-14T06:00:00Z', consignment_id: 'CB-2026110899',
    merchant_name: null, concern_hub: 'Mirpur Hub', zone: 'OSD', issue_category: 'Delivery', issue_sub_category: 'Late',
    mail_subject: 'Late parcel', issue_details: 'x'.repeat(20), drive_link: 'https://drive.google.com/file/d/1',
    ir_status: 'Picked',
  };
  const row = irRowFromEsc(e, { pick: 'Within SLA', resolve: 'Pending' });
  assert.equal(row.length, IR_HEADERS.length);
  assert.equal(row[0], 'CB-25-11-ABCD');
  assert.equal(row[2], 'CB-2026110899');
  assert.equal(row[3], '');
  assert.equal(row[8], 'Late parcel');
  assert.equal(row[10], 'https://drive.google.com/file/d/1');
  assert.equal(row[15], 'Picked');
  assert.equal(row[16], 'Within SLA');
  assert.equal(row[17], 'Pending');
});

test('irSlaCells reads targets from the given environment', () => {
  const e = { submitted_at: '2026-11-14T06:00:00Z', ir_picked_at: '2026-11-14T06:30:00Z', ir_resolved_at: null };
  assert.deepEqual(irSlaCells(e, {}), { pick: 'No SLA set', resolve: 'Pending' });
  assert.deepEqual(irSlaCells(e, { IR_PICK_SLA_HOURS: '1', IR_RESOLVE_SLA_HOURS: '24' }), { pick: 'Within SLA', resolve: 'Pending' });
});
