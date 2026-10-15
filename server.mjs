import express from 'express';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { configuration } from './production-config.mjs';
import { scheduledBackups } from './backups.mjs';
import { resolve, dirname, join, extname } from 'node:path';
import { openAccounts, defaultDatabase } from './account-store.mjs';
import { accountAPI } from './account-api.mjs';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
// Shutdown budget (docs/LAUNCH_OPERATIONS.md, "Shutdown and restart"). Render sends SIGTERM, then SIGKILL once its
// shutdown delay (30 s unless configured) runs out, and stops a service with a persistent disk before starting the
// replacement, so time spent draining is downtime. QuoteTend's slowest requests are password hashing and a 5 MB save:
// 10 s lets them finish without stretching a deploy, and the watchdog exits with a logged reason before the platform's kill.
export const SHUTDOWN_GRACE_MS = 10_000, SHUTDOWN_WATCHDOG_MS = SHUTDOWN_GRACE_MS + 5_000;
const log = entry => console.log(JSON.stringify({at:new Date().toISOString(),...entry}));
// Exact-match allowlist built once at startup; request paths are never joined onto the filesystem.
// The design tokens and product components are shared with the public website (public-site/), so the
// private app and the public demo use one design system.
export function staticFiles() {
  const listed = (dir, exts) => readdirSync(new URL(dir + '/', import.meta.url)).filter(f => exts.includes(extname(f)) && !f.startsWith('.')).map(f => ['/' + dir + '/' + f, dir + '/' + f]);
  return new Map([['/account', 'app/index.html'], ['/signin', 'app/signin.html'], ['/security', 'app/security.html'],
    ['/favicon.svg', 'public-site/assets/favicon.svg'], ['/shared/tokens.css', 'public-site/assets/css/tokens.css'], ['/shared/app.css', 'public-site/assets/css/app.css'],
    ...['domain.js', 'import-mapping.js', 'results.js'].map(f => ['/' + f, f]),
    ...listed('app', ['.js', '.css']), ...listed('app/fonts', ['.woff2'])]);
}
export async function startServer({ port = Number(process.env.PORT || 4173), dbPath = defaultDatabase(), config = configuration(), logger = log, shutdownGraceMs = SHUTDOWN_GRACE_MS } = {}) {
  const store = openAccounts(dbPath);
  const backups=scheduledBackups(store.db,config.backupDir || join(dirname(dbPath),'backups'),logger);
  try {await backups.run();}catch(e){await backups.stop();store.close();throw new Error('Initial backup failed; server not started.');}
  const app = express();
  if(config.production)app.set('trust proxy',1); app.disable('x-powered-by');
  const files = staticFiles();
  app.use((req, res, next) => {
    const port = req.socket.localPort;
    if (!(config.production ? [new URL(config.origin).host] : ['127.0.0.1:' + port, 'localhost:' + port]).includes(req.headers.host)) return res.status(403).end('Invalid local host');
    if(config.production && !req.secure)return res.status(400).end('HTTPS is required.');
    if(config.production)res.set('Strict-Transport-Security','max-age=31536000');
    const requestId=randomUUID();res.set('X-Request-Id',requestId);
    res.on('finish',()=>{if(res.statusCode>=500)logger({event:'request_failed',requestId,status:res.statusCode,method:req.method});});
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" });
    next();
  });
  app.get('/healthz',(req,res)=>{let ok=false;try{store.db.prepare('SELECT 1').get();ok=backups.healthy();}catch{}res.status(ok?200:503).json({status:ok?'ok':'unhealthy'});});
  app.use('/api', await accountAPI(store, port,config));
  app.use(async (req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) return res.status(405).end();
    if (req.path === '/') return res.redirect(302, '/account');
    const file = files.get(req.path);
    if (!file) return res.status(404).end('Not found');
    const data = await readFile(new URL(file, import.meta.url));
    const type = TYPES[extname(file)];
    // Fonts are public, versioned with the release and safe to cache; everything else stays no-store.
    if (type === 'font/woff2') res.set('Cache-Control', 'public, max-age=604800');
    res.type(type).send(data);
  });
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    // A malformed request (bad JSON, an undecodable %-escape in the URL) is the caller's error, not a server fault.
    const status = err.type === 'entity.too.large' ? 413 : err.type === 'entity.parse.failed' || err.status === 400 || err.statusCode === 400 ? 400 : 500;
    res.status(status).json({ error: status === 413 ? 'Workspace exceeds the 5 MB limit.' : status === 400 ? (err.type === 'entity.parse.failed' ? 'Invalid JSON request.' : 'Invalid request.') : 'Unable to complete the request. No success was confirmed. Reload to check saved data.' });
  });
  // Shutdown bookkeeping, kept separately for the transport and for the work (see close() below):
  // - `connections`: per socket, the accepted responses it still owes in order, and whether one of them has told the
  //   client "Connection: close". Node's server.close() only drops sockets between completed requests; one that has not
  //   sent a whole request (a browser pre-connection, a stalled client) counts as busy, and close() also stops the
  //   header timeout that would have dropped it, so shutdown could wait forever.
  // - `unfinished`: accepted requests whose handler has not yet ended its response. A closed socket does not stop a
  //   handler (an awaited bcrypt hash carries on), so a closed connection is not finished work.
  const connections = new Map(), unfinished = new Set();
  let draining = false, shutdown = null, onIdle = null;
  const server = createServer((req, res) => {
    const conn = connections.get(req.socket);
    // After a response has said "Connection: close", no later request on that connection may be processed (RFC 9112 §9.6).
    if (conn?.closing) return;
    unfinished.add(res); conn?.owed.push(res);
    const { end, writeHead } = res;
    // The handler is done once it ends its response, whether or not the client is still connected to receive it.
    res.end = function (...args) { try { return end.apply(this, args); } finally { unfinished.delete(res); if (!unfinished.size) onIdle?.(); } };
    // While draining, only the last response a connection owes says "Connection: close". An earlier pipelined response
    // that said it would end the connection before the later, already accepted, responses were sent.
    res.writeHead = function (...args) {
      if (draining && conn && conn.owed.at(-1) === res && !this.headersSent) { this.setHeader('Connection', 'close'); conn.closing = true; }
      return writeHead.apply(this, args);
    };
    // A connection left owing nothing while draining (its last response was sent keep-alive before shutdown began) is
    // idle: drop it now rather than after the keep-alive timeout.
    res.once('close', () => {
      if (!conn) return;
      const index = conn.owed.indexOf(res); if (index >= 0) conn.owed.splice(index, 1);
      if (draining && !conn.owed.length && !conn.closing) req.socket.destroy();
    });
    app(req, res);
  });
  server.on('connection', socket => { connections.set(socket, { owed: [], closing: false }); socket.once('close', () => connections.delete(socket)); });
  try { await new Promise((resolve, reject) => { server.on('error', reject); server.listen(port, config.host || '127.0.0.1', resolve); }); }
  catch (err) { await backups.stop();store.close(); throw err; }
  // One shutdown however often it is requested:
  // 1. Stop accepting connections and drop every socket that owes no response (no request was accepted on it).
  // 2. For up to shutdownGraceMs, let accepted requests finish. Each connection closes after the last response it owes.
  //    The drain is clean only when every connection has closed AND every accepted handler has finished.
  // 3. At the deadline, destroy the remaining connections (forced). Handlers still running are counted as `unfinished`;
  //    destroying a socket does not stop them. Every database write is one synchronous transaction, so none is open
  //    when SQLite closes, and such a handler fails at its first database call afterwards without writing anything.
  // 4. Wait for a backup that is already running. It is never cut short: Node's SQLite backup cannot be cancelled and
  //    closing the database under it is unsafe, so this wait has no deadline (the signal watchdog bounds the process).
  // 5. Close SQLite. Resolves to { forced, unfinished, durationMs }.
  async function drainAndClose() {
    draining = true;
    const started = performance.now(), failures = [];
    logger({event:'shutdown_started',graceMs:shutdownGraceMs,connections:connections.size,requests:unfinished.size});
    const backupsStopped = backups.stop(); // no new backup starts; one already running finishes before SQLite closes
    let backupsDone = false; backupsStopped.then(() => { backupsDone = true; });
    const httpClosed = new Promise(resolve => server.close(err => { if (err) failures.push('http'); resolve(); }));
    for (const [socket, conn] of connections) if (!conn.owed.length) socket.destroy();
    // Once every connection has closed no request can arrive, so from then on `unfinished` only shrinks.
    const handlersDone = () => unfinished.size ? new Promise(resolve => { onIdle = resolve; }) : undefined;
    let deadline;
    const drained = await Promise.race([httpClosed.then(handlersDone).then(() => true), new Promise(resolve => { deadline = setTimeout(resolve, shutdownGraceMs, false); })]);
    clearTimeout(deadline);
    const forced = !drained;
    if (forced) {
      logger({event:'shutdown_deadline',connections:connections.size,unfinished:unfinished.size});
      server.closeAllConnections(); for (const socket of connections.keys()) socket.destroy(); await httpClosed;
    }
    if (!backupsDone) logger({event:'shutdown_waiting_for_backup'});
    await backupsStopped;
    const left = unfinished.size;
    try { store.close(); } catch { failures.push('database'); }
    const result = { forced, unfinished: left, durationMs: Math.round(performance.now() - started) };
    // Stage names only: error text can carry file paths or request data.
    if (failures.length) { logger({event:'shutdown_failed',stages:failures,...result}); throw new Error('QuoteTend did not shut down cleanly.'); }
    logger({event:'shutdown_complete',...result});
    return result;
  }
  return { server, store, backups, port: server.address().port, close: () => shutdown ??= drainAndClose() };
}
// SIGTERM (Render, containers) and SIGINT (Ctrl+C) start the same single shutdown. A repeated signal is logged and ignored:
// the shutdown already has a deadline, and exiting early would cut off requests it is still finishing. Exit code 0 is a
// clean shutdown; 1 means the deadline forced it, a stage failed, or the watchdog fired.
export function handleShutdownSignals(running, { proc = process, logger = log, exit = code => proc.exit(code), watchdogMs = SHUTDOWN_WATCHDOG_MS } = {}) {
  let stopping = false, exited = false;
  const onSignal = signal => {
    if (stopping) return logger({event:'shutdown_signal_repeated',signal});
    stopping = true; logger({event:'shutdown_signal',signal});
    const finish = code => { if (exited) return; exited = true; clearTimeout(watchdog); logger({event:'shutdown_exit',code}); exit(code); };
    // Last resort if a stage after the HTTP drain (a running backup, SQLite) stalls: exit with a logged reason before
    // the platform's SIGKILL, which leaves none. It claims nothing: no shutdown_complete is logged and SQLite is left to
    // the operating system, whatever close() was still waiting for.
    const watchdog = setTimeout(() => { logger({event:'shutdown_watchdog_expired'}); finish(1); }, watchdogMs);
    new Promise(resolve => resolve(running.close())).then(result => result?.forced ? 1 : 0, () => 1).then(finish);
  };
  for (const signal of ['SIGINT', 'SIGTERM']) proc.on(signal, onSignal);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const running = await startServer();
  handleShutdownSignals(running);
  console.log(process.env.NODE_ENV==='production' ? 'QuoteTend started. Check configured HTTPS origin and /healthz.' : 'QuoteTend (local): http://127.0.0.1:' + running.port + '/account\nSign in: http://127.0.0.1:' + running.port + '/signin\nLocal database: ' + defaultDatabase());
}
