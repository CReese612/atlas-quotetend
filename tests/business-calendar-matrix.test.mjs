// Runs the frozen-instant business-calendar tests in four separate processes, one per machine time zone. The expected
// values inside business-calendar.test.mjs are identical in every run: the Oregon business day must not depend on the
// zone of the server or the developer's computer. Each child proves the zone really changed before it asserts anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const ZONES = ['America/Los_Angeles', 'America/Chicago', 'UTC', 'Pacific/Kiritimati'];
for (const zone of ZONES) test(`business-calendar tests pass in a ${zone} process`, async () => {
  const env = { ...process.env, QUOTETEND_TEST_TZ: zone };
  delete env.NODE_TEST_CONTEXT; // a nested run must report on its own, not into this runner
  const { stdout, stderr } = await promisify(execFile)(process.execPath, ['--test', '--test-reporter=spec', 'tests/business-calendar.test.mjs'], { env, timeout: 120_000 })
    .catch(error => { assert.fail(`${zone}: ${error.stdout || ''}${error.stderr || ''}`.slice(-4000)); });
  assert.match(stdout, /ℹ fail 0/, zone + '\n' + stderr);
  assert.match(stdout, new RegExp(`runs in ${zone.replace('/', '\\/')}|the process really runs in ${zone.replace('/', '\\/')}`), 'the zone check ran: ' + zone);
  assert.doesNotMatch(stdout, /ℹ tests 0\b/);
});
