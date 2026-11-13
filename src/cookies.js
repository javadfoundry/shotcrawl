const SAMESITE = { no_restriction: 'None', none: 'None', lax: 'Lax', strict: 'Strict' };

export class CookieError extends Error {}

function fromObject(c, siteUrl) {
  if (!c || typeof c !== 'object' || typeof c.name !== 'string' || c.value === undefined) {
    throw new CookieError('فرمت کوکی نامعتبر است: هر کوکی باید name و value داشته باشد.');
  }
  const out = { name: c.name, value: String(c.value) };
  if (c.domain) { out.domain = c.domain; out.path = c.path || '/'; } else if (c.url) out.url = c.url;
  else out.url = siteUrl;
  if (c.domain === undefined && c.path && !out.url) out.path = c.path;
  const exp = c.expirationDate ?? c.expires;
  out.expires = typeof exp === 'number' && exp > 0 ? exp : -1;
  if (typeof c.httpOnly === 'boolean') out.httpOnly = c.httpOnly;
  if (typeof c.secure === 'boolean') out.secure = c.secure;
  const ss = SAMESITE[String(c.sameSite ?? '').toLowerCase()];
  if (ss) out.sameSite = ss;
  return out;
}

export function parseCookies(input, siteUrl) {
  const text = String(input ?? '').trim();
  if (!text) return [];
  if (text.startsWith('[') || text.startsWith('{')) {
    let json;
    try { json = JSON.parse(text); } catch { throw new CookieError('JSON کوکی قابل خواندن نیست.'); }
    const arr = Array.isArray(json) ? json : json && Array.isArray(json.cookies) ? json.cookies : null;
    if (!arr) throw new CookieError('فرمت JSON کوکی نامعتبر است.');
    return arr.map((c) => fromObject(c, siteUrl));
  }
  const parts = text.replace(/^cookie:\s*/i, '').split(';').map((s) => s.trim()).filter(Boolean);
  const out = parts.map((p) => {
    const i = p.indexOf('=');
    if (i <= 0) throw new CookieError('فرمت رشتهٔ کوکی نامعتبر است (انتظار می‌رود a=1; b=2).');
    return { name: p.slice(0, i).trim(), value: p.slice(i + 1).trim(), url: siteUrl };
  });
  return out;
}
