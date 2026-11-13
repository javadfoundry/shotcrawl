import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const OPTION_KEYS = ['maxPages', 'maxDepth', 'exclude', 'includeSubdomains', 'respectRobots', 'disableAnimations', 'hideCookieBanners', 'extraWaitMs', 'hiDpi', 'concurrency', 'delayMs', 'browser'];

export function buildManifest({ site, startedAt, finishedAt, authenticated, options, devices, pages, skipped, warnings, stopReason }) {
  const safeOptions = Object.fromEntries(OPTION_KEYS.filter((k) => k in options).map((k) => [k, options[k]]));
  return {
    site, startedAt, finishedAt, authenticated, options: safeOptions, devices, stopReason,
    pages: pages.map((p) => ({ url: p.url, title: p.title, slug: p.slug, depth: p.depth, shots: p.shots })),
    skipped, warnings,
  };
}

export async function writeManifest(runDir, manifest) {
  await writeFile(join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LABELS = { desktop: 'دسکتاپ', tablet: 'تبلت', mobile: 'موبایل' };

export function renderGallery(m) {
  const items = [];
  for (const p of m.pages) for (const d of m.devices) {
    const s = p.shots?.[d];
    if (s?.ok) items.push({ d, file: s.file, title: p.title || p.url, url: p.url });
  }
  const tabs = ['all', ...m.devices].map((d, i) =>
    `<button data-f="${d}"${i === 0 ? ' class="on"' : ''}>${d === 'all' ? 'همه' : LABELS[d]}</button>`).join('');
  const cards = items.map((it) =>
    `<figure data-d="${it.d}"><a href="${esc(it.file)}" data-full><img loading="lazy" src="${esc(it.file)}" alt="${esc(it.title)}"></a>` +
    `<figcaption><b>${esc(it.title)}</b><span dir="ltr">${esc(it.url)}</span><i>${LABELS[it.d]}</i></figcaption></figure>`).join('\n');
  return `<!doctype html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>گالری ${esc(m.site)}</title>
<style>
:root{--bg:#f6f7f9;--fg:#1c1f24;--card:#fff;--mut:#667}@media(prefers-color-scheme:dark){:root{--bg:#14161a;--fg:#e8eaed;--card:#1e2126;--mut:#9aa}}
body{margin:0;font-family:Vazirmatn,system-ui,sans-serif;background:var(--bg);color:var(--fg);padding:16px}
h1{font-size:1.2rem}nav{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
nav button{padding:6px 14px;border:1px solid #8886;border-radius:8px;background:var(--card);color:var(--fg);cursor:pointer;font:inherit}nav button.on{background:#2563eb;color:#fff;border-color:#2563eb}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
figure{margin:0;background:var(--card);border-radius:10px;overflow:hidden;box-shadow:0 1px 4px #0002}
figure a{display:block;height:260px;overflow:hidden;background:#8881}figure img{width:100%;display:block;object-fit:cover;object-position:top}
figcaption{padding:8px 10px;display:flex;flex-direction:column;gap:2px;font-size:.85rem}figcaption span{color:var(--mut);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}figcaption i{color:var(--mut);font-style:normal}
#lb{position:fixed;inset:0;background:#000d;display:none;overflow:auto;padding:20px;z-index:9}#lb.on{display:block}#lb img{max-width:100%;display:block;margin:auto}
</style></head><body>
<h1>${esc(m.site)}</h1><nav>${tabs}</nav>
<main>${cards}</main><div id="lb"></div>
<script>
const nav=document.querySelectorAll('nav button'),figs=document.querySelectorAll('figure'),lb=document.getElementById('lb');
nav.forEach(b=>b.onclick=()=>{nav.forEach(x=>x.classList.remove('on'));b.classList.add('on');figs.forEach(f=>f.style.display=(b.dataset.f==='all'||f.dataset.d===b.dataset.f)?'':'none')});
document.querySelectorAll('[data-full]').forEach(a=>a.onclick=e=>{e.preventDefault();lb.innerHTML='<img src="'+a.getAttribute('href')+'">';lb.classList.add('on')});
lb.onclick=()=>lb.classList.remove('on');addEventListener('keydown',e=>e.key==='Escape'&&lb.classList.remove('on'));
</script></body></html>`;
}

export async function writeGallery(runDir, manifest) {
  await writeFile(join(runDir, 'index.html'), renderGallery(manifest));
}
