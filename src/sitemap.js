import { gunzipSync } from 'node:zlib';
import { XMLParser } from 'fast-xml-parser';
import { config } from './config.js';

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

async function fetchBuf(url, fetchFn) {
  const res = await fetchFn(url, { redirect: 'follow' });
  if (!res.ok) return null;
  let buf = Buffer.from(await res.arrayBuffer());
  if (url.endsWith('.gz') || (buf[0] === 0x1f && buf[1] === 0x8b)) {
    try { buf = gunzipSync(buf); } catch { return null; }
  }
  return buf.toString('utf8');
}

export async function fetchText(url, fetchFn = fetch) {
  try { return await fetchBuf(url, fetchFn); } catch { return null; }
}

export async function discoverSitemapUrls(startUrl, fetchFn = fetch) {
  const origin = new URL(startUrl).origin;
  const robots = await fetchText(origin + '/robots.txt', fetchFn);
  let queue = robots ? parseRobotsSitemaps(robots) : [];
  if (!queue.length) queue = [origin + '/sitemap.xml', origin + '/sitemap_index.xml'];
  const seen = new Set(), urls = new Set();
  let level = queue.map((u) => [u, 0]);
  while (level.length && urls.size < config.sitemap.maxUrls) {
    const [sm, depth] = level.shift();
    if (seen.has(sm)) continue;
    seen.add(sm);
    const xml = await fetchText(sm, fetchFn);
    if (!xml) continue;
    let parsed;
    try { parsed = parseSitemapXml(xml); } catch { continue; }
    parsed.urls.forEach((u) => urls.size < config.sitemap.maxUrls && urls.add(u));
    if (depth < config.sitemap.maxDepth) parsed.sitemaps.forEach((s) => level.push([s, depth + 1]));
  }
  return [...urls];
}
