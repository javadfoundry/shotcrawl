import express from 'express';

const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font:16px sans-serif;margin:0;padding:20px}</style></head><body><h1>${title}</h1>${body}</body></html>`;

export function createFixture() {
  const state = { loggedOut: false, hits: [], lazyImageHits: 0 };
  const app = express();
  app.use((req, _res, next) => { state.hits.push(`${req.method} ${req.path}`); next(); });
  const authed = (req) => /(^|;\s*)session=abc(;|$)/.test(req.headers.cookie || '');
  const protect = (req, res, next) => (authed(req) ? next() : res.redirect('/login'));

  app.get('/', (_q, r) => r.send(page('Home', `<nav>
    <a href="/about">About</a> <a href="/contact">Contact</a> <a href="/dashboard">Dashboard</a>
    <a href="/tall">Tall</a> <a href="/lazy">Lazy</a> <a href="/missing">Broken</a> <a href="/logout">Logout</a></nav>`)));
  app.get('/about', (_q, r) => r.send(page('About', '<a href="/">Home</a> <a href="/contact">Contact</a>')));
  app.get('/contact', (_q, r) => r.send(page('Contact', '<a href="/">Home</a>')));
  app.get('/sitemap-only', (_q, r) => r.send(page('Sitemap only', 'Not linked anywhere.')));
  app.get('/sitemap.xml', (req, r) => {
    r.type('xml').send(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>http://${req.headers.host}/sitemap-only</loc></url></urlset>`);
  });
  app.get('/login', (_q, r) => r.send(page('Login', 'Please sign in.')));
  app.get('/dashboard', protect, (_q, r) => r.send(page('Dashboard', '<a href="/dashboard/settings">Settings</a> <a href="/logout">Logout</a>')));
  app.get('/dashboard/settings', protect, (_q, r) => r.send(page('Settings', '<a href="/dashboard">Back</a>')));
  app.get('/logout', (_q, r) => { state.loggedOut = true; r.send(page('Logged out', '')); });
  app.get('/tall', (_q, r) => r.send(page('Tall', '<div style="height:20000px;background:linear-gradient(#fff,#09f)"></div><p id="end">The end</p>')));
  app.get('/lazy', (_q, r) => r.send(page('Lazy', '<div style="height:3000px"></div><img src="/lazy.svg" loading="lazy" width="200" height="100" alt="lazy">')));
  app.get('/lazy.svg', (_q, r) => { state.lazyImageHits++; r.type('svg').send('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="red"/></svg>'); });

  return new Promise((ok) => {
    const server = app.listen(0, '127.0.0.1', () => ok({ server, state, url: `http://127.0.0.1:${server.address().port}` }));
  });
}
