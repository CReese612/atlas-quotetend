// Generates the QuoteTend favicon and app icons from the wordmark's vector Ꝙ (components.js Q_GLYPH).
// Run after changing the glyph: node scripts/generate-brand-icons.mjs
// Uses the installed Microsoft Edge through the existing Playwright dev dependency to rasterize PNGs.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { Q_GLYPH } from '../public-site/assets/js/components.js';

const SITE = new URL('../public-site/', import.meta.url);
const EVERGREEN = '#143F35', IVORY = '#F8F7F2', GOLD = '#D9AE5F';

// The glyph's ink spans roughly x 2–85.5 and y -1–93 in its own units; center it in a 64-unit tile.
function iconSvg({ rounded = true, scale = 0.48 } = {}) {
  const tx = (64 - 83.5 * scale) / 2 - 2 * scale, ty = (64 - 94 * scale) / 2 + 1 * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">`
    + `<rect width="64" height="64" rx="${rounded ? 14 : 0}" fill="${EVERGREEN}"/>`
    + `<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale})">`
    + `<path fill="${IVORY}" fill-rule="evenodd" d="${Q_GLYPH.bowl}"/><path fill="${IVORY}" d="${Q_GLYPH.tail}"/>`
    + `<path fill="none" stroke="${GOLD}" stroke-width="10" stroke-linecap="round" d="${Q_GLYPH.stroke}"/></g></svg>\n`;
}

const browser = await chromium.launch({ channel: process.env.QUOTETEND_BROWSER || 'msedge', headless: true });
const page = await browser.newPage();
async function png(svg, size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

try {
  await mkdir(new URL('assets/icons/', SITE), { recursive: true });
  const rounded = iconSvg(), square = iconSvg({ rounded: false }), maskable = iconSvg({ rounded: false, scale: 0.38 });
  await writeFile(new URL('assets/favicon.svg', SITE), rounded);
  const out = {
    'assets/icons/apple-touch-icon.png': await png(square, 180),
    'assets/icons/icon-192.png': await png(rounded, 192),
    'assets/icons/icon-512.png': await png(rounded, 512),
    'assets/icons/icon-maskable-512.png': await png(maskable, 512)
  };
  for (const [path, data] of Object.entries(out)) await writeFile(new URL(path, SITE), data);

  // favicon.ico at the site root (browsers request it automatically): PNG images in an ICO container.
  const images = [await png(rounded, 16), await png(rounded, 32), await png(rounded, 48)];
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((img, i) => {
    const size = [16, 32, 48][i], e = 6 + 16 * i;
    header.writeUInt8(size, e); header.writeUInt8(size, e + 1); header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(img.length, e + 8); header.writeUInt32LE(offset, e + 12);
    offset += img.length;
  });
  await writeFile(new URL('favicon.ico', SITE), Buffer.concat([header, ...images]));

  const manifest = {
    name: 'QuoteTend', short_name: 'QuoteTend', description: 'Estimate follow-up for roofing, siding and window contractors.',
    start_url: './', scope: './', display: 'browser', background_color: '#F8F7F2', theme_color: EVERGREEN,
    icons: [
      { src: 'assets/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'assets/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: 'assets/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  };
  await writeFile(new URL('site.webmanifest', SITE), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log('Wrote favicon.svg, favicon.ico, site.webmanifest and', Object.keys(out).length, 'PNG icons.');
} finally {
  await browser.close();
}
