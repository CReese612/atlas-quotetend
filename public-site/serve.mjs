// Local preview server for the static public site. Production hosting can be any static host;
// this server only mirrors that behavior locally. It is deliberately separate from server.mjs
// (the private application) and can only read allowlisted file types inside public-site/.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('./', import.meta.url));

export const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json'
};

const HEADERS = {
  'Cache-Control': 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN'
};

// Map a request path to a file inside root, or null. Rejects encoded traversal, absolute
// drive paths, dotfiles and anything that is not an allowlisted public file type.
export function resolvePublicPath(urlPath, root = ROOT) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath); } catch { return null; }
  if (decoded.includes('\0') || decoded.includes('\\') || /^\/{2,}/.test(decoded)) return null;
  const segments = decoded.split('/').filter(Boolean);
  if (segments.some(s => s.startsWith('.') || s.includes(':'))) return null;
  if (decoded.endsWith('/') || segments.length === 0) segments.push('index.html');
  const file = resolve(root, ...segments);
  const base = resolve(root) + sep;
  if (!file.toLowerCase().startsWith(base.toLowerCase())) return null;
  if (!TYPES[extname(file).toLowerCase()]) return null;
  return file;
}

async function send(res, status, file, method) {
  const body = await readFile(file);
  res.writeHead(status, { ...HEADERS, 'Content-Type': TYPES[extname(file).toLowerCase()], 'Content-Length': body.length });
  res.end(method === 'HEAD' ? undefined : body);
}

export function createPublicServer({ root = ROOT } = {}) {
  return createServer(async (req, res) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { ...HEADERS, Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Method not allowed');
      }
      const { pathname } = new URL(req.url, 'http://preview.invalid');
      let file = resolvePublicPath(pathname, root);
      // Directory requests without a trailing slash (e.g. /assets) fall through to 404.
      if (file && !(await stat(file).then(s => s.isFile(), () => false))) file = null;
      if (file) return await send(res, 200, file, req.method);
      const notFound = resolve(root, '404.html');
      if (await stat(notFound).then(s => s.isFile(), () => false)) return await send(res, 404, notFound, req.method);
      res.writeHead(404, { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    } catch (error) {
      // A failed request must never take the preview down for the next click.
      console.error('Preview request failed:', req.url, error.message);
      if (!res.headersSent) res.writeHead(500, { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end();
    }
  });
}

export function startPublicServer({ port = Number(process.env.PORT ?? 4180), host = '127.0.0.1', root } = {}) {
  const server = createPublicServer({ root });
  return new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(port, host, () => {
      const actual = server.address().port;
      done({ server, port: actual, url: `http://${host}:${actual}/`, close: () => new Promise(r => server.close(r)) });
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { url } = await startPublicServer();
    console.log(`QuoteTend public site preview\n  Website: ${url}\n  Demo:    ${url}demo.html\n  Guided:  ${url}demo.html?tour=1\nPress Ctrl+C to stop.`);
  } catch (error) {
    console.error(error.code === 'EADDRINUSE'
      ? `Port ${process.env.PORT ?? 4180} is already in use. Stop the other preview or set PORT to a free port.`
      : error.message);
    process.exitCode = 1;
  }
}
