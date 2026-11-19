// Tests for lib/hubLookup.mjs: validation, message filtering, hub matching, and the request round trip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidParcelId, isAcceptedMessage, matchActiveHub, requestHubLookup, pingExtension, serverHubLookupClient,
  isIOSDevice, isMobileAgent, TIMEOUT_MESSAGE, NO_UNIQUE_MATCH_MESSAGE,
  NO_HUB_SUGGESTION_MESSAGE, DESKTOP_NO_HUB_SUGGESTION_MESSAGE,
} from '../lib/hubLookup.mjs';

const ORIGIN = 'https://carrybee-escalation-tracker.vercel.app';

// A window-like object. postMessage delivers asynchronously to every listener, like a real window.
class FakeWindow {
  constructor(origin) { this.origin = origin; this.listeners = new Set(); this.posted = []; }
  addEventListener(type, fn) { if (type === 'message') this.listeners.add(fn); }
  removeEventListener(type, fn) { if (type === 'message') this.listeners.delete(fn); }
  postMessage(data, targetOrigin) {
    this.posted.push({ data, targetOrigin });
    setTimeout(() => this.deliver({ data, source: this, origin: this.origin }), 0);
  }
  deliver(event) { [...this.listeners].forEach((fn) => fn(event)); }
}

// Plays the extension's content script: answers PING, and answers REQUEST with the given reply.
function installExtension(win, reply) {
  win.addEventListener('message', (event) => {
    const d = event.data;
    if (!d || event.source !== win) return;
    if (d.type === 'CARRYBEE_HUB_PING') {
      win.postMessage({ type: 'CARRYBEE_HUB_PONG', requestId: d.requestId }, ORIGIN);
    }
    if (d.type === 'CARRYBEE_HUB_LOOKUP_REQUEST' && reply) {
      const r = reply(d);
      if (r !== null) win.postMessage({ type: 'CARRYBEE_HUB_LOOKUP_RESPONSE', requestId: d.requestId, ...r }, ORIGIN);
    }
  });
}

test('valid Consignment IDs: letters, numbers, dash, underscore, 1 to 80 characters', () => {
  for (const ok of ['CB-2026110845', '10948271', 'a_b-9', 'x', 'a'.repeat(80), ' CB-1 ']) {
    assert.equal(isValidParcelId(ok), true, JSON.stringify(ok));
  }
});

test('invalid Consignment IDs: empty, spaces inside, symbols, too long, non-string', () => {
  for (const bad of ['', '   ', 'bad id!', 'CB 1', 'CB/1', 'a'.repeat(81), null, undefined, 12345678]) {
    assert.equal(isValidParcelId(bad), false, String(bad));
  }
});

test('matchActiveHub: one active hub matches, ignoring case and surrounding spaces', () => {
  const hubs = [
    { hub_name: 'Comilla-Daudkandi', zone: 'CTG', is_active: true },
    { hub_name: 'Dhaka-Mirpur', zone: 'ISD', is_active: true },
  ];
  const r = matchActiveHub('  comilla-DAUDKANDI ', hubs);
  assert.equal(r.status, 'unique');
  assert.equal(r.hub.hub_name, 'Comilla-Daudkandi');
});

test('matchActiveHub: inactive hubs are never matched', () => {
  const hubs = [{ hub_name: 'Old Hub', zone: 'CTG', is_active: false }];
  assert.equal(matchActiveHub('Old Hub', hubs).status, 'none');
});

test('matchActiveHub: duplicate hub match is not guessed', () => {
  const hubs = [
    { hub_name: 'Dhaka', zone: 'ISD', is_active: true },
    { hub_name: 'dhaka', zone: 'ISD', is_active: true },
  ];
  const r = matchActiveHub('DHAKA', hubs);
  assert.equal(r.status, 'multiple');
  assert.equal(r.matches.length, 2);
  assert.equal(r.hub, undefined);
});

test('matchActiveHub: no match, empty text, and no hub list all return none', () => {
  const hubs = [{ hub_name: 'Comilla-Daudkandi', zone: 'CTG', is_active: true }];
  assert.equal(matchActiveHub('Nowhere Hub', hubs).status, 'none');
  assert.equal(matchActiveHub('   ', hubs).status, 'none');
  assert.equal(matchActiveHub('Comilla-Daudkandi', undefined).status, 'none');
  // Spacing inside the name is not normalised: "Comilla Daudkandi" is not a match.
  assert.equal(matchActiveHub('Comilla Daudkandi', hubs).status, 'none');
});

test('isAcceptedMessage: rejects other sources, other origins, other requestIds, and other types', () => {
  const win = new FakeWindow(ORIGIN);
  const other = new FakeWindow(ORIGIN);
  const opts = { win, origin: ORIGIN, requestId: 'req-1', type: 'CARRYBEE_HUB_LOOKUP_RESPONSE' };
  const good = { type: 'CARRYBEE_HUB_LOOKUP_RESPONSE', requestId: 'req-1', hub: 'X' };
  assert.equal(isAcceptedMessage({ source: win, origin: ORIGIN, data: good }, opts), true);
  assert.equal(isAcceptedMessage({ source: other, origin: ORIGIN, data: good }, opts), false, 'wrong source');
  assert.equal(isAcceptedMessage({ source: win, origin: 'https://evil.example', data: good }, opts), false, 'wrong origin');
  assert.equal(isAcceptedMessage({ source: win, origin: ORIGIN, data: { ...good, requestId: 'req-2' } }, opts), false, 'wrong requestId');
  assert.equal(isAcceptedMessage({ source: win, origin: ORIGIN, data: { ...good, type: 'OTHER' } }, opts), false, 'wrong type');
  assert.equal(isAcceptedMessage({ source: win, origin: ORIGIN, data: null }, opts), false, 'no data');
});

test('requestHubLookup: returns the hub text from the extension', async () => {
  const win = new FakeWindow(ORIGIN);
  installExtension(win, () => ({ hub: 'Comilla-Daudkandi' }));
  const r = await requestHubLookup('CB-2026110845', { win, origin: ORIGIN });
  assert.deepEqual(r, { kind: 'hub', hub: 'Comilla-Daudkandi' });
});

test('requestHubLookup: sends the trimmed parcelId and a fresh requestId each time', async () => {
  const win = new FakeWindow(ORIGIN);
  installExtension(win, () => ({ hub: 'X' }));
  await requestHubLookup('  CB-1  ', { win, origin: ORIGIN });
  await requestHubLookup('CB-2', { win, origin: ORIGIN });
  const requests = win.posted.filter((p) => p.data.type === 'CARRYBEE_HUB_LOOKUP_REQUEST');
  assert.equal(requests.length, 2);
  assert.equal(requests[0].data.parcelId, 'CB-1');
  assert.equal(requests[1].data.parcelId, 'CB-2');
  assert.notEqual(requests[0].data.requestId, requests[1].data.requestId);
  assert.equal(requests[0].targetOrigin, ORIGIN);
});

test('requestHubLookup: extension error is returned as the message', async () => {
  const win = new FakeWindow(ORIGIN);
  installExtension(win, () => ({ error: 'Log in to Hive in this Chrome first, then try again.' }));
  const r = await requestHubLookup('CB-2026110845', { win, origin: ORIGIN });
  assert.equal(r.kind, 'error');
  assert.match(r.message, /Log in to Hive/);
});

test('requestHubLookup: no extension answering the ping is reported as missing', async () => {
  const win = new FakeWindow(ORIGIN);
  const r = await requestHubLookup('CB-2026110845', { win, origin: ORIGIN, pingTimeoutMs: 50 });
  assert.deepEqual(r, { kind: 'missing' });
  assert.equal(win.listeners.size, 0, 'listener removed after the ping timed out');
});

test('requestHubLookup: no answer to the request times out', async () => {
  const win = new FakeWindow(ORIGIN);
  installExtension(win, () => null); // answers the ping, never answers the request
  const before = win.listeners.size; // includes the fake extension's own listener
  const r = await requestHubLookup('CB-2026110845', { win, origin: ORIGIN, timeoutMs: 80 });
  assert.deepEqual(r, { kind: 'timeout' });
  assert.equal(win.listeners.size, before, 'the lookup listener is removed after timeout');
  assert.equal(TIMEOUT_MESSAGE, 'Lookup timed out. Select the hub manually.');
});

test('requestHubLookup: spoofed and stale responses are ignored', async () => {
  const win = new FakeWindow(ORIGIN);
  const attacker = new FakeWindow('https://evil.example');
  installExtension(win, (req) => {
    // A response from another source with the right requestId, a response with a wrong requestId,
    // then the real response. Only the real one may be used.
    attacker.origin = ORIGIN;
    setTimeout(() => attacker.deliver({ source: attacker, origin: ORIGIN, data: { type: 'CARRYBEE_HUB_LOOKUP_RESPONSE', requestId: req.requestId, hub: 'Spoofed Hub' } }), 0);
    win.deliver({ source: win, origin: ORIGIN, data: { type: 'CARRYBEE_HUB_LOOKUP_RESPONSE', requestId: 'stale-id', hub: 'Stale Hub' } });
    return { hub: 'Real Hub' };
  });
  const r = await requestHubLookup('CB-2026110845', { win, origin: ORIGIN });
  assert.deepEqual(r, { kind: 'hub', hub: 'Real Hub' });
});

test('requestHubLookup: a response from the wrong origin is ignored, so the request times out', async () => {
  const win = new FakeWindow(ORIGIN);
  win.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'CARRYBEE_HUB_PING') win.postMessage({ type: 'CARRYBEE_HUB_PONG', requestId: event.data.requestId }, ORIGIN);
    if (event.data && event.data.type === 'CARRYBEE_HUB_LOOKUP_REQUEST') {
      // Same window, but the event origin is not this page's origin.
      win.deliver({ source: win, origin: 'https://evil.example', data: { type: 'CARRYBEE_HUB_LOOKUP_RESPONSE', requestId: event.data.requestId, hub: 'Wrong Origin Hub' } });
    }
  });
  const r = await requestHubLookup('CB-2026110845', { win, origin: ORIGIN, timeoutMs: 80 });
  assert.deepEqual(r, { kind: 'timeout' });
});

test('requestHubLookup: an invalid Consignment ID is rejected without contacting the extension', async () => {
  const win = new FakeWindow(ORIGIN);
  const r = await requestHubLookup('bad id!', { win, origin: ORIGIN });
  assert.equal(r.kind, 'error');
  assert.equal(win.posted.length, 0);
});

test('pingExtension: true when the extension answers with the same requestId', async () => {
  const win = new FakeWindow(ORIGIN);
  installExtension(win, null);
  assert.equal(await pingExtension({ win, origin: ORIGIN, timeoutMs: 200 }), true);
});

test('pingExtension: false when nothing answers', async () => {
  const win = new FakeWindow(ORIGIN);
  assert.equal(await pingExtension({ win, origin: ORIGIN, timeoutMs: 30 }), false);
});

test('unique and no-match messages match the spec wording', () => {
  assert.equal(NO_UNIQUE_MATCH_MESSAGE, "Couldn't match this hub uniquely. Select manually.");
});

test('isIOSDevice: only iPhone/iPad/iPod UAs (Android and laptops keep the extension path)', () => {
  assert.equal(isIOSDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'), true);
  assert.equal(isIOSDevice('Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'), true);
  assert.equal(isIOSDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15', 'MacIntel', 5), true);
  assert.equal(isIOSDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15', 'MacIntel', 1), false);
  assert.equal(isIOSDevice('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Mobile Safari/537.36 Chrome/120.0'), false);
  assert.equal(isIOSDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36'), false);
  assert.equal(isIOSDevice(''), false);
  assert.equal(isIOSDevice(undefined), false);
});

test('isMobileAgent: phones are mobile and desktop browsers are not', () => {
  assert.equal(isMobileAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Mobile/15E148'), true);
  assert.equal(isMobileAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36'), true);
  assert.equal(isMobileAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 'MacIntel', 5), true);
  assert.equal(isMobileAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0'), false);
});

test('no-hub messages are accurate, and desktop still offers the Chrome extension', () => {
  assert.ok(!/device/i.test(NO_HUB_SUGGESTION_MESSAGE));
  assert.ok(/no hub suggestion found/i.test(NO_HUB_SUGGESTION_MESSAGE));
  assert.ok(/check the id/i.test(NO_HUB_SUGGESTION_MESSAGE));
  assert.ok(/select the concern hub/i.test(NO_HUB_SUGGESTION_MESSAGE));
  assert.ok(/extension/i.test(DESKTOP_NO_HUB_SUGGESTION_MESSAGE));
});

// Stub the global fetch the way the browser provides it, and restore it afterwards.
function stubFetch(impl) {
  const real = globalThis.fetch;
  globalThis.fetch = impl;
  return () => { globalThis.fetch = real; };
}

test('serverHubLookupClient: valid ID posts to /api/hub-lookup and returns the hub with its source', async () => {
  const calls = [];
  const stop = stubFetch(async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, json: async () => ({ ok: true, hub: '  Dhaka ', source: 'history', history_at: '2026-11-08T06:00:00Z' }) };
  });
  try {
    const r = await serverHubLookupClient('CB-2026110899');
    assert.deepEqual(r, { kind: 'hub', hub: 'Dhaka', source: 'history', history_at: '2026-11-08T06:00:00Z' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/hub-lookup');
    assert.equal(calls[0].opts.method, 'POST');
    assert.equal(calls[0].opts.body, JSON.stringify({ consignment_id: 'CB-2026110899' }));
  } finally { stop(); }
});

test('serverHubLookupClient: no hub in the response is kind none', async () => {
  const stop = stubFetch(async () => ({ ok: true, json: async () => ({ ok: true, hub: null, source: null }) }));
  try {
    assert.deepEqual(await serverHubLookupClient('CB-1'), { kind: 'none' });
  } finally { stop(); }
});

test('serverHubLookupClient: server error and failed request become kind error, never a rejection', async () => {
  let stop = stubFetch(async () => ({ ok: false, json: async () => ({ error: 'boom' }) }));
  try {
    assert.deepEqual(await serverHubLookupClient('CB-2'), { kind: 'error', message: 'boom' });
  } finally { stop(); }
  stop = stubFetch(async () => { throw new Error('offline'); });
  try {
    assert.deepEqual(await serverHubLookupClient('CB-3'), { kind: 'error', message: 'Hub lookup failed.' });
  } finally { stop(); }
});

test('serverHubLookupClient: invalid ID is rejected before any network call', async () => {
  let called = false;
  const stop = stubFetch(async () => { called = true; return { ok: true, json: async () => ({}) }; });
  try {
    const r = await serverHubLookupClient('bad id!');
    assert.equal(r.kind, 'error');
    assert.equal(called, false);
  } finally { stop(); }
});
