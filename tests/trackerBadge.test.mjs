import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasLayerResponse, layerFingerprint, viewerKamNames, isNamedToViewer, trackerItems,
  unseenTrackerItems, trackerSeenKey, parseSeenMap, withSeen,
} from '../lib/trackerBadge.mjs';

const mxRaiser = { email: 'mx.one@carrybee.com', role: 'mx', display_name: 'MX One', kam_aliases: [] };
const cm = { email: 'cm.one@carrybee.com', role: 'cm_member', display_name: 'CM One', kam_aliases: [] };
const kam = { email: 'kam.one@carrybee.com', role: 'requester', display_name: 'Nadia Noor', kam_aliases: ['NN'] };
const lead = { email: 'lead@carrybee.com', role: 'team_lead', display_name: 'Team Lead', kam_aliases: [] };

const esc = (over = {}) => ({
  issue_id: 'CB-1', email: 'other@carrybee.com', channel: 'MX', kam_name: 'Someone Else',
  cm_owner_email: null, layer1_response: null, layer2_response: null, layer3_response: null, ...over,
});

test('a layer response is any non-blank Layer 1, 2 or 3 response', () => {
  assert.equal(hasLayerResponse(esc()), false);
  assert.equal(hasLayerResponse(esc({ layer1_response: '   ' })), false);
  assert.equal(hasLayerResponse(esc({ layer1_response: 'checked' })), true);
  assert.equal(hasLayerResponse(esc({ layer3_response: 'final check' })), true);
});

test('fingerprint changes when a layer response changes, and not when it is the same', () => {
  const a = layerFingerprint(esc({ layer1_response: 'checked' }));
  assert.equal(a, layerFingerprint(esc({ layer1_response: ' checked ' })));
  assert.notEqual(a, layerFingerprint(esc({ layer1_response: 'checked', layer2_response: 'escalated' })));
});

test('viewer KAM names come from display name and aliases, not the CM placeholder', () => {
  assert.deepEqual(viewerKamNames(kam), ['nadia noor', 'nn']);
  assert.deepEqual(viewerKamNames({ display_name: 'CM', kam_aliases: [] }), []);
});

test('the MX raiser is named on their own MX issue', () => {
  assert.equal(isNamedToViewer(esc({ email: 'MX.One@carrybee.com' }), mxRaiser), true);
});

test('the CM owner is named; another CM is not', () => {
  const e = esc({ cm_owner_email: 'cm.one@carrybee.com' });
  assert.equal(isNamedToViewer(e, cm), true);
  assert.equal(isNamedToViewer(e, { ...cm, email: 'cm.two@carrybee.com' }), false);
});

test('a KAM is named by the KAM name on an MX issue, case and spacing ignored', () => {
  assert.equal(isNamedToViewer(esc({ kam_name: '  nadia   NOOR ' }), kam), true);
  assert.equal(isNamedToViewer(esc({ kam_name: 'NN' }), kam), true);
  assert.equal(isNamedToViewer(esc({ kam_name: 'Someone Else' }), kam), false);
});

test('a KAM name on a non-MX issue does not name the viewer', () => {
  assert.equal(isNamedToViewer(esc({ channel: 'KAM', kam_name: 'NN' }), kam), false);
});

test('a team lead is a KAM too: named by their own KAM name, not by a teammate\'s', () => {
  assert.equal(isNamedToViewer(esc({ kam_name: 'Team Lead' }), lead), true);
  assert.equal(isNamedToViewer(esc({ kam_name: 'Someone Else' }), lead), false);
});

test('only named issues with a layer response become badge items', () => {
  const escs = [
    esc({ issue_id: 'CB-2', email: mxRaiser.email, layer1_response: 'ok' }),
    esc({ issue_id: 'CB-3', email: mxRaiser.email }),
    esc({ issue_id: 'CB-4', email: 'x@carrybee.com', layer2_response: 'ok' }),
    esc({ issue_id: 'CB-5', channel: 'KAM', email: mxRaiser.email, layer1_response: 'ok' }),
  ];
  assert.deepEqual(trackerItems(escs, mxRaiser).map((i) => i.issue_id), ['CB-2']);
});

test('seen per issue: opening clears it, a new layer response brings it back', () => {
  const first = trackerItems([esc({ issue_id: 'CB-7', email: mxRaiser.email, layer1_response: 'a' })], mxRaiser);
  assert.equal(unseenTrackerItems(first, {}).length, 1);

  const seen = withSeen({}, 'CB-7', first[0].fingerprint);
  assert.equal(unseenTrackerItems(first, seen).length, 0);

  const later = trackerItems([esc({ issue_id: 'CB-7', email: mxRaiser.email, layer1_response: 'a', layer2_response: 'b' })], mxRaiser);
  assert.equal(unseenTrackerItems(later, seen).length, 1);
});

test('seen state for one issue does not clear another', () => {
  const items = trackerItems([
    esc({ issue_id: 'CB-8', email: mxRaiser.email, layer1_response: 'a' }),
    esc({ issue_id: 'CB-9', email: mxRaiser.email, layer1_response: 'b' }),
  ], mxRaiser);
  const seen = withSeen({}, 'CB-8', items[0].fingerprint);
  assert.deepEqual(unseenTrackerItems(items, seen).map((i) => i.issue_id), ['CB-9']);
});

test('seen key is per viewer; parseSeenMap ignores bad values', () => {
  assert.equal(trackerSeenKey('MX.One@Carrybee.com'), 'cb-tracker-seen:mx.one@carrybee.com');
  assert.deepEqual(parseSeenMap('{"CB-1":"ab","CB-2":5}'), { 'CB-1': 'ab' });
  assert.deepEqual(parseSeenMap('[1,2]'), {});
  assert.deepEqual(parseSeenMap('nope'), {});
  assert.deepEqual(parseSeenMap(null), {});
});
