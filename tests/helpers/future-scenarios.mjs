// Calendar scenarios for the frozen-clock BROWSER test, derived from the real clock so they never age out.
//
// Why: Chromium decides whether a cookie has expired against the REAL clock, even when the page clock is frozen. The
// server stamps the session cookie "frozen instant + 8 hours", so a frozen instant that is already in the past gives a
// cookie that is born expired and sign-in appears to fail. Every scenario therefore lies at least MIN_LEAD in the
// future of the moment the test runs (the nearest upcoming occurrence of each calendar condition), and a guard turns
// any violation into an explicit "fixture clock" error instead of a mysterious product failure.
//
// The expected Oregon day is computed here from the published US daylight-saving RULES (second Sunday of March, first
// Sunday of November, fixed offsets), with plain arithmetic and no Intl and no application code, so it is an
// independent oracle for the code under test. Historical boundary instants stay in the unit suite
// (business-calendar.test.mjs), where no browser cookie is involved.
export const HOUR = 3_600_000;
export const SESSION_LIFETIME = 8 * HOUR; // account-api.mjs: session cookie maxAge
export const MIN_LEAD = 36 * HOUR;        // how far ahead of the real clock every frozen instant must be

const nthSunday = (year, month, n) => 1 + ((7 - new Date(Date.UTC(year, month, 1)).getUTCDay()) % 7) + 7 * (n - 1);
// US rules since 2007: starts 02:00 local standard time on the second Sunday of March, ends 02:00 local daylight time on the first Sunday of November.
export const pacificDstStart = year => Date.UTC(year, 2, nthSunday(year, 2, 2), 10);  // 02:00 PST = 10:00Z
export const pacificDstEnd = year => Date.UTC(year, 10, nthSunday(year, 10, 1), 9);   // 02:00 PDT = 09:00Z
const centralDstStart = year => Date.UTC(year, 2, nthSunday(year, 2, 2), 8);           // 02:00 CST = 08:00Z
const centralDstEnd = year => Date.UTC(year, 10, nthSunday(year, 10, 1), 7);           // 02:00 CDT = 07:00Z
const ymd = d => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
const dayIn = (ms, start, end, daylightHours, standardHours) => {
  const year = new Date(ms).getUTCFullYear(), daylight = ms >= start(year) && ms < end(year);
  return ymd(new Date(ms - (daylight ? daylightHours : standardHours) * HOUR));
};
export const pacificDay = ms => dayIn(ms, pacificDstStart, pacificDstEnd, 7, 8);
export const chicagoDay = ms => dayIn(ms, centralDstStart, centralDstEnd, 5, 6);
export const plusDays = (day, n) => ymd(new Date(Date.parse(day + 'T12:00:00Z') + n * 24 * HOUR));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const shortDay = day => `${MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`; // how the app prints a date in the current year

export class FixtureClockError extends Error {
  constructor(message) { super('FIXTURE CLOCK ERROR (a test-setup problem, not a product regression): ' + message); this.name = 'FixtureClockError'; }
}
// A frozen instant is usable only if the session cookie it produces is still unexpired on the real clock.
export function assertCookieStaysValid(frozenMs, realNowMs = Date.now()) {
  const cookieExpires = frozenMs + SESSION_LIFETIME;
  if (!(cookieExpires > realNowMs + HOUR)) // at least an hour of real-clock validity must remain for the test to run
    throw new FixtureClockError(`the session cookie would expire at ${new Date(cookieExpires).toISOString()}, but the real clock reads ${new Date(realNowMs).toISOString()}; Chromium would discard it and sign-in would loop.`);
}

// The nearest upcoming occurrence (at least MIN_LEAD from now) of each calendar condition.
export function futureScenarios(realNowMs = Date.now()) {
  const upcoming = make => { for (let year = new Date(realNowMs).getUTCFullYear(); year < 3000; year++) { const ms = make(year); if (ms >= realNowMs + MIN_LEAD) return ms; } throw new Error('no upcoming instant'); };
  const spec = [
    { label: 'Oregon 22:30 while Chicago and UTC are already tomorrow (July 15, 05:30 UTC)', make: y => Date.UTC(y, 6, 15, 5, 30), serverTz: 'America/Chicago', browserTz: 'Pacific/Kiritimati' },
    { label: 'one second before Pacific midnight (PST; December 15, 07:59:59 UTC)', make: y => Date.UTC(y, 11, 15, 7, 59, 59), serverTz: 'Pacific/Kiritimati', browserTz: 'UTC' },
    { label: 'spring-forward morning, 03:00 PDT (second Sunday of March, 10:00 UTC)', make: y => pacificDstStart(y), serverTz: 'UTC', browserTz: 'America/Chicago' },
    { label: 'fall-back repeated hour, 01:30 PST (first Sunday of November, 09:30 UTC)', make: y => pacificDstEnd(y) + 30 * 60_000, serverTz: 'America/Los_Angeles', browserTz: 'Pacific/Kiritimati' },
  ];
  return spec.map(({ label, make, serverTz, browserTz }) => {
    const ms = upcoming(make), today = pacificDay(ms);
    return { label, ms, now: new Date(ms).toISOString(), today, short: shortDay(today), tomorrow: shortDay(plusDays(today, 1)), chicagoDay: chicagoDay(ms), serverTz, browserTz };
  });
}
