// Sprint 3B.1: bounded graceful shutdown. Everything here is fictional and disposable: each test gets its own temporary
// database, backup directory and ephemeral port, and the subprocess tests run `node server.mjs` against those paths only.
// No test sleeps. Each waits for a concrete event (a server 'request' or 'connection', a log line, a response byte), and
// within() turns a shutdown that never finishes (the original defect) into a failure instead of a hung suite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { connect, createServer as createTcpServer } from 'node:net';
import { request } from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import * as serverModule from '../server.mjs';
import { openAccounts } from '../account-store.mjs';
import { configuration } from '../production-config.mjs';
import { verifyBackup } from '../backups.mjs';
import { demoData, addDays, todayISO } from '../domain.js';

const { startServer } = serverModule;
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EMAIL = 'shutdown-owner@example.com', PASSWORD = 'Fictional-shutdown-password-5150!', BUSINESS = 'Fictional Shutdown Roofing';
// Ceiling for steps that take milliseconds once fixed. The original server never finishes them at all.
const BOUND = 10_000;

async function within(promise, ms, what) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${what} did not finish within ${ms} ms`)), ms); })]); }
  finally { clearTimeout(timer); }
}
// Cleanup runs last-in first-out, so a server is closed (or a child process stopped) before its directory is removed.
function cleanupFor(t) {
  const stack = [];
  t.after(async () => { const errors = []; while (stack.length) { try { await stack.pop()(); } catch (error) { errors.push(error); } } if (errors.length) throw errors[0]; });
  return fn => stack.push(fn);
}
function tempDir(defer) {
  const dir = mkdtempSync(join(tmpdir(), 'quotetend-shutdown-test-'));
  defer(() => { if (dirname(dir) === tmpdir() && basename(dir).startsWith('quotetend-shutdown-test-')) rmSync(dir, { recursive: true, force: true }); });
  return dir;
}
const handles = () => { const counts = {}; for (const name of process.getActiveResourcesInfo()) counts[name] = (counts[name] || 0) + 1; return counts; };
async function assertReleased(before, label) {
  // A closed handle stays listed until libuv's close phase runs, two loop turns later (true of a plain node:http server
  // too), so let those turns pass before counting. This waits on the event loop, not on the clock.
  for (let turn = 0; turn < 2; turn++) await new Promise(setImmediate);
  const after = handles();
  for (const name of ['Timeout', 'TCPServerWrap', 'TCPSocketWrap']) assert.ok((after[name] || 0) <= (before[name] || 0), `${label}: ${name} left open (${before[name] || 0} before, ${after[name] || 0} after)`);
}

// --- HTTP over a raw socket, so a test decides exactly which bytes of a request are sent and when. -------------------
// Every complete final response in the bytes received so far, in order (pipelined responses share one connection).
function parseResponses(buffer) {
  const found = [];
  for (let rest = buffer; ;) {
    const end = rest.indexOf('\r\n\r\n'); if (end < 0) return found;
    const [statusLine, ...lines] = rest.subarray(0, end).toString('latin1').split('\r\n');
    const status = Number(statusLine.split(' ')[1]);
    rest = rest.subarray(end + 4);
    if (status >= 100 && status < 200) continue; // an interim "100 Continue"
    const headers = Object.fromEntries(lines.map(line => [line.slice(0, line.indexOf(':')).toLowerCase(), line.slice(line.indexOf(':') + 1).trim()]));
    const length = Number(headers['content-length'] || 0);
    if (rest.length < length) return found;
    found.push({ status, headers, text: rest.subarray(0, length).toString('utf8') });
    rest = rest.subarray(length);
  }
}
const parseResponse = buffer => parseResponses(buffer)[0] ?? null;
function waitOn(socket, read, parse) {
  return new Promise((resolve, reject) => {
    const check = () => { const value = parse(read()); if (value) { stop(); resolve(value); } };
    const closed = () => { stop(); const value = parse(read()); if (value) resolve(value); else reject(new Error('Connection closed before the expected bytes arrived.')); };
    const stop = () => { socket.off('data', check); socket.off('close', closed); };
    socket.on('data', check); socket.on('close', closed); check();
    if (socket.destroyed) closed(); // already closed: no further 'data' or 'close' will come
  });
}
async function rawConnection(port, accepted = Promise.resolve()) {
  const socket = connect(port, '127.0.0.1'), chunks = [];
  socket.on('error', () => {}); // a forced shutdown may reset the connection; tests assert on 'close' instead
  socket.on('data', chunk => chunks.push(chunk));
  const closed = new Promise(resolve => socket.once('close', resolve));
  await Promise.all([once(socket, 'connect'), accepted]);
  const read = () => Buffer.concat(chunks);
  return { socket, closed, received: () => read().toString('latin1'), response: () => waitOn(socket, read, parseResponse),
    responses: count => waitOn(socket, read, buffer => { const all = parseResponses(buffer); return all.length >= count ? all : null; }),
    continued: () => waitOn(socket, read, buffer => buffer.toString('latin1').startsWith('HTTP/1.1 100 Continue\r\n\r\n')) };
}
function send(env, path, { method = 'GET', body, cookie } = {}) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const headers = { Host: env.host, Origin: 'http://' + env.host, 'X-QuoteTend-Request': '1', 'Content-Type': 'application/json',
    ...(cookie ? { Cookie: cookie } : {}), ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}) };
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: env.port, path, method, headers, agent: false }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8'); let data = text; try { data = JSON.parse(text); } catch { /* not JSON */ }
        resolve({ status: res.statusCode, headers: res.headers, data, cookie: (res.headers['set-cookie'] || [])[0]?.split(';')[0] });
      });
    });
    req.on('error', reject); req.end(payload);
  });
}
const signIn = async env => { const r = await send(env, '/api/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } }); assert.equal(r.status, 200, 'fixture sign-in'); return r.cookie; };
const estimate = id => ({ ...demoData()[0], estimate_id: id, customer_name: 'Fictional Shutdown Customer', customer_email: 'shutdown-customer@example.com',
  estimate_date: addDays(todayISO(), -3), next_follow_up_date: todayISO(), history: [], saved_draft: '', last_contact_date: '', do_not_contact: false, status: 'sent', trade: 'Roofing' });
const createCommand = id => Buffer.from(JSON.stringify({ kind: 'create', requestId: randomUUID(), revision: 0, fields: estimate(id) }));
const commandHead = (env, businessId, cookie, length, extra = '') =>
  `POST /api/workspaces/${businessId}/commands HTTP/1.1\r\nHost: ${env.host}\r\nOrigin: http://${env.host}\r\nX-QuoteTend-Request: 1\r\n` +
  `Content-Type: application/json\r\nCookie: ${cookie}\r\nContent-Length: ${length}\r\nConnection: keep-alive\r\n${extra}\r\n`;

// --- In-process server --------------------------------------------------------------------------------------------
async function launch(t, options = {}) {
  const defer = cleanupFor(t), dir = tempDir(defer), logs = [], clients = [], dbPath = join(dir, 'accounts.sqlite'), waiters = new Set();
  const logger = entry => { logs.push(entry); for (const check of waiters) check(); };
  const running = await startServer({ port: 0, dbPath, config: { ...configuration({}), backupDir: join(dir, 'backups') }, logger, ...options });
  const env = { dir, dbPath, logs, logger, running, defer, port: running.port, host: '127.0.0.1:' + running.port, closing: null,
    close: () => env.closing ??= running.close(),
    // Resolves when the server logs `event` (or already has).
    logged: event => within(new Promise(resolve => { const check = () => { const found = logs.find(e => e.event === event); if (found) { waiters.delete(check); resolve(found); } }; waiters.add(check); check(); }), BOUND, `log ${event}`),
    // Resolves once the server has accepted the socket, so shutdown never starts while it is still in the kernel backlog.
    connect: async () => { const c = await rawConnection(running.port, once(running.server, 'connection')); clients.push(c.socket); return c; } };
  defer(async () => {
    for (const socket of clients) socket.destroy(); // releases whatever the original server would otherwise wait on forever
    try { await env.close(); } catch { /* the failing assertion has already been reported */ }
  });
  return env;
}

test('A/K: with no connections the server closes promptly and reports a clean shutdown', { timeout: 30_000 }, async t => {
  const env = await launch(t, { shutdownGraceMs: 60_000 });
  const result = await within(env.close(), BOUND, 'close()');
  assert.equal(result?.forced, false);
  assert.equal(env.running.server.listening, false);
  assert.equal(env.running.store.db.isOpen, false);
  const complete = env.logs.filter(e => e.event === 'shutdown_complete');
  assert.equal(complete.length, 1); assert.equal(complete[0].forced, false);
});

test('B: idle keep-alive connections are closed without waiting for the grace period', { timeout: 30_000 }, async t => {
  const env = await launch(t, { shutdownGraceMs: 60_000 });
  const idle = await env.connect();
  idle.socket.write(`GET /healthz HTTP/1.1\r\nHost: ${env.host}\r\nConnection: keep-alive\r\n\r\n`);
  const health = await within(idle.response(), BOUND, 'health response');
  assert.equal(health.status, 200); assert.match(health.headers.connection, /keep-alive/i);
  const result = await within(env.close(), BOUND, 'close() with an idle keep-alive connection');
  assert.equal(result?.forced, false);
  await within(idle.closed, BOUND, 'the server closing the idle connection');
});

test('C/J: a request in flight when shutdown starts completes, ends its connection, and its save survives restart', { timeout: 30_000 }, async t => {
  const env = await launch(t, { shutdownGraceMs: 60_000 });
  const owner = env.running.store.createOwner(EMAIL, bcrypt.hashSync(PASSWORD, 4), BUSINESS);
  const cookie = await signIn(env), body = createCommand('SHUTDOWN-ACTIVE');
  const active = await env.connect();
  const received = once(env.running.server, 'request');
  active.socket.write(commandHead(env, owner.business_id, cookie, body.length)); active.socket.write(body.subarray(0, 10));
  await received; // the server is handling the save: headers parsed, body still arriving
  const closing = env.close();
  assert.equal(env.running.server.listening, false, 'no new connections are accepted');
  await assert.rejects(new Promise((resolve, reject) => { const s = connect(env.port, '127.0.0.1', () => { s.destroy(); resolve(); }); s.on('error', reject); }), { code: 'ECONNREFUSED' });
  active.socket.write(body.subarray(10));
  const response = await within(active.response(), BOUND, 'the in-flight response');
  assert.equal(response.status, 200, response.text);
  assert.equal(response.headers.connection, 'close', 'a connection that finishes during shutdown is not kept alive');
  await within(active.closed, BOUND, 'the server ending the drained connection');
  assert.equal((await within(closing, BOUND, 'close() after the in-flight request'))?.forced, false);
  // Restart on the same database: the save that completed during shutdown is present and the file is intact.
  const restarted = await startServer({ port: 0, dbPath: env.dbPath, config: { ...configuration({}), backupDir: join(env.dir, 'backups') }, logger: () => {} });
  try {
    assert.equal((await send({ port: restarted.port, host: '127.0.0.1:' + restarted.port }, '/healthz')).status, 200);
    const workspace = restarted.store.workspace(owner.business_id);
    assert.equal(workspace.revision, 1);
    assert.deepEqual(workspace.quotes.map(q => q.estimate_id), ['SHUTDOWN-ACTIVE']);
    assert.equal(restarted.store.db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  } finally { await restarted.close(); }
});

test('D: connections that never send a request, or stop mid-headers, do not hold shutdown open', { timeout: 30_000 }, async t => {
  // The original defect. Node treats a socket that has not completed a request as busy, and server.close() also stops
  // the header timeout that would eventually drop it, so close() waited forever. Browsers open such sockets
  // speculatively (pre-connections). Whether or not the server has read the half-sent headers yet, neither socket has
  // a request in progress, so closing them discards no work.
  const env = await launch(t, { shutdownGraceMs: 60_000 });
  const silent = await env.connect(), partial = await env.connect();
  partial.socket.write(`GET /healthz HTTP/1.1\r\nHost: ${env.host}\r\n`);
  const result = await within(env.close(), BOUND, 'close() with a silent and a half-sent connection');
  assert.equal(result?.forced, false, 'no request was in progress, so this is a clean shutdown');
  await within(Promise.all([silent.closed, partial.closed]), BOUND, 'the server dropping both connections');
  assert.equal(env.running.store.db.isOpen, false);
});

test('D/K: a stalled request cannot hold shutdown past the deadline, and the forced close is reported', { timeout: 30_000 }, async t => {
  const grace = 250;
  const env = await launch(t, { shutdownGraceMs: grace });
  const stalled = await env.connect();
  const received = once(env.running.server, 'request');
  stalled.socket.write(`POST /api/login HTTP/1.1\r\nHost: ${env.host}\r\nOrigin: http://${env.host}\r\nX-QuoteTend-Request: 1\r\n` +
    'Content-Type: application/json\r\nContent-Length: 64\r\n\r\n{"email":');
  await received; // in progress, and its body will never finish
  const started = performance.now();
  const result = await within(env.close(), BOUND, 'close() with a stalled request');
  const elapsed = performance.now() - started;
  assert.equal(result?.forced, true);
  assert.ok(elapsed >= grace - 5, `the in-flight request was given the whole grace period (${Math.round(elapsed)} ms)`);
  await within(stalled.closed, BOUND, 'the server dropping the stalled connection');
  assert.equal(env.running.store.db.isOpen, false);
  const complete = env.logs.filter(e => e.event === 'shutdown_complete');
  assert.equal(complete.length, 1); assert.equal(complete[0].forced, true);
  assert.ok(env.logs.some(e => e.event === 'shutdown_deadline'), 'the deadline is logged');
});

test('E: repeated close() calls share one shutdown and close SQLite once', { timeout: 30_000 }, async t => {
  const env = await launch(t);
  const first = env.running.close(), second = env.running.close();
  env.closing = first;
  const results = await within(Promise.allSettled([first, second]), BOUND, 'two close() calls');
  assert.deepEqual(results.map(r => r.status), ['fulfilled', 'fulfilled'], 'neither call fails');
  assert.equal(results[0].value?.forced, false); assert.deepEqual(results[1].value, results[0].value);
  assert.deepEqual(await env.running.close(), results[0].value, 'a call after shutdown returns the same result');
  assert.equal(env.logs.filter(e => e.event === 'shutdown_started').length, 1);
  assert.equal(env.running.store.db.isOpen, false);
});

test('H: a backup running at shutdown finishes before SQLite closes and leaves no partial file', { timeout: 30_000 }, async t => {
  const env = await launch(t);
  assert.ok(env.running.backups, 'the running server exposes its backup scheduler');
  let backupDone = false;
  const backup = env.running.backups.run().then(path => { backupDone = true; return path; });
  assert.equal((await within(env.close(), BOUND, 'close() during a backup'))?.forced, false);
  assert.equal(backupDone, true, 'the backup completed before close() resolved');
  assert.equal(env.running.store.db.isOpen, false);
  const files = readdirSync(join(env.dir, 'backups'));
  assert.deepEqual(files.filter(f => f.endsWith('.partial')), []);
  assert.equal(files.filter(f => f.endsWith('.sqlite')).length, 2, 'the startup backup and the one taken during shutdown');
  assert.equal(verifyBackup(await backup).businesses, 0);
});

test('L: clean and forced shutdowns release their timers, server handle and sockets', { timeout: 30_000 }, async t => {
  const before = handles();
  for (const grace of [60_000, 200]) {
    const env = await launch(t, { shutdownGraceMs: grace });
    const idle = await env.connect(), silent = await env.connect(), clients = [idle, silent];
    idle.socket.write(`GET /healthz HTTP/1.1\r\nHost: ${env.host}\r\nConnection: keep-alive\r\n\r\n`);
    await within(idle.response(), BOUND, 'health response');
    if (grace < 1000) { // also hold the forced path open with a request that never finishes, so the deadline timer fires
      const stalled = await env.connect(), received = once(env.running.server, 'request'); clients.push(stalled);
      stalled.socket.write(`POST /api/login HTTP/1.1\r\nHost: ${env.host}\r\nOrigin: http://${env.host}\r\nX-QuoteTend-Request: 1\r\nContent-Type: application/json\r\nContent-Length: 64\r\n\r\n{`);
      await received;
    }
    assert.equal((await within(env.close(), BOUND, 'close()'))?.forced, grace < 1000);
    await within(Promise.all(clients.map(c => c.closed)), BOUND, 'client sockets closing');
    await assertReleased(before, grace < 1000 ? 'forced shutdown' : 'clean shutdown');
  }
});

test('startup on a port already in use fails with the listen error and releases the database', { timeout: 30_000 }, async t => {
  const defer = cleanupFor(t), dir = tempDir(defer);
  const blocker = createTcpServer(); await new Promise(resolve => blocker.listen(0, '127.0.0.1', resolve));
  defer(() => new Promise(resolve => blocker.close(resolve)));
  const before = handles();
  await assert.rejects(startServer({ port: blocker.address().port, dbPath: join(dir, 'accounts.sqlite'), config: { ...configuration({}), backupDir: join(dir, 'backups') }, logger: () => {} }),
    { code: 'EADDRINUSE' });
  await assertReleased(before, 'failed startup');
  // Windows cannot delete an open SQLite file, so there this also proves the database was closed.
  assert.doesNotThrow(() => rmSync(join(dir, 'accounts.sqlite')));
});

// --- Signal handling ----------------------------------------------------------------------------------------------
function signalHarness(close, options = {}) {
  const proc = new EventEmitter(), logs = [], exits = [];
  let exited; const exitedOnce = new Promise(resolve => { exited = resolve; });
  serverModule.handleShutdownSignals({ close }, { proc, logger: entry => logs.push(entry), exit: code => { exits.push(code); exited(code); }, ...options });
  return { proc, logs, exits, exited: exitedOnce };
}

test('F/G: SIGTERM and SIGINT start one shutdown, repeats are ignored, and the exit code tells clean from forced', { timeout: 30_000 }, async t => {
  assert.equal(typeof serverModule.handleShutdownSignals, 'function', 'server.mjs exports its signal handling');
  // Render sends SIGKILL 30 s after SIGTERM unless configured otherwise; the whole budget must end well before that.
  assert.ok(serverModule.SHUTDOWN_GRACE_MS < serverModule.SHUTDOWN_WATCHDOG_MS && serverModule.SHUTDOWN_WATCHDOG_MS <= 20_000);

  await t.test('clean: one close() whatever signals repeat, then exit 0', async () => {
    let calls = 0, finish;
    const h = signalHarness(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
    h.proc.emit('SIGTERM', 'SIGTERM'); h.proc.emit('SIGINT', 'SIGINT'); h.proc.emit('SIGTERM', 'SIGTERM');
    assert.equal(calls, 1);
    finish({ forced: false });
    assert.equal(await h.exited, 0);
    assert.deepEqual(h.exits, [0]);
    assert.deepEqual(h.logs.map(e => [e.event, e.signal ?? e.code]),
      [['shutdown_signal', 'SIGTERM'], ['shutdown_signal_repeated', 'SIGINT'], ['shutdown_signal_repeated', 'SIGTERM'], ['shutdown_exit', 0]]);
  });
  await t.test('SIGINT alone starts the same shutdown', async () => {
    const h = signalHarness(async () => ({ forced: false }));
    h.proc.emit('SIGINT', 'SIGINT');
    assert.equal(await h.exited, 0);
  });
  await t.test('forced: exit 1', async () => {
    const h = signalHarness(async () => ({ forced: true }));
    h.proc.emit('SIGTERM', 'SIGTERM');
    assert.equal(await h.exited, 1);
  });
  await t.test('failed: exit 1 without logging the error text', async () => {
    const h = signalHarness(async () => { throw new Error('C:\\fictional\\accounts.sqlite shutdown-owner@example.com'); });
    h.proc.emit('SIGTERM', 'SIGTERM');
    assert.equal(await h.exited, 1);
    assert.doesNotMatch(JSON.stringify(h.logs), /fictional|example\.com/);
  });
  await t.test('a shutdown that never settles is cut off by the watchdog', async t2 => {
    t2.mock.timers.enable({ apis: ['setTimeout'] });
    const h = signalHarness(() => new Promise(() => {}), { watchdogMs: 15_000 });
    h.proc.emit('SIGTERM', 'SIGTERM');
    t2.mock.timers.tick(14_999); assert.deepEqual(h.exits, []);
    t2.mock.timers.tick(1); assert.deepEqual(h.exits, [1]);
    assert.ok(h.logs.some(e => e.event === 'shutdown_watchdog_expired'));
  });
});

// --- The real process: `node server.mjs` --------------------------------------------------------------------------
// Production starts the server the same way (PORT=0 picks a free port). Linux and macOS get genuine OS signals; Windows
// cannot deliver them to a child, so there tests/helpers/signal-bridge.mjs re-emits a signal written on stdin.
function spawnServer(defer, dir) {
  const bridge = process.platform === 'win32' ? ['--import', pathToFileURL(join(ROOT, 'tests', 'helpers', 'signal-bridge.mjs')).href] : [];
  const child = spawn(process.execPath, [...bridge, 'server.mjs'], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'test', PORT: '0', QUOTETEND_DB: join(dir, 'accounts.sqlite'), QUOTETEND_BACKUP_DIR: join(dir, 'backups') } });
  // 'close' (not 'exit') fires after stdout is fully read, so every log line is in `logs` by then.
  const exited = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
  defer(async () => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); await exited; });
  const logs = [], waiters = new Set(); let stderr = '';
  child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
  let banner = null;
  createInterface({ input: child.stdout }).on('line', line => {
    if (line.startsWith('{')) logs.push(JSON.parse(line));
    banner ??= line.match(/^QuoteTend \(local\): http:\/\/127\.0\.0\.1:(\d+)\/account$/);
    for (const check of waiters) check();
  });
  const until = (find, what) => within(Promise.race([
    new Promise(resolve => { const check = () => { const found = find(); if (found) { waiters.delete(check); resolve(found); } }; waiters.add(check); check(); }),
    exited.then(exit => { throw new Error(`${what}: the server exited first (${JSON.stringify(exit)}). stderr: ${stderr}`); })]), BOUND, what);
  const server = { child, logs, exited, until, stderr: () => stderr,
    log: (event, extra = {}) => until(() => logs.find(e => e.event === event && Object.entries(extra).every(([k, v]) => e[k] === v)), `log ${event}`),
    signal: name => process.platform === 'win32' ? child.stdin.write(name + '\n') : child.kill(name),
    ready: until(() => banner, 'startup').then(match => ({ port: Number(match[1]), host: '127.0.0.1:' + match[1] })) };
  return server;
}

test('F/G/I/J: the real process drains on SIGTERM, ignores a repeated signal, restarts healthy with its data, and stops on SIGINT', { timeout: 120_000 }, async t => {
  const defer = cleanupFor(t), dir = tempDir(defer), dbPath = join(dir, 'accounts.sqlite');
  const seed = openAccounts(dbPath); const owner = seed.createOwner(EMAIL, bcrypt.hashSync(PASSWORD, 4), BUSINESS); seed.close();
  const privateText = [EMAIL, PASSWORD, BUSINESS, 'Fictional Shutdown Customer', dir];

  await t.test('SIGTERM: an in-flight save completes, a repeated signal is ignored, exit code 0', async () => {
    const server = spawnServer(defer, dir), env = await server.ready;
    assert.equal((await send(env, '/healthz')).status, 200);
    const cookie = await signIn(env);
    // As a browser would: one idle keep-alive connection and one pre-connection that never sends a request.
    const idle = await rawConnection(env.port);
    idle.socket.write(`GET /healthz HTTP/1.1\r\nHost: ${env.host}\r\nConnection: keep-alive\r\n\r\n`);
    assert.equal((await within(idle.response(), BOUND, 'health response')).status, 200);
    const silent = await rawConnection(env.port);
    // A save in flight: "100 Continue" confirms the server is handling it before its body is sent.
    const body = createCommand('SHUTDOWN-SIGTERM'), active = await rawConnection(env.port);
    active.socket.write(commandHead(env, owner.business_id, cookie, body.length, 'Expect: 100-continue\r\n'));
    await within(active.continued(), BOUND, '100 Continue');
    server.signal('SIGTERM'); await server.log('shutdown_started');
    server.signal('SIGINT'); await server.log('shutdown_signal_repeated', { signal: 'SIGINT' });
    active.socket.write(body);
    const response = await within(active.response(), BOUND, 'the in-flight save');
    assert.equal(response.status, 200, response.text); assert.equal(response.headers.connection, 'close');
    assert.deepEqual(await within(server.exited, BOUND, 'process exit after SIGTERM'), { code: 0, signal: null }, server.stderr());
    await within(Promise.all([idle.closed, silent.closed, active.closed]), BOUND, 'client connections closing');
    assert.deepEqual(server.logs.filter(e => e.event.startsWith('shutdown_')).map(e => e.event),
      ['shutdown_signal', 'shutdown_started', 'shutdown_signal_repeated', 'shutdown_complete', 'shutdown_exit']);
    assert.equal(server.logs.find(e => e.event === 'shutdown_complete').forced, false);
    const logText = JSON.stringify(server.logs) + server.stderr();
    for (const text of [...privateText, cookie.split('=')[1]]) assert.ok(!logText.includes(text), 'logs must not contain private data');
  });

  await t.test('restart: health check passes, the saved estimate is back, SIGINT stops it cleanly', async () => {
    const server = spawnServer(defer, dir), env = await server.ready;
    assert.equal((await send(env, '/healthz')).status, 200);
    const workspace = await send(env, `/api/workspaces/${owner.business_id}`, { cookie: await signIn(env) });
    assert.equal(workspace.status, 200); assert.equal(workspace.data.revision, 1);
    assert.deepEqual(workspace.data.quotes.map(q => q.estimate_id), ['SHUTDOWN-SIGTERM']);
    server.signal('SIGINT');
    assert.deepEqual(await within(server.exited, BOUND, 'process exit after SIGINT'), { code: 0, signal: null }, server.stderr());
    assert.equal(server.logs.find(e => e.event === 'shutdown_signal').signal, 'SIGINT');
    assert.equal(server.logs.find(e => e.event === 'shutdown_complete').forced, false);
  });

  await t.test('the database and backups are intact after both shutdowns', () => {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
      assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
      assert.equal(db.prepare('SELECT revision FROM businesses WHERE id=?').get(owner.business_id).revision, 1);
    } finally { db.close(); }
    const backups = readdirSync(join(dir, 'backups'));
    assert.deepEqual(backups.filter(f => f.endsWith('.partial')), []);
    assert.equal(backups.length, 2, 'one verified startup backup per start');
    for (const file of backups) assert.equal(verifyBackup(join(dir, 'backups', file)).version, 3);
  });
});

// --- Sprint 3B.1a: Codex audit findings P1-001, P2-001, P2-002 ----------------------------------------------------
const registration = (env, n) => {
  const body = JSON.stringify({ email: `pipeline-${n}@example.com`, password: PASSWORD, businessName: `Fictional Pipeline ${n}` });
  return `POST /api/register HTTP/1.1\r\nHost: ${env.host}\r\nOrigin: http://${env.host}\r\nX-QuoteTend-Request: 1\r\n` +
    `Content-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: keep-alive\r\n\r\n${body}`;
};
const ownersIn = dbPath => {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try { return { owners: db.prepare('SELECT COUNT(*) n FROM owners').get().n, integrity: db.prepare('PRAGMA integrity_check').get().integrity_check }; }
  finally { db.close(); }
};
// Event-loop turns, not clock time. until() gives up after `limit` turns so a missing event fails instead of hanging.
const turns = async count => { for (let turn = 0; turn < count; turn++) await new Promise(setImmediate); };
const until = async (predicate, what, limit = 100_000) => {
  for (let turn = 0; !predicate(); turn++) { if (turn === limit) throw new Error(`${what} did not happen within ${limit} event-loop turns`); await new Promise(setImmediate); }
};
function captureUnhandled(t) {
  const seen = [], listener = reason => seen.push(String(reason?.message ?? reason));
  process.on('unhandledRejection', listener); t.after(() => process.off('unhandledRejection', listener));
  return seen;
}
// Holds the nth bcrypt.hash call (registration hashes the password) until release(), so a request is provably still
// running at a chosen moment. bcryptjs is one shared module instance, so the server's handler sees this mock. Install
// it after launch(): startup itself hashes once. The gate is released before the server is closed during cleanup.
function holdHash(t, env, nth) {
  const original = bcrypt.hash; let calls = 0, release, entered;
  const gate = new Promise(resolve => { release = resolve; }), started = new Promise(resolve => { entered = resolve; });
  t.mock.method(bcrypt, 'hash', (...args) => ++calls === nth ? (entered(), gate.then(() => original(...args))) : original(...args));
  env.defer(() => release());
  return { started, release };
}
// Holds mkdir, the first step of every backup, until release(). backups.mjs imports mkdir from node:fs/promises;
// syncBuiltinESMExports() points that live binding at the mock, and back at the original afterwards.
function holdBackup(t, env) {
  const fsp = createRequire(import.meta.url)('node:fs/promises'), original = fsp.mkdir; let release, entered;
  const gate = new Promise(resolve => { release = resolve; }), started = new Promise(resolve => { entered = resolve; });
  const mocked = t.mock.method(fsp, 'mkdir', async (...args) => { entered(); await gate; return original(...args); });
  syncBuiltinESMExports();
  env.defer(() => { release(); mocked.mock.restore(); syncBuiltinESMExports(); });
  return { started, release };
}
const shutdownEvents = logs => logs.filter(e => e.event.startsWith('shutdown_')).map(e => e.event);

test('P1-001 natural: two requests pipelined on one connection before shutdown both get their responses', { timeout: 30_000 }, async t => {
  const env = await launch(t, { shutdownGraceMs: 60_000 }), unhandled = captureUnhandled(t);
  const c = await env.connect();
  let accepted = 0, both; const bothAccepted = new Promise(resolve => { both = resolve; });
  env.running.server.on('request', () => { if (++accepted === 2) both(); });
  c.socket.write(registration(env, 1) + registration(env, 2));
  await within(bothAccepted, BOUND, 'both requests accepted');
  const result = await within(env.close(), BOUND, 'close()');
  const [first, second] = await within(c.responses(2), BOUND, 'both responses');
  assert.deepEqual([first.status, second.status], [201, 201]);
  assert.equal(first.headers.connection, 'keep-alive', 'the first response keeps the connection open for the second');
  assert.equal(second.headers.connection, 'close');
  assert.equal(result?.forced, false); assert.equal(result?.unfinished, 0);
  assert.deepEqual(ownersIn(env.dbPath), { owners: 2, integrity: 'ok' });
  assert.deepEqual(unhandled, []);
});

test('P1-001 controlled: a held second pipelined request keeps shutdown open and SQLite usable until it finishes', { timeout: 30_000 }, async t => {
  const env = await launch(t, { shutdownGraceMs: 60_000 }), unhandled = captureUnhandled(t), held = holdHash(t, env, 2);
  const c = await env.connect();
  c.socket.write(registration(env, 1) + registration(env, 2));
  await within(held.started, BOUND, 'second registration hashing'); // both requests accepted; the second is held
  let settled = false; const closing = env.close().then(result => { settled = true; return result; });
  assert.equal(env.running.close(), env.closing, 'a repeated close() returns the same shutdown');
  const [first] = await within(c.responses(1), BOUND, 'first response');
  assert.equal(first.status, 201); assert.equal(first.headers.connection, 'keep-alive');
  await turns(2);
  assert.equal(settled, false, 'shutdown waits for the held request');
  assert.equal(env.running.store.db.isOpen, true, 'SQLite stays open while accepted work runs');
  assert.equal(c.socket.destroyed, false, 'the connection stays open for the second response');
  held.release();
  const [, second] = await within(c.responses(2), BOUND, 'second response');
  assert.equal(second.status, 201); assert.equal(second.headers.connection, 'close');
  const result = await within(closing, BOUND, 'close()');
  assert.equal(result.forced, false); assert.equal(result.unfinished, 0);
  assert.deepEqual(ownersIn(env.dbPath), { owners: 2, integrity: 'ok' });
  assert.deepEqual(unhandled, []);
});

test('P1-001 control: concurrent requests on separate connections both finish before shutdown completes', { timeout: 30_000 }, async t => {
  const env = await launch(t, { shutdownGraceMs: 60_000 }), unhandled = captureUnhandled(t), held = holdHash(t, env, 1);
  const a = await env.connect(), b = await env.connect();
  a.socket.write(registration(env, 1));
  await within(held.started, BOUND, 'first registration hashing'); // a is held
  const bAccepted = once(env.running.server, 'request');
  b.socket.write(registration(env, 2));
  await within(bAccepted, BOUND, 'second registration accepted');
  let settled = false; const closing = env.close().then(result => { settled = true; return result; });
  const fromB = await within(b.response(), BOUND, 'response on the second connection');
  assert.equal(fromB.status, 201); assert.equal(fromB.headers.connection, 'close');
  await within(b.closed, BOUND, 'second connection closing');
  await turns(2);
  assert.equal(settled, false); assert.equal(env.running.store.db.isOpen, true); assert.equal(a.socket.destroyed, false);
  held.release();
  const fromA = await within(a.response(), BOUND, 'response on the first connection');
  assert.equal(fromA.status, 201); assert.equal(fromA.headers.connection, 'close');
  const result = await within(closing, BOUND, 'close()');
  assert.equal(result.forced, false); assert.equal(result.unfinished, 0);
  assert.deepEqual(ownersIn(env.dbPath), { owners: 2, integrity: 'ok' });
  assert.deepEqual(unhandled, []);
});

test('P1-001: an accepted request whose client disconnects is still waited for, with SQLite open until it finishes', { timeout: 30_000 }, async t => {
  const env = await launch(t, { shutdownGraceMs: 60_000 }), unhandled = captureUnhandled(t), held = holdHash(t, env, 1);
  const c = await env.connect();
  c.socket.write(registration(env, 1));
  await within(held.started, BOUND, 'registration hashing');
  c.socket.destroy(); await c.closed;
  const transportClosed = once(env.running.server, 'close');
  let settled = false; const closing = env.close().then(result => { settled = true; return result; });
  await within(transportClosed, BOUND, 'every connection closed'); // the HTTP side is finished; the handler is not
  await turns(2);
  assert.equal(settled, false, 'a closed connection is not finished work');
  assert.equal(env.running.store.db.isOpen, true);
  held.release();
  const result = await within(closing, BOUND, 'close()');
  assert.equal(result.forced, false); assert.equal(result.unfinished, 0);
  assert.deepEqual(ownersIn(env.dbPath), { owners: 1, integrity: 'ok' }, 'the request finished its work');
  assert.deepEqual(unhandled, []);
});

test('P1-001/D: at the deadline unfinished work is reported, gets no fabricated response and cannot write afterwards', { timeout: 30_000 }, async t => {
  const env = await launch(t, { shutdownGraceMs: 200 }), unhandled = captureUnhandled(t), held = holdHash(t, env, 1);
  const createOwner = t.mock.method(env.running.store, 'createOwner');
  const c = await env.connect();
  c.socket.write(registration(env, 1));
  await within(held.started, BOUND, 'registration hashing');
  const result = await within(env.close(), BOUND, 'close()');
  assert.equal(result?.forced, true); assert.equal(result?.unfinished, 1);
  assert.equal(env.logs.find(e => e.event === 'shutdown_deadline')?.unfinished, 1);
  const complete = env.logs.find(e => e.event === 'shutdown_complete');
  assert.equal(complete.forced, true); assert.equal(complete.unfinished, 1);
  assert.equal(env.running.store.db.isOpen, false);
  await within(c.closed, BOUND, 'connection closed');
  assert.doesNotMatch(c.received(), /HTTP\/1\.1/, 'no response is sent for work that did not finish');
  // Destroying the connection does not stop the handler. It resumes after SQLite closed, and its first database call
  // fails before any statement runs, so nothing is written.
  held.release();
  await until(() => createOwner.mock.callCount() > 0, 'the late handler reaching the database');
  assert.match(String(createOwner.mock.calls[0].error?.message), /not open/i);
  await turns(3);
  assert.deepEqual(ownersIn(env.dbPath), { owners: 0, integrity: 'ok' });
  assert.deepEqual(unhandled, []);
  assert.doesNotMatch(JSON.stringify(env.logs), /pipeline-1@example\.com|Fictional-shutdown-password|Fictional Pipeline/);
});

test('P2-002: a startup failure after the database opens and the first backup runs releases both and keeps the error', { timeout: 30_000 }, async t => {
  const defer = cleanupFor(t), dir = tempDir(defer), dbPath = join(dir, 'accounts.sqlite');
  const intervals = t.mock.method(globalThis, 'setInterval'), cleared = t.mock.method(globalThis, 'clearInterval');
  t.mock.method(bcrypt, 'hash', async () => { throw new Error('fictional initialization failure'); }); // accountAPI() setup hashes
  const before = handles();
  await assert.rejects(startServer({ port: 0, dbPath, config: { ...configuration({}), backupDir: join(dir, 'backups') }, logger: () => {} }),
    { message: 'fictional initialization failure' });
  const schedule = intervals.mock.calls.find(call => call.arguments[1] === 6 * 60 * 60 * 1000);
  assert.ok(schedule, 'the backup schedule had been created');
  assert.ok(cleared.mock.calls.some(call => call.arguments[0] === schedule.result), 'the backup schedule was stopped');
  await assertReleased(before, 'failed initialization');
  assert.equal(readdirSync(join(dir, 'backups')).filter(f => f.endsWith('.sqlite')).length, 1, 'the verified startup backup exists');
  const reopened = openAccounts(dbPath);
  try { assert.equal(reopened.db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok'); } finally { reopened.close(); }
  // Windows cannot delete an open SQLite file, so there this also proves the failed server released it.
  assert.doesNotThrow(() => rmSync(dbPath));
});

test('P2-002 guard: a failed initial backup still reports its own error and releases SQLite', { timeout: 30_000 }, async t => {
  const defer = cleanupFor(t), dir = tempDir(defer), dbPath = join(dir, 'accounts.sqlite');
  const fsp = createRequire(import.meta.url)('node:fs/promises');
  const mocked = t.mock.method(fsp, 'mkdir', async () => { throw new Error('fictional disk failure'); }); // first step of a backup
  syncBuiltinESMExports();
  const restore = () => { mocked.mock.restore(); syncBuiltinESMExports(); }; defer(restore);
  const before = handles();
  await assert.rejects(startServer({ port: 0, dbPath, config: { ...configuration({}), backupDir: join(dir, 'backups') }, logger: () => {} }),
    { message: 'Initial backup failed; server not started.' });
  restore();
  await assertReleased(before, 'failed initial backup');
  assert.doesNotThrow(() => rmSync(dbPath));
});

test('P2-001 contract: direct close() waits for a running backup, never closes SQLite under it, and logs why', { timeout: 30_000 }, async t => {
  const env = await launch(t, { shutdownGraceMs: 60_000 }), held = holdBackup(t, env);
  let backupDone = false; const backup = env.running.backups.run().then(path => { backupDone = true; return path; });
  await within(held.started, BOUND, 'backup started');
  let settled = false; const closing = env.close().then(result => { settled = true; return result; });
  await env.logged('shutdown_waiting_for_backup');
  await turns(2);
  assert.equal(settled, false); assert.equal(env.running.server.listening, false);
  assert.equal(env.running.store.db.isOpen, true, 'SQLite is never closed under a running backup');
  held.release();
  const result = await within(closing, BOUND, 'close() after the backup');
  assert.equal(backupDone, true); assert.equal(result.forced, false); assert.equal(env.running.store.db.isOpen, false);
  assert.equal(verifyBackup(await backup).version, 3);
  assert.deepEqual(readdirSync(join(env.dir, 'backups')).filter(f => f.endsWith('.partial')), []);
  assert.deepEqual(shutdownEvents(env.logs), ['shutdown_started', 'shutdown_waiting_for_backup', 'shutdown_complete']);
});

test('P2-001 contract: behind a stalled backup the signal watchdog exits 1 without claiming completion', { timeout: 30_000 }, async t => {
  const env = await launch(t, { shutdownGraceMs: 60_000 }), held = holdBackup(t, env);
  const backup = env.running.backups.run();
  await within(held.started, BOUND, 'backup started');
  const proc = new EventEmitter(), exits = [];
  t.mock.timers.enable({ apis: ['setTimeout'] }); // the watchdog's 15 s, without waiting 15 s
  serverModule.handleShutdownSignals(env.running, { proc, logger: env.logger, exit: code => exits.push(code), watchdogMs: 15_000 });
  proc.emit('SIGTERM', 'SIGTERM'); proc.emit('SIGINT', 'SIGINT');
  await until(() => env.logs.some(e => e.event === 'shutdown_waiting_for_backup'), 'shutdown_waiting_for_backup');
  t.mock.timers.tick(14_999); assert.deepEqual(exits, []);
  t.mock.timers.tick(1); assert.deepEqual(exits, [1]);
  t.mock.timers.reset();
  assert.deepEqual(shutdownEvents(env.logs),
    ['shutdown_signal', 'shutdown_started', 'shutdown_signal_repeated', 'shutdown_waiting_for_backup', 'shutdown_watchdog_expired', 'shutdown_exit']);
  assert.equal(env.logs.find(e => e.event === 'shutdown_exit').code, 1);
  assert.equal(env.running.store.db.isOpen, true, 'the watchdog neither closes SQLite nor claims it was closed');
  held.release(); await backup;
  assert.equal((await within(env.close(), BOUND, 'close() after the backup')).forced, false);
  assert.deepEqual(exits, [1], 'no second exit');
});
