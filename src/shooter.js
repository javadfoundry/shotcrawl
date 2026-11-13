import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { config } from './config.js';
import { deviceOptions } from './devices.js';
import { guardContext } from './guard.js';

const ANIM_CSS = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
const BANNER_CSS = [
  '#onetrust-banner-sdk', '#onetrust-consent-sdk', '.cookie-banner', '.cookie-notice', '.cookie-consent',
  '[id*="cookie" i][class*="banner" i]', '[id*="cookie" i][id*="banner" i]', '.cc-window', '.cc-banner',
  '#CybotCookiebotDialog', '#cookiebanner', '#cookie-law-info-bar', '.cmp-banner',
].join(',') + '{display:none!important}';

const withTimeout = (p, ms, label) => {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(label)), ms); })]).finally(() => clearTimeout(t));
};

const pngSize = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });

async function prepare(page, url, o) {
  await page.goto(url, { waitUntil: 'load', timeout: config.timeouts.nav });
  await page.waitForLoadState('networkidle', { timeout: config.timeouts.idle }).catch(() => {});
  if (o.disableAnimations) await page.addStyleTag({ content: ANIM_CSS }).catch(() => {});
  if (o.hideCookieBanners) await page.addStyleTag({ content: BANNER_CSS }).catch(() => {});
  await page.evaluate(async ({ maxMs, maxPx, pause }) => {
    const start = Date.now();
    const step = Math.max(200, window.innerHeight);
    let y = 0;
    while (Date.now() - start < maxMs && y < maxPx) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, pause));
      y += step;
      if (y >= document.documentElement.scrollHeight) { window.scrollTo(0, document.documentElement.scrollHeight); await new Promise((r) => setTimeout(r, pause)); break; }
    }
    window.scrollTo(0, 0);
  }, { maxMs: config.timeouts.scrollMax, maxPx: config.scroll.maxPx, pause: config.scroll.pauseMs });
  await page.evaluate((ms) => Promise.race([
    Promise.all([...document.images].filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r; }))),
    new Promise((r) => setTimeout(r, ms)),
  ]), config.timeouts.imgs).catch(() => {});
  await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
  if (o.extraWaitMs) await page.waitForTimeout(o.extraWaitMs);
}

async function capture(page, dpr) {
  const { height, width } = await page.evaluate(() => ({
    height: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0),
    width: document.documentElement.clientWidth,
  }));
  if (height * dpr <= config.tallSegmentPx) {
    const buf = await page.screenshot({ fullPage: true, type: 'png' });
    return { buf, truncated: false };
  }
  const segCss = Math.floor(config.tallSegmentPx / dpr);
  const parts = [];
  let truncated = false;
  for (let y = 0; y < height; y += segCss) {
    const h = Math.min(segCss, height - y);
    try {
      const buf = await page.screenshot({ fullPage: true, type: 'png', clip: { x: 0, y, width, height: h } });
      parts.push({ buf, y });
    } catch { truncated = true; break; }
  }
  if (!parts.length) throw new Error('segment capture failed');
  const meta = await Promise.all(parts.map((p) => sharp(p.buf).metadata()));
  const W = meta[0].width;
  let top = 0;
  const composite = parts.map((p, i) => { const c = { input: p.buf, left: 0, top }; top += meta[i].height; return c; });
  const buf = await sharp({ create: { width: W, height: top, channels: 4, background: '#ffffff' } })
    .composite(composite).png().toBuffer();
  return { buf, truncated };
}

async function shootOne(context, url, o, dpr) {
  const page = await context.newPage();
  try {
    return await withTimeout((async () => { await prepare(page, url, o); return capture(page, dpr); })(), config.timeouts.shot, 'timeout');
  } finally { await page.close().catch(() => {}); }
}

/**
 * Screenshots every page on every device. Mutates page.shots[device].
 * pages: [{url, slug, ...}] ; emits 'shot' events.
 */
export async function shoot({ browser, family, pages, deviceKeys, options, cookies = [], runDir, emit = () => {}, signal }) {
  const total = pages.length * deviceKeys.length;
  let index = 0;
  for (const p of pages) p.shots = {};
  for (const key of deviceKeys) {
    if (signal?.aborted) break;
    const opts = deviceOptions(key, options.hiDpi, family);
    const context = await browser.newContext(opts);
    try {
      await guardContext(context, [...config.excludePatterns, ...(options.exclude || [])]);
      if (cookies.length) await context.addCookies(cookies);
      const todo = [...pages];
      const workers = Array.from({ length: Math.max(1, options.concurrency) }, async () => {
        while (!signal?.aborted) {
          const p = todo.shift();
          if (!p) return;
          let result, err;
          for (let attempt = 0; attempt < 2 && !result && !signal?.aborted; attempt++) {
            try { result = await shootOne(context, p.url, options, opts.deviceScaleFactor); }
            catch (e) { err = e; }
          }
          if (result) {
            const file = `${key}/${p.slug}.png`;
            await mkdir(dirname(join(runDir, file)), { recursive: true });
            await writeFile(join(runDir, file), result.buf);
            const { w, h } = pngSize(result.buf);
            p.shots[key] = { file, w, h, ok: true, ...(result.truncated ? { truncated: true } : {}) };
          } else if (!signal?.aborted) {
            p.shots[key] = { ok: false, error: String(err?.message || 'failed').slice(0, 200) };
          }
          index++;
          if (p.shots[key]) emit('shot', { url: p.url, device: key, ok: p.shots[key].ok, index, total });
        }
      });
      await Promise.all(workers);
    } finally { await context.close().catch(() => {}); }
  }
}
