// Sets the process time zone from QUOTETEND_TEST_TZ before any other module reads the clock, e.g.
//   QUOTETEND_TEST_TZ=Pacific/Kiritimati node --import ./tests/helpers/set-timezone.mjs --test tests/*.test.mjs
// Assigning process.env.TZ at run time works for every IANA name on Windows, macOS and Linux. Setting TZ in the shell
// does not on Windows (only UTC and POSIX-style names are honoured), so tests use this instead.
// It exists to prove business logic does not depend on the machine's zone; the application never reads TZ.
if (process.env.QUOTETEND_TEST_TZ) {
  process.env.TZ = process.env.QUOTETEND_TEST_TZ;
  const actual = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (actual !== process.env.QUOTETEND_TEST_TZ && !(process.env.QUOTETEND_TEST_TZ === 'UTC' && /^(UTC|Etc\/UTC|GMT|Etc\/GMT)$/.test(actual)))
    throw new Error(`Could not switch the process time zone to ${process.env.QUOTETEND_TEST_TZ} (still ${actual}).`);
}
