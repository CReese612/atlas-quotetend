# Sprint 3B.1 — Bounded graceful server shutdown

Branch `fix/bounded-shutdown`, created from `origin/venture/development` at
`bfb5accffe067927576b2d9368a7672f8364befa` (Sprint 3A, PR #2). All test data is fictional; every test uses its own
temporary database, backup directory and ephemeral port. Nothing was deployed, no hosted system was contacted, no
Render setting or render.yaml value was changed, no pull request was opened, and `main`, `venture/staging-qa` and
`venture/development` were not touched. Operating behaviour is documented in
[LAUNCH_OPERATIONS](LAUNCH_OPERATIONS.md#shutdown-and-restart).

| Commit | Message |
| --- | --- |
| `c67d969a4a6bc341b16f8d1a428e06a034b1ef46` | test(server): reproduce shutdown hang |
| `60d8aee912efb93f07d48534531b04e3f9af92b9` | fix(server): bound graceful shutdown |
| (this document) | docs(ops): document shutdown and recovery |

## 1. The defect, reproduced

Reproduced on Windows 11 with Node 24.19.0 against the unmodified baseline `server.mjs`. Each case started a disposable
server with `startServer({ port: 0 })`, opened one raw TCP connection with the stated pattern, then called `close()`.

| Connection pattern at `close()` | Baseline result |
| --- | --- |
| none | resolved in 1 ms |
| idle keep-alive (one completed `GET /healthz`) | resolved in 1 ms (Node closes it) |
| **TCP connection that never sends a byte** (what a browser pre-connection looks like) | **still pending after 100 s** |
| **partial request headers, then nothing** | **still pending** (8 s watchdog) |
| request in flight, body completed after `close()` | response sent with `Connection: keep-alive`; `close()` took 6.3 s (keep-alive timeout) |
| same, and the client keeps reusing the connection every 2 s | **still pending after 20 s** |
| a second `close()` after the first | rejected `ERR_SERVER_NOT_RUNNING` |
| startup on a port already in use | `TypeError: Cannot read properties of null (reading 'port')`; SQLite left open |

The last row is a related lifecycle defect found while reading the same code. It is fixed here too because it is the
same listen/close path.

## 2. Root cause

Node 24's `http.Server.close()` (lib/_http_server.js, v24.19.0) calls `closeIdleConnections()` once and clears the
connection-checking interval, then waits for every remaining socket to close.

* A socket that has not completed a request counts as *active*, not idle: Node marks it busy from the moment it
  connects so that `headersTimeout` can protect against slow-loris clients. Because `close()` also clears the interval
  that enforces `headersTimeout`, nothing ever closes such a socket. Chromium opens these speculatively;
  `tests/browser-rehearsal.mjs` already had to force-close them.
* Nothing changes the keep-alive decision during shutdown. A request in flight is answered keep-alive, and a client can
  keep the connection busy indefinitely.
* The old `close()` had no deadline and no idempotency: it called `server.close()`, `backups.stop()` and
  `store.close()` on every call, and the signal handler called it again on every signal.
* Express 5's `app.listen(port, host, cb)` registers `cb` on the server's `'error'` event too, so a failed listen
  resolved the startup promise and the next line threw a `TypeError` outside the cleanup path.

## 3. The fix (server.mjs only)

* The server is created with `http.createServer(app)` so it tracks, per socket, the responses still owed before it
  starts listening. A listen error now rejects with the real error (`EADDRINUSE`) after stopping backups and closing
  SQLite.
* `close()` returns one shared promise. It stops accepting connections and destroys every socket with no request in
  flight, then marks in-flight responses `Connection: close`. It waits up to `shutdownGraceMs` (default
  `SHUTDOWN_GRACE_MS` = 10 s) and destroys whatever is left at the deadline. It then awaits a running backup (the
  schedule is cleared at the start) and closes SQLite once. It resolves to `{ forced, durationMs }`; if a stage fails
  it logs the stage names and rejects with a generic message.
* `handleShutdownSignals(running)` is exported. SIGTERM and SIGINT start one shutdown, and repeats are logged and
  ignored. The process exits 0 when clean and 1 when forced or failed. A watchdog (`SHUTDOWN_WATCHDOG_MS` = 15 s) exits 1
  with a log line if a later stage stalls. Handlers are installed before the startup banner is printed.
* `startServer()` additionally returns its `backups` scheduler. No new dependency, schema version, route or response
  change was introduced. The `shutdownGraceMs` option and `handleShutdownSignals` options exist so tests can use short
  deadlines and fake process objects.

## 4. Automated tests — `tests/server-shutdown.test.mjs`

Runs as part of `npm test`. No test sleeps on the clock. Each waits for a concrete event: a server `'connection'` or
`'request'`, an interim `100 Continue`, a log line, a response or a socket close. `within()` turns a shutdown that never
finishes into a failure after 10 s instead of hanging the suite. The one deliberate timer is the 250 ms grace period in
the forced-path test, and that deadline is the behaviour under test. Resource checks wait two event-loop turns for
libuv's close phase (a plain `node:http` server needs the same).

| Test | Covers | How |
| --- | --- | --- |
| A/K no connections | clean result, server stopped, SQLite closed | `forced: false`, one `shutdown_complete` |
| B idle keep-alive | idle connections do not wait for the grace period | grace 60 s; close is immediate and clean |
| C/J in-flight save | active request finishes; new connections refused; save survives restart | body sent in two halves around `close()`; `ECONNREFUSED`; `200` with `Connection: close`; restart on the same DB shows revision 1 and `integrity_check = ok` |
| D silent and half-sent connections | the original hang | grace 60 s; a zero-byte and a partial-header socket; clean close, both dropped |
| D/K stalled request | deadline bounds shutdown; forced is reported | grace 250 ms; request body never completes; `forced: true`, `shutdown_deadline` logged, waited ≥ grace |
| E repeated `close()` | idempotent, SQLite closed once | two concurrent calls and one later call share one result; one `shutdown_started` |
| H backup at shutdown | backup finishes before SQLite closes | backup started just before `close()`; it completed first; two verified backups, no `.partial` |
| L resources | no leftover timers, server handle or sockets | `process.getActiveResourcesInfo()` before and after, clean and forced paths |
| startup on a busy port | listen failure releases resources | rejects `EADDRINUSE`; no extra handles; DB file deletable |
| F/G signal handling | one shutdown, repeats ignored, exit codes, watchdog | fake process emitter; watchdog under `mock.timers` |
| F/G/I/J real process | SIGTERM drain, repeated signal, restart health, SIGINT, data integrity | spawns `node server.mjs` (`PORT=0`, temp `QUOTETEND_DB`/`QUOTETEND_BACKUP_DIR`); idle and silent connections plus an in-flight save during SIGTERM; restart; SIGINT; read-only integrity and backup verification |

**Windows note.** Windows cannot deliver POSIX signals to a child process: `child.kill('SIGTERM')` terminates it
outright. On Windows the real-process test preloads `tests/helpers/signal-bridge.mjs`, which re-emits a signal name
written on stdin, so the server's real handlers and `process.exit()` run. On Linux and macOS the test sends genuine OS
signals. **All runs in this sprint were on Windows, so OS-level signal delivery itself was not exercised.**

### Results

| Run | Result | Duration |
| --- | --- | --- |
| New test file vs baseline `server.mjs` (test commit, and again with the final test file in a throwaway worktree) | **all 14 reported tests fail** (11 top-level and the 3 real-process subtests; the signal subtests never start), for the reasons in section 1: four time out at the 10 s bound, the rest fail assertions. The file still exits on its own | 44 s |
| New test file vs fix | 19/19 pass (11 top-level tests and 8 subtests), three consecutive runs | ~5 s each |
| Six copies of the new test file run concurrently (load check) | 6 × 19/19 pass | 5 s wall |

### Regression (fix commit `60d8aee`, Windows 11, Node 24.19.0)

| Command | Result | Wall time |
| --- | --- | --- |
| `npm test` | 173/173 pass (154 existing + 19 new), 0 fail/cancelled/skipped | 14 s |
| `npm run test:browser` | 24/24 groups pass | 26 s |
| `npm run test:restore:browser` | 8/8 checks pass | 4 s |
| `npm run test:calendar:browser` | 4/4 scenarios pass | 8 s |
| `npm run test:security:browser` | 16/16 checks pass | 8 s |
| `npm run test:public:browser` | 27/27 groups pass | 135 s |

Every command exited naturally with code 0; none timed out and no test was unreached. Before the fix, the existing
unit tests passed 154/154 (14 s). No existing test or assertion was changed. The browser suites still force-close
sockets in their own `stopServer` helpers; that is harmless with the fix and was left alone.

## 5. Remaining risks and open questions

* **Hosted behaviour is unverified.** See the numbered list in LAUNCH_OPERATIONS. It covers signal delivery to the
  Node process, the real shutdown delay for a disk-backed service (render.yaml's `maxShutdownDelaySeconds: 60` may be
  refused for services with disks), proxy behaviour, and restart/suspend paths.
* A forced shutdown drops requests still running after 10 s. Their writes are atomic (committed fully or not at all),
  but the client gets no confirmation.
* A request cut at the deadline can still be running when SQLite closes. It then fails with a database-closed error
  that reaches no client and may not be logged, because its connection is already gone.
* SIGTERM during startup (migrations, startup backup) is not intercepted. The process ends immediately; a `.partial`
  backup file can remain and is never used as a recovery source.
* The express-rate-limit memory store keeps an unref'd timer after `close()`. It cannot keep the process alive and
  was left unchanged.
* `close()` used directly in code (not through signals) has no watchdog. If a backup stalls on a hung disk, it waits
  for that backup.

## 6. Recommended Codex QA

1. Run `node --test tests/server-shutdown.test.mjs` on **Linux** (genuine SIGTERM/SIGINT), and check out
   `c67d969` with the baseline `server.mjs` to confirm the tests fail there.
2. Repeat the section 1 patterns independently, especially a zero-byte connection and a keep-alive client that keeps
   sending during shutdown.
3. On staging with disposable data, after approval: restart the service and confirm the log sequence
   `shutdown_signal` → `shutdown_started` → `shutdown_complete` (`forced: false`) → `shutdown_exit` (`code: 0`).
   Measure downtime, confirm `/healthz` and a fictional save after restart, and confirm the effective shutdown delay
   for a disk-backed service.
4. Review whether 10 s / 15 s is right once real request durations on the starter plan are known.
