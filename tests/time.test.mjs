import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

// formatDhaka must give Dhaka wall time no matter the viewer's timezone.
// The check runs in child processes because TZ is fixed when Node starts.
// Use a file URL: a raw Windows path (E:\\...) is read as a URL scheme by dynamic import().
const lib = pathToFileURL(fileURLToPath(new URL('../lib/time.js', import.meta.url))).href;
const probe = `import(${JSON.stringify(lib)}).then(m => {
  process.stdout.write(m.formatDhaka('2026-11-14T14:16:00Z') + '|' + m.isoWeek(new Date('2026-11-14T14:16:00Z')));
});`;

for (const tz of ['Asia/Dhaka', 'UTC', 'America/New_York', 'Europe/London']) {
  test(`formatDhaka shows Dhaka time when TZ=${tz}`, () => {
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', probe], { env: { ...process.env, TZ: tz }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    // 14:16 UTC is 20:16 in Dhaka (UTC+6, no DST).
    assert.equal(r.stdout, '14-Nov-2026 08:16 PM|2026-W46');
  });
}
