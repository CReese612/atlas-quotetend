// Sprint 3A.2: the frozen-clock BROWSER scenarios must stay valid as the real calendar advances. These unit tests simulate
// "the test is run on day X" for thousands of X and check the scenario generator (tests/helpers/future-scenarios.mjs):
// every instant is far enough ahead for Chromium's real-clock cookie expiry, still demonstrates the calendar condition
// it is named for, and agrees with an Intl-based cross-check. No browser is needed, so a decaying fixture fails here first.
import './helpers/set-timezone.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { futureScenarios, assertCookieStaysValid, FixtureClockError, pacificDay, chicagoDay, plusDays, shortDay, HOUR, MIN_LEAD, SESSION_LIFETIME } from './helpers/future-scenarios.mjs';

const intlDay = (ms, timeZone) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(ms).map(x => [x.type, x.value])); return `${p.year}-${p.month}-${p.day}`; };
const start = Date.parse('2026-10-15T00:00:00Z'), end = Date.parse('2033-01-01T00:00:00Z');

test('whatever day the suite runs, every browser scenario is in the future with a cookie that stays valid', () => {
  for (let now = start; now < end; now += 6 * HOUR) {
    const scenarios = futureScenarios(now);
    assert.equal(scenarios.length, 4);
    for (const s of scenarios) {
      assert.ok(s.ms >= now + MIN_LEAD, `${s.label} at run time ${new Date(now).toISOString()}`);
      assert.ok(s.ms < now + 400 * 24 * HOUR, 'the nearest occurrence is used, not an arbitrary far date');
      assert.doesNotThrow(() => assertCookieStaysValid(s.ms, now));
      assert.ok(s.ms + SESSION_LIFETIME > now + HOUR);
    }
  }
});

test('each scenario still demonstrates the calendar condition it is named for, on every run date', () => {
  const seen = new Set();
  for (let now = start; now < end; now += 6 * HOUR) {
    const [chicago, midnight, spring, fall] = futureScenarios(now);
    if (seen.has(chicago.ms + ':' + midnight.ms + ':' + spring.ms + ':' + fall.ms)) continue; seen.add(chicago.ms + ':' + midnight.ms + ':' + spring.ms + ':' + fall.ms);
    // Oregon is still on the 14th-style "today" while Chicago and UTC are already on the next day.
    assert.equal(chicago.chicagoDay, plusDays(chicago.today, 1), 'Chicago is a day ahead of Oregon');
    assert.equal(chicago.now.slice(0, 10), plusDays(chicago.today, 1), 'so is UTC');
    assert.equal(pacificDay(chicago.ms), chicago.today);
    // One second before Pacific midnight: a second later it is the next Oregon day.
    assert.equal(pacificDay(midnight.ms), midnight.today); assert.equal(pacificDay(midnight.ms + 1000), plusDays(midnight.today, 1)); assert.match(midnight.now, /-12-15T07:59:59\.000Z$/);
    // Spring forward: second Sunday of March, 03:00 PDT; the skipped hour never makes the day change.
    const sd = new Date(spring.ms); assert.equal(sd.getUTCDay(), 0); assert.equal(sd.getUTCMonth(), 2); assert.ok(sd.getUTCDate() >= 8 && sd.getUTCDate() <= 14);
    assert.equal(pacificDay(spring.ms - 1), spring.today, 'the same Oregon day on both sides of the skipped hour');
    // Fall back: first Sunday of November, the repeated 01:30 hour.
    const fd = new Date(fall.ms); assert.equal(fd.getUTCDay(), 0); assert.equal(fd.getUTCMonth(), 10); assert.ok(fd.getUTCDate() >= 1 && fd.getUTCDate() <= 7);
    assert.equal(pacificDay(fall.ms - HOUR), fall.today, 'the first 01:30 (PDT) is the same Oregon day');
    for (const s of [chicago, midnight, spring, fall]) {
      for (const delta of [-1000, -1, 0, 1, 1000]) {
        assert.equal(pacificDay(s.ms + delta), intlDay(s.ms + delta, 'America/Los_Angeles'), `${s.label} ${delta}: rule oracle matches Intl (Pacific)`);
        assert.equal(chicagoDay(s.ms + delta), intlDay(s.ms + delta, 'America/Chicago'), `${s.label} ${delta}: rule oracle matches Intl (Chicago)`);
      }
      assert.equal(s.short, shortDay(s.today)); assert.equal(s.tomorrow, shortDay(plusDays(s.today, 1)));
    }
  }
  assert.ok(seen.size >= 6, 'the sweep crossed many distinct scenario years');
});

test('an expired or about-to-expire frozen instant is reported as a fixture clock problem, not a product failure', () => {
  // The exact instant that broke the shipped suite once the real date reached October 15, 2026.
  const stale = Date.parse('2026-10-14T05:30:00.000Z'), realNow = Date.parse('2026-10-15T05:51:17.554Z');
  assert.throws(() => assertCookieStaysValid(stale, realNow), e => e instanceof FixtureClockError && /FIXTURE CLOCK ERROR[\s\S]*not a product regression[\s\S]*2026-10-14T13:30:00.000Z/.test(e.message));
  assert.throws(() => assertCookieStaysValid(realNow - 9 * HOUR, realNow), FixtureClockError);
  assert.doesNotThrow(() => assertCookieStaysValid(realNow + 24 * HOUR, realNow));
  assert.equal(shortDay('2030-07-04'), 'Jul 4'); assert.equal(shortDay('2030-12-14'), 'Dec 14');
});
