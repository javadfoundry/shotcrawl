import { gunzipSync } from 'node:zlib';
import { XMLParser } from 'fast-xml-parser';
import { config } from './config.js';
import { isSameSite } from './url-utils.js';

const MAX_BYTES = 50 * 1024 * 1024;

const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true });
const arr = (x) => (x === undefined ? [] : Array.isArray(x) ? x : [x]);

export function parseSitemapXml(xml) {
  const doc = parser.parse(xml);
  return {
    urls: arr(doc.urlset?.url).map((u) => String(u.loc ?? '').trim()).filter(Boolean),
    sitemaps: arr(doc.sitemapindex?.sitemap).map((u) => String(u.loc ?? '').trim()).filter(Boolean),
  };
}

export function parseRobotsSitemaps(text) {
  return [...String(text).matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);
}

export function parseRobotsDisallow(text) {
  const rules = [];
  let applies = false, seen = false;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) { continue; }
    const k = m[1].toLowerCase();
    if (k === 'user-agent') { if (seen) { seen = false; applies = false; } applies = applies || m[2].trim() === '*'; }
    else { seen = true; if (applies && k === 'disallow' && m[2].trim()) rules.push(m[2].trim()); }
  }
  return rules;
}

async function readLimited(res) {
  const len = Number(res.headers?.get?.('content-length'));
  if (len > MAX_BYTES) return null;
  if (!res.body?.getReader) {
    const b = Buffer.from(await res.arrayBuffer());
    return b.length > MAX_BYTES ? null : b;
  }
  const chunks = [];
  let n = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > MAX_BYTES) { await reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

// Only same-site http(s) URLs are fetched (SSRF guard). Redirects are followed manually so every
// hop is validated *before* it is requested.
async function fetchBuf(url, fetchFn, scope) {
  let current = url, res;
  for (let hop = 0; hop <= 5; hop++) {
    if (scope && !isSameSite(current, scope.startUrl, scope.includeSubdomains)) return null;
    res = await fetchFn(current, { redirect: 'manual' });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers?.get?.('location');
      if (!loc) return null;
      current = new URL(loc, current).toString();
      continue;
    }
    break;
  }
  if (!res || res.ok === false || [301, 302, 303, 307, 308].includes(res.status)) return null;
  let buf = await readLimited(res);
  if (!buf) return null;
  if (url.endsWith('.gz') || (buf[0] === 0x1f && buf[1] === 0x8b)) {
    try { buf = gunzipSync(buf, { maxOutputLength: MAX_BYTES }); } catch { return null; }
  }
  return buf.toString('utf8');
}

export async function fetchText(url, fetchFn = fetch, scope) {
  try { return await fetchBuf(url, fetchFn, scope); } catch { return null; }
}

export async function discoverSitemapUrls(startUrl, fetchFn = fetch, includeSubdomains = false) {
  const scope = { startUrl, includeSubdomains };
  const origin = new URL(startUrl).origin;
  const robots = await fetchText(origin + '/robots.txt', fetchFn, scope);
  let queue = robots ? parseRobotsSitemaps(robots) : [];
  if (!queue.length) queue = [origin + '/sitemap.xml', origin + '/sitemap_index.xml'];
  const seen = new Set(), urls = new Set();
  let level = queue.map((u) => [u, 0]);
  while (level.length && urls.size < config.sitemap.maxUrls) {
    const [sm, depth] = level.shift();
    if (seen.has(sm)) continue;
    seen.add(sm);
    const xml = await fetchText(sm, fetchFn, scope);
    if (!xml) continue;
    let parsed;
    try { parsed = parseSitemapXml(xml); } catch { continue; }
    parsed.urls.forEach((u) => urls.size < config.sitemap.maxUrls && urls.add(u));
    if (depth < config.sitemap.maxDepth) parsed.sitemaps.forEach((s) => level.push([s, depth + 1]));
  }
  return [...urls];
}
