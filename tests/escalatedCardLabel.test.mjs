// The tracker card shows where an issue was escalated, right after the KAM/MX channel label in the top row.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../app/page.js', import.meta.url), 'utf8');

test('escalated label is shown once, on the card top row', () => {
  const matches = src.match(/Escalated to \{escalatedLabel\(e\.escalated_to\)\}/g) || [];
  assert.equal(matches.length, 1);
});

test('escalated label sits directly after the channel label', () => {
  assert.match(
    src,
    /\{e\.channel && <span className="muted small">\{e\.channel\}<\/span>\}\s*\n\s*(\{\/\*[^\n]*\*\/\}\s*\n\s*)?\{e\.escalated_to && <span className="pill p-wait"[^>]*>Escalated to \{escalatedLabel\(e\.escalated_to\)\}<\/span>\}/
  );
});
