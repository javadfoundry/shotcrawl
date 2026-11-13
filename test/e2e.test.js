import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { createFixture } from './fixture-site.js';
import { config } from '../src/config.js';
import { listen } from '../src/server.js';
import { getJob } from '../src/jobs.js';

let fixture, srv, base, out;
const api = (path, init) => fetch(base + path, init);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pngSize = (b) => ({ w: b.readUInt32BE(16), h: b.readUInt32BE(20) });

async function runJob(body) {
  const res = await api('/api/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: fixture.url, delayMs: 0, ...body }) });
  expect(res.status).toBe(201);
  const { id } = await res.json();
  for (let i = 0; i < 600; i++) {
    const st = await (await api(`/api/jobs/${id}`)).json();
    if (['done', 'error', 'cancelled'].includes(st.state)) return { id, st };
    await sleep(200);
  }
  throw new Error('job timeout');
}

beforeAll(async () => {
  out = await mkdtemp(join(tmpdir(), 'shotcrawl-'));
  config.outputDir = out + '/';
  fixture = await createFixture();
  srv = await listen(0);
  base = `http://127.0.0.1:${srv.address().port}`;
}, 30000);
afterAll(async () => { srv?.close(); fixture?.server.close(); });

const urls = (st) => st.manifest.pages.map((p) => new URL(p.url).pathname).sort();

describe('e2e', () => {
  it('without cookie: public pages only, never /logout', async () => {
    const { st } = await runJob({ devices: ['desktop'], maxPages: 30 });
    expect(st.state).toBe('done');
    const paths = urls(st);
    expect(paths).toEqual(expect.arrayContaining(['/', '/about', '/contact', '/sitemap-only', '/tall', '/lazy', '/login']));
    expect(paths).not.toContain('/dashboard');   // redirected to /login, which is captured once as a public page
    expect(paths.filter((p) => p === '/login')).toHaveLength(1);
    expect(st.manifest.skipped.some((s) => s.url.endsWith('/missing') && s.reason === '404')).toBe(true);
    expect(fixture.state.loggedOut).toBe(false);
    expect(fixture.state.lazyImageHits).toBeGreaterThan(0);
  }, 120000);

  it('with cookie: protected pages, three devices, tall page, no leaks', async () => {
    const { id, st } = await runJob({ cookies: 'session=abc', maxPages: 30 });
    expect(st.state).toBe('done');
    expect(urls(st)).toEqual(expect.arrayContaining(['/dashboard', '/dashboard/settings']));
    expect(st.authenticated).toBe(true);
    expect(fixture.state.loggedOut).toBe(false);

    const dir = st.outputDir;
    const home = st.manifest.pages.find((p) => new URL(p.url).pathname === '/');
    expect(home.shots.desktop.w).toBe(1440);
    expect(home.shots.tablet.w).toBe(820 * 2);
    expect(home.shots.mobile.w).toBe(390 * 2);
    const tall = st.manifest.pages.find((p) => p.url.endsWith('/tall'));
    expect(tall.shots.desktop.h).toBeGreaterThanOrEqual(20000);
    const png = await readFile(join(dir, tall.shots.desktop.file));
    expect(pngSize(png).h).toBe(tall.shots.desktop.h);

    // no cookie value anywhere in the outputs or API responses
    const manifestTxt = await readFile(join(dir, 'manifest.json'), 'utf8');
    const galleryTxt = await readFile(join(dir, 'index.html'), 'utf8');
    const evTxt = JSON.stringify(getJob(id).history);
    for (const t of [manifestTxt, galleryTxt, evTxt, JSON.stringify(st)]) { expect(t).not.toMatch(/session=abc|"abc"/); expect(t).not.toContain('abc'); }
    expect(await readdir(dir)).toEqual(expect.arrayContaining(['desktop', 'tablet', 'mobile', 'manifest.json', 'index.html']));

    const zip = await api(`/api/jobs/${id}/zip`);
    expect(zip.status).toBe(200);
    expect((await zip.arrayBuffer()).byteLength).toBeGreaterThan(1000);
  }, 240000);

  it('rejects bad input, concurrent jobs and path traversal', async () => {
    const r = await api('/api/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'ftp://x' }) });
    expect(r.status).toBe(400);
    const raw = await new Promise((ok) => {
      http.get({ host: '127.0.0.1', port: srv.address().port, path: '/files/../../etc/passwd' }, (res) => ok(res.statusCode));
    });
    expect([403, 404]).toContain(raw);
    const enc = await api('/files/%2e%2e/%2e%2e/etc/passwd');
    expect([403, 404]).toContain(enc.status);
  });

  it('cancel closes the browser and a second job gets 409', async () => {
    const res = await api('/api/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: fixture.url, maxPages: 30 }) });
    const { id } = await res.json();
    const second = await api('/api/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: fixture.url }) });
    expect(second.status).toBe(409);
    await sleep(1500);
    const job = getJob(id);
    await api(`/api/jobs/${id}`, { method: 'DELETE' });
    for (let i = 0; i < 100 && job.running; i++) await sleep(100);
    expect(job.state).toBe('cancelled');
    expect(job.browser.isConnected()).toBe(false);
  }, 60000);

  it('is bound to loopback only', () => {
    expect(srv.address().address).toBe('127.0.0.1');
  });
});

describe('redaction', () => {
  it('redacts cookie values in final error events', async () => {
    const { Job } = await import('../src/jobs.js');
    const job = new Job({ url: fixture.url, cookies: [{ name: 's', value: 'TOPSECRET', url: fixture.url }], devices: ['desktop'], options: { maxPages: 1, maxDepth: 0, exclude: [], concurrency: 1, delayMs: 0, extraWaitMs: 0 } });
    job.emitEvent('warning', { message: 'boom TOPSECRET' });
    expect(JSON.stringify(job.history)).not.toContain('TOPSECRET');
  });
});
