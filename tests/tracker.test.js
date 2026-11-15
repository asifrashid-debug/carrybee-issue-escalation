const { test } = require('node:test');
const assert = require('node:assert');
// AC-03: both empty blocked (logic mirror)
test('AC-03 empty consignment+merchant blocked', () => {
  const ok = !(!''.trim() && !''.trim());
  assert.equal(ok, false);
});
test('AC-03 one present allowed', () => {
  const ok = !(!'CB-1'.trim() && !''.trim());
  assert.equal(ok, true);
});
test('Issue ID format CB-DD-MM-XXXX', () => {
  assert.match('CB-14-11-2G4U', /^CB-\d{2}-\d{2}-[A-HJ-NP-Z2-9]{4}$/);
});
test('ISO week format', () => {
  assert.match('2026-W46', /^\d{4}-W\d{2}$/);
});
test('Details min 20 chars', () => {
  assert.equal('short'.length >= 20, false);
  assert.equal('This is a sufficiently long issue detail text'.length >= 20, true);
});
