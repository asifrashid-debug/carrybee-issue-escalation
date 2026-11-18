import { test } from 'node:test';
import assert from 'node:assert/strict';
import { soundEnabled, setSoundEnabled, freshUnread, playChime, osAlertState } from '../lib/notifySound.js';

function memStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

test('sound defaults to on and mute persists per device', () => {
  const s = memStore();
  assert.equal(soundEnabled(s), true);
  setSoundEnabled(false, s);
  assert.equal(soundEnabled(s), false);
  setSoundEnabled(true, s);
  assert.equal(soundEnabled(s), true);
});

test('a storage that throws falls back to on', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(soundEnabled(broken), true);
  assert.doesNotThrow(() => setSoundEnabled(false, broken));
});

test('freshUnread returns only unread items not already seen', () => {
  const items = [
    { id: 1, read_at: null },
    { id: 2, read_at: '2026-11-18T10:00:00Z' },
    { id: 3, read_at: null },
  ];
  assert.deepEqual(freshUnread(items, new Set([1])).map((n) => n.id), [3]);
  assert.deepEqual(freshUnread(items, new Set()).map((n) => n.id), [1, 3]);
  assert.deepEqual(freshUnread([], new Set()), []);
});

test('no audio context in Node means no chime and no crash', () => {
  assert.equal(playChime(), false);
});

test('OS alerts report unsupported outside a browser', () => {
  assert.equal(osAlertState(), 'unsupported');
});
