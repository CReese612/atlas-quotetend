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
| `4701016537c2dd5f45d2f02e3d2eed1a137a81a4` | docs(ops): document shutdown and recovery |
| `4140b41dcf3a5bc64def2e6da9bfe6a7f606f0fe` | test(server): cover accepted pipelined drain (3B.1a) |
| `082e6877663d713705fa45841da4b748252d9f57` | fix(server): preserve in-flight request lifecycle (3B.1a) |
| `fc15bf13f94b52f68f79822858d3e8bd6bcc4c61` | fix(server): clean failed startup resources (3B.1a) |
| (this update) | docs(ops): clarify shutdown and backup contract (3B.1a) |

> **Update — Sprint 3B.1a (Codex audit remediation).** Independent Codex QA of `4701016` returned NO-GO for three
> findings: P1-001 (pipelined requests lost their responses and shutdown reported clean while a handler still ran);
> P2-001 (direct `close()` unbounded behind a stalled backup); and P2-002 (a startup failure leaked SQLite). Section 7
> has the reproduction, root causes, fixes, the shutdown and backup contract, and before/after evidence. Sections 1–6
> describe Sprint 3B.1 as first delivered; where section 7 changes them, section 7 applies.

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

## 7. Sprint 3B.1a — Codex audit remediation

Started from `4701016537c2dd5f45d2f02e3d2eed1a137a81a4` (local and remote equal; `bfb5acc` verified as an ancestor).
The full independent report (`QuoteTend-QA/test-results/sprint3b1-independent-audit/REPORT.md`) and its probe sources
(`independent-probes.mjs`, `async-and-concurrent-probes.mjs`, `resource-probes.mjs`) were read; the QA directory was
not modified. Codex's probes were not re-run here because they write into its evidence directory. A separate scratch
reproduction used the same connection patterns and the same injection points (the second `bcrypt.hash`, the `mkdir`
that starts a backup, a rejecting `bcrypt.hash` during `accountAPI()` setup).

### 7.1 Reproduction on `4701016` (Windows 11, Node 24.19.0)

| Finding | Pattern | Observed |
| --- | --- | --- |
| P1-001, natural | Two `POST /api/register` pipelined on one connection, both accepted, then `close()` (3 s grace) | One `201` delivered; both owners committed; `{ forced: false }` after 488 ms |
| P1-001, controlled | Same, with the second request's password hash held | `close()` resolved `{ forced: false }` after 246 ms while the hash was held; SQLite already closed; after release only one owner existed and one response had been sent |
| P2-002 | `bcrypt.hash` rejects during `accountAPI()` setup | Original error kept, but SQLite still open (file deletion `EPERM`) and the backup schedule not stopped |
| P2-001 | The `mkdir` of a running backup held; `close()` with a 75 ms grace | Still pending after 1.5 s; listener stopped; SQLite open; resolved `{ forced: false }` only after release |

### 7.2 Root causes

* **P1-001.** The drain set `Connection: close` on every response a connection still owed. Node ends a connection
  after any response marked that way, so later pipelined responses, already accepted, were never sent. The clean
  condition was the server's `'close'` event, which only means every socket has closed. That treated socket closure
  as proof the work had finished, but a handler awaiting `bcrypt.hash` keeps running after its socket is gone.
* **P2-002.** Startup cleanup covered the initial backup and `listen()` only. `accountAPI()` setup ran between them.
* **P2-001.** `backups.stop()` awaits a running backup. Nothing bounds that wait, and the backup cannot safely be cut
  short (7.4).

### 7.3 Changes (`server.mjs`)

* **Requests are accounted for apart from sockets.** Every accepted request (Node's `'request'` event) stays
  `unfinished` until its handler calls `res.end()`, whether or not the client is still connected. The server now has
  one request listener, which records the request and then calls the Express app.
* **Only the last response a connection owes says `Connection: close`** during shutdown. That is decided when the
  response writes its headers, so earlier pipelined responses stay keep-alive and are delivered. A request that arrives
  after a response has said `Connection: close` is not dispatched (RFC 9112 §9.6). The server has announced it will not
  answer it, so running it would be accepted work with no response.
* **Clean means every connection has closed and every accepted handler has finished**, within the grace period. At the
  deadline the remaining connections are destroyed. The result and logs report `unfinished`, the handlers still
  running when SQLite closed.
* **`shutdown_waiting_for_backup`** is logged when the drain is over but a backup is still running.
* **Startup.** `startServer()` opens SQLite, creates the backup schedule and calls `serve()`, which is the unchanged
  app and listener setup. Any failure after the database opens stops the schedule, closes SQLite and rethrows the
  original error.

Unchanged: the 10 s grace, the 15 s watchdog, exit codes, session and CSRF handling, schema 3, request idempotency,
routes and responses. The clean/forced distinction is preserved; `close()` now resolves to
`{ forced, unfinished, durationMs }`.

### 7.4 The shutdown and backup contract

| | `close()` in code | `node server.mjs` + SIGTERM/SIGINT |
| --- | --- | --- |
| HTTP drain | At most `shutdownGraceMs` (10 s), then forced | Same |
| Running backup | Waited for with no time limit, logging `shutdown_waiting_for_backup`; SQLite never closed under it | Same wait, ended by the 15 s watchdog |
| SQLite | Closed once, after the drain and any running backup | Same; if the watchdog fires first it is not closed by the app and the OS releases it at exit |
| Result | `{ forced, unfinished, durationMs }`; rejects only if a stage failed | Exit 0 clean, 1 forced or failed; watchdog: `shutdown_watchdog_expired`, exit 1, no `shutdown_complete` |

**Why the backup wait is not bounded.** Node 24's `sqlite.backup()` accepts `source`, `target`, `rate` and `progress`
only. It has no abort signal, and its documentation says the source database must be open. Closing SQLite under it is
therefore outside the documented contract. In one local experiment on Node 24.19, `db.close()` called from the
`progress` callback returned normally and the backup still completed with an intact copy. That behaviour is
undocumented and is not relied on. A bounded `close()` that left SQLite open and resolved early would hand callers a
"finished" promise while the database and the backup were still live. So direct `close()` is deliberately unbounded
behind a running backup, and says so in its log; the process entry point is bounded by the watchdog. This is a
documented P2 constraint, shown by the two `P2-001 contract` tests.

**Forced shutdown and late handlers.** Destroying a connection does not cancel JavaScript. A handler still running at
the deadline carries on. Every write in QuoteTend is a single synchronous transaction (no `BEGIN … COMMIT` spans an
`await`; ledger.mjs, account-store.mjs and account-security.mjs contain no `await`), so SQLite is never closed
mid-transaction. Such a handler's next database call throws "database is not open" before any statement runs.
Express handles that error, so there is no unhandled rejection, and the client, already disconnected, receives
nothing. Through the signal entry point the process then exits. A request with several transactions can have
committed some before the deadline (for example an account created, the session not); no confirmation was sent.

### 7.5 New tests (`tests/server-shutdown.test.mjs`)

| Test | Requirement | How |
| --- | --- | --- |
| P1-001 natural | A, B, C, H | Two registrations pipelined on one connection, both accepted before `close()`; both `201` (first keep-alive, second `Connection: close`); `{ forced: false, unfinished: 0 }`; 2 owners; integrity ok |
| P1-001 controlled | D, E (repeat close) | Second hash held: the first response arrives keep-alive; `close()` still pending, SQLite open, connection open; a repeated `close()` returns the same promise; after release the second `201` arrives and shutdown is clean |
| P1-001 control | separate sockets | One request per connection, one held: the other is answered and its connection closes, while shutdown waits for the held one |
| client disconnects | F | Client destroys its connection while its request is held; the server's `'close'` fires but `close()` stays pending with SQLite open until the handler finishes; the owner is committed |
| deadline, unfinished | G, H, I, J | 200 ms grace, hash held: `{ forced: true, unfinished: 1 }`, `shutdown_deadline` with `unfinished: 1`; no response bytes; after release `createOwner` throws "not open"; 0 owners; integrity ok; no unhandled rejections; no private values in logs |
| P2-002 | Task B | `bcrypt.hash` rejects in `accountAPI()` setup: original error; the 6-hour backup interval was cleared; no extra handles; startup backup present; database reopens with integrity ok; file deletable |
| P2-002 guard | Task B | A failed initial backup still reports "Initial backup failed; server not started." and releases SQLite |
| P2-001 contract, direct | Task C | `mkdir` of a running backup held: `shutdown_waiting_for_backup`, `close()` pending, listener stopped, SQLite open; after release the backup verifies, no `.partial`, then SQLite closes |
| P2-001 contract, signal | Task C | Same stall via `handleShutdownSignals` with SIGTERM then SIGINT: at 15 s (mock timers) exit 1 once, `shutdown_watchdog_expired`, no `shutdown_complete`, SQLite still open; later completion causes no second exit |

Held work uses gated mocks (`bcrypt.hash`; `mkdir` re-bound with `syncBuiltinESMExports()`), not sleeps. The one
real timer is the 200 ms forced-path grace, which is the deadline under test. Polling waits count event-loop turns,
not milliseconds.

### 7.6 Evidence

| Run | Result |
| --- | --- |
| Final test file vs `4701016` `server.mjs`, disposable worktree | 28 tests: 20 pass, **8 fail**, natural exit in 19.6 s. Behavioural failures: the second pipelined response is lost (natural); the first response says `close` (controlled); shutdown settles while a disconnected client's handler runs; the backup interval is not cleared (P2-002). Interface failures: `unfinished` absent (separate-socket control, whose behaviour already matched Codex's control; deadline test); `shutdown_waiting_for_backup` absent (both P2-001 contract tests; the wait itself existed). The P2-002 guard passes there, as expected |
| Final test file vs fix (`fc15bf1`) | 28/28, 9.2 s; also 28/28 in each of 3 sequential and 6 concurrent runs (load check) |
| Scratch reproduction vs fix | P1 natural: two `201` (keep-alive, close), 2 owners, `{ forced: false, unfinished: 0 }`. P1 controlled: `close()` still pending after 1.5 s with SQLite open, then two `201`, 2 owners. P2-002: SQLite released. P2-001: unchanged by design (pending, SQLite open, completes on release). No unhandled rejections |

### 7.7 Regression at `fc15bf13f94b52f68f79822858d3e8bd6bcc4c61` (Windows 11, Node 24.19.0)

| Command | Result | Wall time |
| --- | --- | --- |
| `node --test tests/server-shutdown.test.mjs` | 28/28 (19 Sprint 3B.1 + 9 new) | 9.4 s |
| `npm test` | 182/182, 0 fail/cancelled/skipped/todo | 15.0 s |
| `npm run test:browser` | 24/24 groups | 26.2 s |
| `npm run test:restore:browser` | 8/8 checks | 3.9 s |
| `npm run test:calendar:browser` | 4/4 scenarios | 8.0 s |
| `npm run test:security:browser` | 16/16 checks | 8.5 s |
| `npm run test:public:browser` | 27/27 groups | 130.0 s |

Every command exited 0 on its own; none timed out, none was skipped, and nothing was unreached. No existing test
or assertion was weakened. The shared helpers gained a multi-response parser, a log-event waiter and a cleanup hook.

### 7.8 Outstanding

* **P0:** none known.
* **P1:** none known locally; P1-001 awaits Codex re-audit.
* **P2, accepted as documented constraints:**
  * Direct `close()` is unbounded behind a running backup (7.4).
  * The JavaScript watchdog cannot fire while the event loop is blocked.
  * Signals during startup are not intercepted.
  * The express-rate-limit memory store keeps an unref'd timer.
  * A forced shutdown leaves late handlers running until their next database call.
* **Request accounting assumption:** accounting relies on handlers ending their responses. A handler that never calls
  `res.end()` is reported `unfinished` until the deadline, which makes the shutdown forced. That is truthful, but slow.
* **Defensive path:** the RFC 9112 rule (a request after `Connection: close` is not dispatched) has no deterministic
  local test. The window between that response and the socket ending is too small to hit on purpose.
* **Verification gaps:** genuine Linux SIGTERM/SIGINT delivery is untested (Windows bridge only), as are all hosted
  questions in LAUNCH_OPERATIONS.

### 7.9 Focused re-audit plan

1. Run Codex's `independent-probes.mjs` pipeline cases and `async-and-concurrent-probes.mjs` against the new SHA.
   Expect two `201` responses, `close()` pending while the second hash is held, and a clean result only after both
   finish. A forced run should report `unfinished` and send no response.
2. Run `resource-probes.mjs`. Expect the startup-initialization failure to leave the database deletable. The
   stalled-backup direct close should stay pending by contract, now with `shutdown_waiting_for_backup`; the signal
   watchdog should exit 1 without `shutdown_complete`.
3. Rerun the negative control: the final `tests/server-shutdown.test.mjs` against `4701016` `server.mjs` (8 failures
   expected, as in 7.6).
4. On Linux, run the unchanged test file with genuine signals.
5. Review the request-accounting assumption and the RFC 9112 guard in 7.8. Review whether the 7.4 contract is
   acceptable, or whether a bounded direct `close()` is required despite the backup API.
