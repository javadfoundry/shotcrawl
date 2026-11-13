import express from 'express';
import { ZipArchive } from 'archiver';
import { existsSync } from 'node:fs';
import { resolve, sep, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { parseCookies, CookieError } from './cookies.js';
import { Job, getJob, getActiveJob } from './jobs.js';
import { devices as deviceDefs } from './devices.js';
import { listBrowsers, isBrowserKey, isInstalled } from './browsers.js';
import { listProfiles } from './profiles.js';
import { AuthError, extractFromProfile, openLogin, finishLogin, authStatus, takeCookies, cancelAuth } from './auth.js';

const bad = (res, msg) => res.status(400).json({ error: msg });
const bool = (v, d) => (typeof v === 'boolean' ? v : d);
const int = (v, d, min, max) => {
  if (v === undefined || v === null || v === '') return d;
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : NaN;
};

export function validate(body) {
  const d = config.defaults;
  let url;
  try { url = new URL(String(body.url)); } catch { return { error: 'آدرس سایت نامعتبر است.' }; }
  if (!/^https?:$/.test(url.protocol)) return { error: 'آدرس باید با http یا https شروع شود.' };
  const devs = body.devices === undefined ? d.devices : body.devices;
  if (!Array.isArray(devs) || !devs.length || devs.some((x) => !(x in deviceDefs))) return { error: 'حداقل یک دستگاه معتبر انتخاب کنید.' };
  const maxPages = int(body.maxPages, d.maxPages, 1, 500);
  const maxDepth = int(body.maxDepth, d.maxDepth, 0, 10);
  const extraWaitMs = int(body.extraWaitMs, d.extraWaitMs, 0, 10000);
  if ([maxPages, maxDepth, extraWaitMs].some(Number.isNaN)) return { error: 'مقادیر عددی نامعتبر است.' };
  const exclude = body.exclude === undefined ? [] : body.exclude;
  if (!Array.isArray(exclude) || exclude.some((x) => typeof x !== 'string')) return { error: 'فهرست مسیرهای مستثنا نامعتبر است.' };
  const browser = body.browser === undefined ? 'chromium' : body.browser;
  if (!isBrowserKey(browser) || !isInstalled(browser)) return { error: 'مرورگر انتخاب‌شده نصب نیست.' };
  return {
    url: url.toString(), devices: [...new Set(devs)],
    options: {
      maxPages, maxDepth, extraWaitMs, exclude: exclude.map((s) => s.trim()).filter(Boolean),
      includeSubdomains: bool(body.includeSubdomains, d.includeSubdomains), respectRobots: bool(body.respectRobots, d.respectRobots),
      disableAnimations: bool(body.disableAnimations, d.disableAnimations), hideCookieBanners: bool(body.hideCookieBanners, d.hideCookieBanners),
      browser, hiDpi: bool(body.hiDpi, d.hiDpi), delayMs: d.delayMs, concurrency: d.concurrency,
    },
  };
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // DNS-rebinding guard: only accept loopback host names.
  app.use((req, res, next) => (/^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(req.headers.host || '') ? next() : res.status(403).end()));
  // CSRF guard: state-changing requests must come from this very origin (or a non-browser client).
  app.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return res.status(403).end();
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));

  app.post('/api/jobs', (req, res) => {
    const v = validate(req.body || {});
    if (v.error) return bad(res, v.error);
    if (getActiveJob()) return res.status(409).json({ error: 'یک کار در حال اجراست.' });
    let cookies = [];
    if (req.body.authId) {
      const st = authStatus(String(req.body.authId));
      if (!st) return bad(res, 'نشست ورود پیدا نشد؛ دوباره وارد شوید.');
      if (st.state === 'open') return res.status(409).json({ error: 'ابتدا ورود در پنجرهٔ مرورگر را تأیید کنید.' });
      cookies = takeCookies(String(req.body.authId));
    } else try { cookies = parseCookies(req.body.cookies, v.url); } catch (e) {
      if (e instanceof CookieError) return bad(res, e.message);
      throw e;
    }
    const job = new Job({ url: v.url, cookies, devices: v.devices, options: v.options }).start();
    res.status(201).json({ id: job.id });
  });

  app.get('/api/jobs/:id/events', (req, res) => {
    const job = getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'کار پیدا نشد.' });
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders();
    const send = (ev) => res.write(`event: ${ev.type}\ndata: ${JSON.stringify(ev.data)}\n\n`);
    job.history.forEach(send);
    if (!job.running) return res.end();
    const onEvent = (ev) => send(ev);
    const onEnd = () => res.end();
    job.on('event', onEvent); job.once('end', onEnd);
    req.on('close', () => { job.off('event', onEvent); job.off('end', onEnd); });
  });

  app.get('/api/jobs/:id', (req, res) => {
    const job = getJob(req.params.id);
    return job ? res.json(job.status()) : res.status(404).json({ error: 'کار پیدا نشد.' });
  });

  app.delete('/api/jobs/:id', async (req, res) => {
    const job = getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'کار پیدا نشد.' });
    await job.cancel();
    res.json({ ok: true });
  });

  app.get('/api/browsers', (_req, res) => res.json(listBrowsers()));
  app.get('/api/browsers/:key/profiles', async (req, res) => res.json(isBrowserKey(req.params.key) ? await listProfiles(req.params.key) : []));

  const authBody = (req) => {
    const b = req.body || {};
    let url;
    try { url = new URL(String(b.url)); if (!/^https?:$/.test(url.protocol)) throw 0; } catch { return { error: 'آدرس سایت نامعتبر است.' }; }
    return { browser: String(b.browser || 'chrome'), profile: b.profile ? String(b.profile) : undefined, url: url.toString() };
  };
  const authFail = (res, e) => (e instanceof AuthError ? bad(res, e.message) : res.status(500).json({ error: 'خطای داخلی.' }));
  // mode "extract": read cookies from a private copy of the real profile (no window).
  // mode "login": open a visible window; the user signs in and confirms.
  app.post('/api/auth', async (req, res) => {
    const a = authBody(req); if (a.error) return bad(res, a.error);
    try {
      if (req.body.mode === 'login') return res.status(201).json(await openLogin(a));
      return res.status(201).json(await extractFromProfile(a));
    } catch (e) { return authFail(res, e); }
  });
  app.get('/api/auth/:id', (req, res) => { const st = authStatus(req.params.id); return st ? res.json(st) : res.status(404).json({ error: 'نشست پیدا نشد.' }); });
  app.post('/api/auth/:id/finish', async (req, res) => { const r = await finishLogin(req.params.id); return r ? res.json(r) : res.status(404).json({ error: 'نشست پیدا نشد.' }); });
  app.delete('/api/auth/:id', async (req, res) => { await cancelAuth(req.params.id); res.json({ ok: true }); });

  app.get('/api/jobs/:id/zip', (req, res) => {
    const job = getJob(req.params.id);
    if (!job || !job.runDir || !existsSync(job.runDir)) return res.status(404).json({ error: 'خروجی پیدا نشد.' });
    res.attachment(`${basename(job.runDir)}.zip`);
    const zip = new ZipArchive({ zlib: { level: 6 } });
    zip.on('error', () => res.destroy());
    zip.pipe(res);
    zip.directory(job.runDir, false);
    zip.finalize();
  });

  const root = resolve(config.outputDir);
  app.get('/files/*splat', (req, res) => {
    const rel = decodeURIComponent(req.path.slice('/files/'.length));
    const full = resolve(root, rel);
    if (full !== root && !full.startsWith(root + sep)) return res.status(403).end();
    res.sendFile(full, { dotfiles: 'deny' }, (err) => { if (err && !res.headersSent) res.status(404).end(); });
  });

  return app;
}

export function listen(port = config.port) {
  return new Promise((ok) => { const s = createApp().listen(port, config.host, () => ok(s)); });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  listen().then((s) => console.log(`shotcrawl: http://${config.host}:${s.address().port}`));
}
