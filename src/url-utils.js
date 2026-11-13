import { createHash } from 'node:crypto';
import picomatch from 'picomatch';
import { config } from './config.js';

export function normalizeUrl(input, base) {
  let u;
  try { u = new URL(input, base); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  u.hash = '';
  u.hostname = u.hostname.toLowerCase();
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.replace(/\/+$/, '') || '/';
  u.searchParams.sort();
  if ([...u.searchParams].length === 0) u.search = '';
  return u.toString();
}

export function isSameSite(url, startUrl, includeSubdomains = false) {
  let a, b;
  try { a = new URL(url); b = new URL(startUrl); } catch { return false; }
  if (a.origin === b.origin) return true;
  if (!includeSubdomains) return false;
  if (a.protocol !== b.protocol) return false;
  const root = b.hostname.replace(/^www\./, '');
  return a.hostname === root || a.hostname.endsWith('.' + root);
}

export function hasNonPageExtension(url) {
  let p;
  try { p = new URL(url).pathname; } catch { return true; }
  const m = /\.([a-z0-9]+)$/i.exec(p.split('/').pop());
  return !!m && config.nonPageExtensions.includes(m[1].toLowerCase());
}

export function isExcluded(url, patterns = config.excludePatterns) {
  let u;
  try { u = new URL(url); } catch { return true; }
  if (config.excludeQuery.test(u.search.replace(/^\?/, ''))) return true;
  const path = u.pathname.toLowerCase();
  for (const raw of patterns) {
    const pat = String(raw).trim().toLowerCase();
    if (!pat) continue;
    if (/[*?[\]{}]/.test(pat)) {
      if (picomatch(pat, { dot: true })(path)) return true;
    } else if (path.includes(pat)) return true;
  }
  return false;
}

export function slugFor(url, used = new Set()) {
  const u = new URL(url);
  let s = u.pathname.replace(/^\/+|\/+$/g, '');
  s = s === '' ? 'home' : s.replace(/\//g, '-');
  s = s.replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'page';
  if (u.search) s += '-' + createHash('sha1').update(u.search).digest('hex').slice(0, 6);
  s = s.slice(0, 100);
  let out = s, n = 2;
  while (used.has(out)) out = `${s}-${n++}`;
  used.add(out);
  return out;
}

export function isLoginUrl(url) { return config.loginPathRe.test(url); }
