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
  // Each socket maps to the responses it still owes. Node's server.close() only drops sockets between completed requests:
  // one that has not sent a whole request (a browser pre-connection, a stalled client) counts as busy, and close() also
  // stops the header timeout that would have dropped it, so shutdown could wait forever. See close() below.
  const server = createServer(app), owed = new Map();
  let draining = false, shutdown = null;
  server.on('connection', socket => { owed.set(socket, new Set()); socket.once('close', () => owed.delete(socket)); });
  server.prependListener('request', (req, res) => {
    const responses = owed.get(req.socket); responses?.add(res);
    if (draining) res.setHeader('Connection', 'close');
    // A keep-alive response already under way when shutdown began leaves its socket idle: drop it now, not after the
    // keep-alive timeout. A "Connection: close" response has already ended its socket (writable is false).
    res.once('close', () => { responses?.delete(res); if (draining && !responses?.size && req.socket.writable) req.socket.destroy(); });
  });
  try { await new Promise((resolve, reject) => { server.on('error', reject); server.listen(port, config.host || '127.0.0.1', resolve); }); }
  catch (err) { await backups.stop();store.close(); throw err; }
  // One bounded shutdown however often it is requested: stop accepting connections, drop sockets with nothing in flight,
  // let in-flight requests finish (their connections then close) for up to shutdownGraceMs, then destroy whatever is
  // left. Only after that, with a running backup finished, is SQLite closed. Resolves to { forced, durationMs }.
  async function drainAndClose() {
    draining = true;
    const started = performance.now(), failures = [];
    logger({event:'shutdown_started',graceMs:shutdownGraceMs,connections:owed.size});
    const backupsStopped = backups.stop(); // no new backup starts; one already running finishes before SQLite closes
    let drained = false, deadline;
    const httpClosed = new Promise(resolve => server.close(err => { drained = true; if (err) failures.push('http'); resolve(); }));
    for (const [socket, responses] of owed) {
      if (!responses.size) socket.destroy();
      else for (const res of responses) if (!res.headersSent) res.setHeader('Connection', 'close');
    }
    await Promise.race([httpClosed, new Promise(resolve => { deadline = setTimeout(resolve, shutdownGraceMs); })]);
    clearTimeout(deadline);
    const forced = !drained;
    if (forced) { logger({event:'shutdown_deadline',connections:owed.size}); server.closeAllConnections(); for (const socket of owed.keys()) socket.destroy(); await httpClosed; }
    await backupsStopped;
    try { store.close(); } catch { failures.push('database'); }
    const result = { forced, durationMs: Math.round(performance.now() - started) };
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
    // the platform's SIGKILL, which leaves none.
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
