import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { BROWSERS, launchBrowser } from './browsers.js';
import { config } from './config.js';
import { crawl } from './crawler.js';
import { shoot } from './shooter.js';
import { buildManifest, writeManifest, writeGallery } from './gallery.js';
import { slugFor } from './url-utils.js';

const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

let active = null;
export const getActiveJob = () => (active && active.running ? active : null);
const jobs = new Map();
export const getJob = (id) => jobs.get(id);

export class Job extends EventEmitter {
  constructor({ url, cookies = [], devices, options }) {
    super();
    this.id = randomUUID();
    this.url = url;
    this.cookies = cookies;            // memory only; cleared when the job ends
    this.authenticated = cookies.length > 0;
    this.devices = devices;
    this.options = options;
    this.state = 'pending';
    this.history = [];
    this.manifest = null;
    this.runDir = null;
    this.running = false;
    this.abort = new AbortController();
    this.browser = null;
    this.secrets = cookies.map((c) => String(c.value)).filter((v) => v.length >= 3);
  }

  redact(text) {
    let s = String(text);
    for (const v of this.secrets) s = s.split(v).join('***');
    return s;
  }

  emitEvent(type, data = {}) {
    const clean = JSON.parse(this.redact(JSON.stringify(data)));
    const ev = { type, data: clean };
    this.history.push(ev);
    this.emit('event', ev);
  }

  phase(p) { this.state = p; this.emitEvent('phase', { phase: p }); }

  start() {
    this.running = true;
    active = this;
    jobs.set(this.id, this);
    this.run().catch(() => {});
    return this;
  }

  async cancel() {
    if (!this.running) return;
    this.abort.abort();
    await this.browser?.close().catch(() => {});
  }

  async run() {
    const startedAt = new Date();
    const host = new URL(this.url).hostname.replace(/[^a-z0-9.-]/gi, '_');
    this.runDir = join(config.outputDir, host, stamp(startedAt));
    const emit = (t, d) => this.emitEvent(t, d);
    let finalEvents = [];
    try {
      await mkdir(this.runDir, { recursive: true });
      this.browser = await launchBrowser(this.options.browser || 'chromium');
      const family = BROWSERS[this.options.browser || 'chromium'].family;
      this.phase('crawling');
      const crawled = await crawl({ browser: this.browser, family, startUrl: this.url, options: this.options, cookies: this.cookies, emit, signal: this.abort.signal });
      if (this.abort.signal.aborted) throw Object.assign(new Error('cancelled'), { cancelled: true });
      const used = new Set();
      crawled.pages.forEach((p) => { p.slug = slugFor(p.url, used); });
      this.phase('shooting');
      await shoot({ browser: this.browser, family, pages: crawled.pages, deviceKeys: this.devices, options: this.options, cookies: this.cookies, runDir: this.runDir, emit, signal: this.abort.signal });
      if (this.abort.signal.aborted) throw Object.assign(new Error('cancelled'), { cancelled: true });
      const failed = crawled.pages.reduce((n, p) => n + Object.values(p.shots).filter((s) => !s.ok).length, 0);
      this.manifest = buildManifest({
        site: new URL(this.url).origin, startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(),
        authenticated: this.authenticated, options: this.options, devices: this.devices,
        pages: crawled.pages, skipped: crawled.skipped, warnings: crawled.warnings, stopReason: crawled.stopReason,
      });
      await writeManifest(this.runDir, this.manifest);
      await writeGallery(this.runDir, this.manifest);
      finalEvents = [['phase', { phase: 'done' }], ['done', { outputDir: this.runDir, pages: crawled.pages.length, failed }]];
      this.state = 'done';
    } catch (e) {
      if (e.cancelled || this.abort.signal.aborted) { finalEvents = [['phase', { phase: 'cancelled' }]]; this.state = 'cancelled'; }
      else { finalEvents = [['warning', { message: `خطا: ${e.message}` }], ['phase', { phase: 'error' }]]; this.state = 'error'; }
    } finally {
      await this.browser?.close().catch(() => {});
      this.running = false;
      if (active === this) active = null;
      // Final events go out after the slot is released but before secrets are cleared,
      // so they are still redacted.
      finalEvents.forEach(([t, d]) => this.emitEvent(t, d));
      this.cookies = null;
      this.secrets = [];
      this.emit('end');
    }
  }

  status() {
    return { id: this.id, state: this.state, authenticated: this.authenticated, devices: this.devices, outputDir: this.runDir, manifest: this.manifest };
  }
}
