const $ = (id) => document.getElementById(id);
const LABELS = { desktop: 'دسکتاپ', tablet: 'تبلت', mobile: 'موبایل' };
let jobId = null, es = null;

$('cookie-help').onclick = (e) => { e.preventDefault(); $('cookie-help-box').hidden = !$('cookie-help-box').hidden; };
$('url').oninput = () => {
  const v = $('url').value.trim();
  let ok = !v;
  try { ok = ok || /^https?:$/.test(new URL(v).protocol); } catch { /* invalid */ }
  $('url-err').textContent = ok ? '' : 'آدرس معتبر http یا https وارد کنید.';
};

const addLi = (ul, text, cls) => { const li = document.createElement('li'); li.textContent = text; if (cls) li.className = cls; ul.prepend(li); };

function setRunning(r) {
  $('start').disabled = r; $('cancel').hidden = !r;
  $('cookie-state').hidden = !(r && window.__hadCookie);
}

$('form').onsubmit = async (e) => {
  e.preventDefault();
  $('form-err').textContent = '';
  const cookies = $('cookies').value;
  const body = {
    url: $('url').value.trim(), cookies,
    devices: [...document.querySelectorAll('[name=device]:checked')].map((c) => c.value),
    maxPages: +$('maxPages').value, maxDepth: +$('maxDepth').value, extraWaitMs: +$('extraWaitMs').value,
    exclude: $('exclude').value.split('\n'),
    includeSubdomains: $('includeSubdomains').checked, respectRobots: $('respectRobots').checked,
    disableAnimations: $('disableAnimations').checked, hideCookieBanners: $('hideCookieBanners').checked, hiDpi: $('hiDpi').checked,
  };
  const res = await fetch('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) { $('form-err').textContent = data.error; return; }
  window.__hadCookie = !!cookies.trim();
  $('cookies').value = '';              // never keep the cookie in the UI after submission
  jobId = data.id;
  $('progress-section').hidden = false; $('results-section').hidden = true;
  $('discovered').textContent = ''; $('log').textContent = ''; $('bar').value = 0; $('counter').textContent = '';
  setRunning(true);
  listen();
};

$('cancel').onclick = () => jobId && fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });

function listen() {
  es = new EventSource(`/api/jobs/${jobId}/events`);
  let found = 0;
  const on = (t, f) => es.addEventListener(t, (ev) => f(JSON.parse(ev.data)));
  on('phase', ({ phase }) => {
    $('phase').textContent = { crawling: '— کشف صفحات', shooting: '— گرفتن اسکرین‌شات', done: '— پایان', error: '— خطا', cancelled: '— لغو شد' }[phase] || '';
    if (phase === 'shooting') $('bar').value = 0;
    if (['error', 'cancelled'].includes(phase)) { setRunning(false); es.close(); }
  });
  on('discovered', ({ count, url }) => { found = count; addLi($('discovered'), url); $('counter').textContent = `${count} صفحه پیدا شد`; });
  on('shot', ({ index, total, ok, url, device }) => {
    $('bar').value = (index / total) * 100; $('counter').textContent = `${index} از ${total}`;
    if (!ok) addLi($('log'), `ناموفق: ${url} (${LABELS[device]})`, 'w');
  });
  on('warning', ({ message }) => addLi($('log'), message, 'w'));
  on('done', async () => { es.close(); setRunning(false); $('bar').value = 100; await showResults(); });
  es.onerror = () => { if (es.readyState === EventSource.CLOSED) setRunning(false); };
}

async function showResults() {
  const st = await (await fetch(`/api/jobs/${jobId}`)).json();
  const m = st.manifest; if (!m) return;
  const rel = st.outputDir.split('/output/')[1];
  $('zip').href = `/api/jobs/${jobId}/zip`;
  $('standalone').href = `/files/${rel}/index.html`;
  const tabs = $('tabs'); tabs.textContent = '';
  const gal = $('gallery');
  const render = (f) => {
    gal.textContent = '';
    for (const p of m.pages) for (const d of m.devices) {
      const s = p.shots[d]; if (!s?.ok || (f !== 'all' && f !== d)) continue;
      const fig = document.createElement('figure'), a = document.createElement('a'), img = document.createElement('img'), cap = document.createElement('figcaption');
      a.href = '#'; img.loading = 'lazy'; img.src = `/files/${rel}/${s.file}`; img.alt = p.title;
      a.onclick = (e) => { e.preventDefault(); const lb = $('lb'); lb.textContent = ''; const i = document.createElement('img'); i.src = img.src; lb.append(i); lb.hidden = false; };
      cap.textContent = `${p.title || p.url} · ${LABELS[d]}`;
      a.append(img); fig.append(a, cap); gal.append(fig);
    }
  };
  ['all', ...m.devices].forEach((d, i) => {
    const b = document.createElement('button'); b.textContent = d === 'all' ? 'همه' : LABELS[d]; if (!i) b.className = 'on';
    b.onclick = () => { tabs.querySelectorAll('button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); render(d); };
    tabs.append(b);
  });
  render('all');
  const issues = $('issues'); issues.textContent = '';
  m.skipped.forEach((s) => addLi(issues, `${s.url} — ${s.reason}`));
  m.pages.forEach((p) => Object.entries(p.shots).forEach(([d, s]) => !s.ok && addLi(issues, `${p.url} [${d}] — ${s.error}`)));
  $('results-section').hidden = false;
}
$('lb').onclick = () => { $('lb').hidden = true; };
addEventListener('keydown', (e) => e.key === 'Escape' && ($('lb').hidden = true));
