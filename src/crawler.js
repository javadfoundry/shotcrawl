import { config } from './config.js';
import { deviceOptions } from './devices.js';
import { guardContext, sleep } from './guard.js';
import { discoverSitemapUrls, fetchText, parseRobotsDisallow } from './sitemap.js';
import { normalizeUrl, isSameSite, hasNonPageExtension, isExcluded, isLoginUrl } from './url-utils.js';

/**
 * Discovers pages. Returns { pages, skipped, warnings, stopReason }.
 * pages: [{url, depth, source, status, title}]
 */
export async function crawl({ browser, startUrl, options, cookies = [], emit = () => {}, signal }) {
  const o = options;
  const excludes = [...config.excludePatterns, ...(o.exclude || [])];
  const start = normalizeUrl(startUrl);
  const accepted = [], skipped = [], warnings = [];
  const seen = new Set();
  const queue = [];
  let stopReason = 'queue empty';
  let redirectedToLogin = 0, visited = 0;

  let disallow = [];
  if (o.respectRobots) {
    const robots = await fetchText(new URL(start).origin + '/robots.txt', fetch, { startUrl: start, includeSubdomains: false });
    if (robots) disallow = parseRobotsDisallow(robots);
  }
  const allowed = (url) => !disallow.some((d) => new URL(url).pathname.startsWith(d));
  const eligible = (url) =>
    isSameSite(url, start, o.includeSubdomains) && !hasNonPageExtension(url) && !isExcluded(url, excludes) && allowed(url);

  const enqueue = (raw, depth, source) => {
    const url = normalizeUrl(raw);
    if (!url || seen.has(url) || !eligible(url)) return;
    seen.add(url);
    queue.push({ url, depth, source });
  };

  enqueue(start, 0, 'link');
  try {
    for (const u of await discoverSitemapUrls(start, fetch, o.includeSubdomains)) enqueue(u, 1, 'sitemap');
  } catch { /* sitemap is best-effort */ }

  const context = await browser.newContext(deviceOptions('desktop'));
  await guardContext(context, excludes);
  if (cookies.length) await context.addCookies(cookies);

  const visit = async (item) => {
    const page = await context.newPage();
    try {
      let resp;
      try { resp = await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: config.timeouts.nav }); }
      catch (e) { skipped.push({ url: item.url, reason: 'navigation failed' }); return; }
      await page.waitForLoadState('networkidle', { timeout: config.timeouts.idle }).catch(() => {});
      visited++;
      const status = resp ? resp.status() : 0;
      const finalUrl = normalizeUrl(page.url());
      if (status >= 400 || !resp) { skipped.push({ url: item.url, reason: String(status || 'no response') }); return; }
      if (!finalUrl || !isSameSite(finalUrl, start, o.includeSubdomains)) {
        skipped.push({ url: item.url, reason: 'redirected to another site' }); return;
      }
      if (finalUrl !== item.url) {
        if (isLoginUrl(finalUrl) && !isLoginUrl(item.url)) redirectedToLogin++;
        if (seen.has(finalUrl) && accepted.some((p) => p.url === finalUrl)) {
          skipped.push({ url: item.url, reason: `redirects to ${finalUrl}` }); return;
        }
        seen.add(finalUrl);
      }
      if (accepted.length >= o.maxPages) return;
      const title = await page.title().catch(() => '');
      accepted.push({ url: finalUrl, depth: item.depth, source: item.source, status, title });
      emit('discovered', { count: accepted.length, url: finalUrl });
      if (item.depth < o.maxDepth) {
        const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.href)).catch(() => []);
        for (const l of links) enqueue(l, item.depth + 1, 'link');
      }
    } finally {
      await page.close().catch(() => {});
    }
  };

  let active = 0;
  try {
    const workers = Array.from({ length: Math.max(1, o.concurrency) }, async () => {
      while (!signal?.aborted) {
        if (accepted.length >= o.maxPages) { stopReason = `reached the ${o.maxPages}-page cap`; return; }
        const item = queue.shift();
        if (!item) {
          // another worker may still add links; yield briefly if others are active
          if (active === 0) return;
          await sleep(50); continue;
        }
        active++;
        try { await visit(item); } finally { active--; }
        if (o.delayMs) await sleep(o.delayMs);
      }
    });
    await Promise.all(workers);
  } finally {
    await context.close().catch(() => {});
  }

  if (accepted.length >= o.maxPages && queue.length) stopReason = `reached the ${o.maxPages}-page cap`;
  else if (!queue.length) stopReason = 'queue empty';
  if (cookies.length && visited && redirectedToLogin / visited > 0.3) {
    const w = 'کوکی منقضی یا نامعتبر به نظر می‌رسد (بسیاری از صفحات به صفحهٔ ورود هدایت شدند).';
    warnings.push(w); emit('warning', { message: w });
  }
  // queued items never visited because of caps are not reported as skipped
  return { pages: accepted.slice(0, o.maxPages), skipped, warnings, stopReason };
}
