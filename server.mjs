import express from 'express';
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
export async function startServer({ port = Number(process.env.PORT || 4173), dbPath = defaultDatabase(), config = configuration(), logger = entry => console.log(JSON.stringify({at:new Date().toISOString(),...entry})) } = {}) {
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
    const status = err.type === 'entity.too.large' ? 413 : err.type === 'entity.parse.failed' ? 400 : 500;
    res.status(status).json({ error: status === 413 ? 'Workspace exceeds the 5 MB limit.' : status === 400 ? 'Invalid JSON request.' : 'Unable to complete the request. No success was confirmed. Reload to check saved data.' });
  });
  let server;
  try { server = await new Promise((resolve, reject) => { const s = app.listen(port, config.host || '127.0.0.1', () => resolve(s)); s.on('error', reject); }); }
  catch (err) { await backups.stop();store.close(); throw err; }
  return { server, store, port: server.address().port,
    close: async () => { await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));await backups.stop();store.close(); } };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const running = await startServer();
  console.log(process.env.NODE_ENV==='production' ? 'QuoteTend started. Check configured HTTPS origin and /healthz.' : 'QuoteTend (local): http://127.0.0.1:' + running.port + '/account\nSign in: http://127.0.0.1:' + running.port + '/signin\nLocal database: ' + defaultDatabase());
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await running.close(); process.exit(0); });
}
