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
}

// ---- browser + auth -------------------------------------------------------
let browsers = [], authId = null, authPoll = null;
const jpost = (u, b) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) });
const authBase = () => ({ browser: $('browser').value, profile: $('profile').value || undefined, url: $('url').value.trim() });
const setAuthState = (t) => { $('auth-state').textContent = t; };

async function loadBrowsers() {
  browsers = await (await fetch('/api/browsers')).json();
  const sel = $('browser'); sel.textContent = '';
  const ok = browsers.filter((b) => b.installed);
  const order = ['chrome', ...ok.map((b) => b.key)];
  const pick = order.find((k) => ok.some((b) => b.key === k)) || 'chromium';
  ok.forEach((b) => { const o = document.createElement('option'); o.value = b.key; o.textContent = b.label; sel.append(o); });
  sel.value = pick;
  const missing = browsers.filter((b) => !b.installed).map((b) => b.label);
  $('browser-note').textContent = missing.length ? `نصب نیست: ${missing.join('، ')}` : '';
  await onBrowserChange();
}

async function onBrowserChange() {
  const b = browsers.find((x) => x.key === $('browser').value);
  const real = !!b?.realProfile;
  [...$('auth-mode').options].forEach((o) => { if (o.value === 'profile') o.disabled = !real; });
  if (!real && $('auth-mode').value === 'profile') $('auth-mode').value = 'none';
  const sel = $('profile'); sel.textContent = '';
  if (real) {
    const ps = await (await fetch(`/api/browsers/${b.key}/profiles`)).json();
    ps.forEach((p) => { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; sel.append(o); });
  }
  updateAuthUi();
}

function resetAuth() {
  clearInterval(authPoll);
  if (authId) fetch(`/api/auth/${authId}`, { method: 'DELETE' });
  authId = null; setAuthState(''); $('login-done').hidden = true;
}

function updateAuthUi() {
  const m = $('auth-mode').value, real = !$('auth-mode').options[1].disabled;
  $('profile-row').hidden = !((m === 'profile') || (m === 'login' && real));
  $('login-row').hidden = m !== 'login';
  $('profile-read').hidden = m !== 'profile';
  $('paste-row').hidden = m !== 'paste';
}

$('browser').onchange = () => { resetAuth(); onBrowserChange(); };
$('auth-mode').onchange = () => { resetAuth(); updateAuthUi(); };
$('url').addEventListener('change', resetAuth);

async function authCall(body) {
  const url = $('url').value.trim();
  if (!url) { setAuthState(''); $('form-err').textContent = 'ابتدا آدرس سایت را وارد کنید.'; return null; }
  $('form-err').textContent = '';
  const res = await jpost('/api/auth', { ...authBase(), ...body });
  const data = await res.json();
  if (!res.ok) { $('form-err').textContent = data.error; return null; }
  return data;
}

$('profile-read').onclick = async () => {
  resetAuth(); setAuthState('در حال خواندن…');
  const d = await authCall({ mode: 'extract' });
  if (!d) return setAuthState('');
  authId = d.id;
  setAuthState(d.count ? `کوکی: فعال (${d.count} مورد)` : 'کوکی‌ای برای این سایت در پروفایل نبود؛ ابتدا در Chrome وارد سایت شوید.');
};

$('login-open').onclick = async () => {
  resetAuth(); setAuthState('پنجرهٔ مرورگر باز شد؛ وارد حساب شوید و سپس «ورود انجام شد» را بزنید.');
  const d = await authCall({ mode: 'login' });
  if (!d) return setAuthState('');
  authId = d.id; $('login-done').hidden = false;
  authPoll = setInterval(async () => {
    const r = await fetch(`/api/auth/${authId}`); if (!r.ok) return clearInterval(authPoll);
    if ((await r.json()).state === 'closed') setAuthState('پنجره بسته شد؛ برای ادامه «ورود انجام شد» را بزنید.');
  }, 2000);
};

$('login-done').onclick = async () => {
  clearInterval(authPoll);
  const r = await jpost(`/api/auth/${authId}/finish`);
  if (!r.ok) return setAuthState('نشست پیدا نشد.');
  const d = await r.json();
  $('login-done').hidden = true;
  setAuthState(d.count ? `کوکی: فعال (${d.count} مورد)` : 'کوکی‌ای دریافت نشد؛ مطمئن شوید وارد سایت شده‌اید.');
};

loadBrowsers();

$('form').onsubmit = async (e) => {
  e.preventDefault();
  $('form-err').textContent = '';
  const mode = $('auth-mode').value;
  const cookies = mode === 'paste' ? $('cookies').value : '';
  const body = {
    url: $('url').value.trim(), browser: $('browser').value,
    ...(mode === 'paste' ? { cookies } : {}), ...(authId && ['profile', 'login'].includes(mode) ? { authId } : {}),
    devices: [...document.querySelectorAll('[name=device]:checked')].map((c) => c.value),
    maxPages: +$('maxPages').value, maxDepth: +$('maxDepth').value, extraWaitMs: +$('extraWaitMs').value,
    exclude: $('exclude').value.split('\n'),
    includeSubdomains: $('includeSubdomains').checked, respectRobots: $('respectRobots').checked,
    disableAnimations: $('disableAnimations').checked, hideCookieBanners: $('hideCookieBanners').checked, hiDpi: $('hiDpi').checked,
  };
  const res = await fetch('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) { $('form-err').textContent = data.error; return; }
  $('cookies').value = '';              // never keep the cookie in the UI after submission
  authId = null; clearInterval(authPoll);   // the server consumed the cookie session
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
