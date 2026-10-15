// Sets the process time zone from QUOTETEND_TEST_TZ before any other module reads the clock, e.g.
//   QUOTETEND_TEST_TZ=Pacific/Kiritimati node --import ./tests/helpers/set-timezone.mjs --test tests/*.test.mjs
// Assigning process.env.TZ at run time works for every IANA name in every shell. Setting TZ in the shell also works from
// PowerShell, cmd, macOS and Linux, but NOT from Git Bash on Windows (observed: it left the machine zone in place), so tests
// use this setter, which behaves the same everywhere and fails loudly if the zone did not change.
// It exists to prove business logic does not depend on the machine's zone; the application never reads TZ.
if (process.env.QUOTETEND_TEST_TZ) {
  process.env.TZ = process.env.QUOTETEND_TEST_TZ;
  const actual = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (actual !== process.env.QUOTETEND_TEST_TZ && !(process.env.QUOTETEND_TEST_TZ === 'UTC' && /^(UTC|Etc\/UTC|GMT|Etc\/GMT)$/.test(actual)))
    throw new Error(`Could not switch the process time zone to ${process.env.QUOTETEND_TEST_TZ} (still ${actual}).`);
}
