import { describe, it, expect } from 'vitest';
import { gzipSync } from 'node:zlib';
import { discoverSitemapUrls, parseSitemapXml, parseRobotsDisallow } from '../src/sitemap.js';

const urlset = (...u) => `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${u.map((x) => `<url><loc>${x}</loc></url>`).join('')}</urlset>`;
const mkFetch = (map) => async (url) => {
  const v = map[url];
  if (v === undefined) return { ok: false };
  const buf = Buffer.isBuffer(v) ? v : Buffer.from(v);
  return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) };
};

describe('sitemap', () => {
  it('parses simple and index', () => {
    expect(parseSitemapXml(urlset('http://a/1', 'http://a/2')).urls).toHaveLength(2);
    expect(parseSitemapXml('<sitemapindex><sitemap><loc>http://a/s.xml</loc></sitemap></sitemapindex>').sitemaps).toEqual(['http://a/s.xml']);
  });
  it('discovers via robots, index and gz', async () => {
    const f = mkFetch({
      'http://a.com/robots.txt': 'Sitemap: http://a.com/index.xml',
      'http://a.com/index.xml': '<sitemapindex><sitemap><loc>http://a.com/p.xml.gz</loc></sitemap></sitemapindex>',
      'http://a.com/p.xml.gz': gzipSync(urlset('http://a.com/x', 'http://a.com/y')),
    });
    expect(await discoverSitemapUrls('http://a.com/', f)).toEqual(['http://a.com/x', 'http://a.com/y']);
  });
  it('falls back to /sitemap.xml', async () => {
    const f = mkFetch({ 'http://a.com/sitemap.xml': urlset('http://a.com/z') });
    expect(await discoverSitemapUrls('http://a.com', f)).toEqual(['http://a.com/z']);
  });
  it('robots disallow', () => {
    expect(parseRobotsDisallow('User-agent: bot\nDisallow: /no\nUser-agent: *\nDisallow: /admin\nDisallow:')).toEqual(['/admin']);
  });
});

describe('sitemap safety', () => {
  it('does not fetch off-site sitemaps', async () => {
    const called = [];
    const f = async (u) => { called.push(u); return { ok: false }; };
    await discoverSitemapUrls('http://a.com', async (u) => (u.endsWith('robots.txt')
      ? { ok: true, arrayBuffer: async () => Buffer.from('Sitemap: http://169.254.169.254/x.xml') } : f(u)));
    expect(called.some((u) => u.includes('169.254'))).toBe(false);
  });
  it('rejects oversized gzip output', async () => {
    const { gzipSync } = await import('node:zlib');
    const big = gzipSync(Buffer.alloc(60 * 1024 * 1024, 'a'));
    const f = async (u) => (u.endsWith('sitemap.xml') ? { ok: true, arrayBuffer: async () => big } : { ok: false });
    expect(await discoverSitemapUrls('http://a.com', f)).toEqual([]);
  });
});
