import { randomUUID } from 'node:crypto';
import { BROWSERS, launchBrowser, launchPersistent, isBrowserKey, isInstalled } from './browsers.js';
import { copyProfile } from './profiles.js';

/**
 * Cookie sessions held in memory only. The browser's cookie values never leave this module
 * except through takeCookies(), which hands them to a Job and forgets them.
 */
const sessions = new Map();
const TTL_MS = 30 * 60 * 1000;

export class AuthError extends Error {}

function check(browser, profile) {
  if (!isBrowserKey(browser) || !isInstalled(browser)) throw new AuthError('مرورگر انتخاب‌شده نصب نیست.');
  if (profile && BROWSERS[browser].family !== 'chromium') throw new AuthError('پروفایل واقعی فقط برای مرورگرهای مبتنی بر Chromium پشتیبانی می‌شود.');
}

function register(s) {
  const id = randomUUID();
  s.id = id; s.cookies = []; s.createdAt = Date.now();
  s.timer = setTimeout(() => cancelAuth(id), TTL_MS); s.timer.unref?.();
  sessions.set(id, s);
  return s;
}

async function snapshot(s) {
  if (s.state !== 'open') return;
  try { s.cookies = await s.ctx.cookies(s.url); } catch { /* window closed meanwhile */ }
}

/** Read cookies from a private copy of the real browser profile, headless, no window. */
export async function extractFromProfile({ browser, profile, url }) {
  check(browser, profile);
  if (!profile) throw new AuthError('یک پروفایل انتخاب کنید.');
  const copy = await copyProfile(browser, profile).catch(() => { throw new AuthError('پروفایل پیدا نشد.'); });
  let ctx;
  try {
    ctx = await launchPersistent(browser, copy.dir, { headless: true });
    const cookies = await ctx.cookies(url);
    const s = register({ state: 'ready', url });
    s.cookies = cookies;
    return { id: s.id, count: cookies.length };
  } catch (e) {
    throw new AuthError('خواندن کوکی‌های پروفایل ناموفق بود.');
  } finally {
    await ctx?.close().catch(() => {});
    await copy.cleanup();
  }
}

/** Opens a visible window (real profile copy, or a clean one) so the user can sign in. */
export async function openLogin({ browser, profile, url }) {
  check(browser, profile);
  await cancelAll();
  const s = register({ state: 'open', url, browserKey: browser });
  try {
    if (profile) {
      const copy = await copyProfile(browser, profile).catch(() => { throw new AuthError('پروفایل پیدا نشد.'); });
      s.cleanup = copy.cleanup;
      s.ctx = await launchPersistent(browser, copy.dir, { headless: false });
    } else {
      s.browser = await launchBrowser(browser, { headless: false });
      s.ctx = await s.browser.newContext({ viewport: null });
    }
    const page = s.ctx.pages()[0] || (await s.ctx.newPage());
    await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    s.ctx.on('close', () => { if (s.state === 'open') s.state = 'closed'; clearInterval(s.poll); s.browser?.close().catch(() => {}); s.cleanup?.(); });
    s.poll = setInterval(() => snapshot(s), 1500);
    s.poll.unref?.();
    return { id: s.id };
  } catch (e) {
    await dispose(s);
    sessions.delete(s.id);
    throw e instanceof AuthError ? e : new AuthError('باز کردن پنجرهٔ مرورگر ناموفق بود (آیا Chrome بسته است یا نمایشگر در دسترس است؟).');
  }
}

async function dispose(s) {
  clearInterval(s.poll); clearTimeout(s.timer);
  await s.ctx?.close().catch(() => {});
  await s.browser?.close().catch(() => {});
  await s.cleanup?.();
}

export async function finishLogin(id) {
  const s = sessions.get(id);
  if (!s) return null;
  await snapshot(s);
  s.state = 'ready';
  await dispose(s);
  return { id, count: s.cookies.length };
}

export function authStatus(id) {
  const s = sessions.get(id);
  return s ? { id, state: s.state, count: s.cookies.length } : null;
}

/** Hands the cookies to the caller and forgets them. */
export function takeCookies(id) {
  const s = sessions.get(id);
  if (!s) return null;
  const cookies = s.cookies;
  sessions.delete(id);
  dispose(s);
  return cookies;
}

export async function cancelAuth(id) {
  const s = sessions.get(id);
  if (!s) return;
  sessions.delete(id);
  s.cookies = [];
  await dispose(s);
}

export async function cancelAll() { await Promise.all([...sessions.keys()].map(cancelAuth)); }
