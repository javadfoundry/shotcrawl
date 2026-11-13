import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium, firefox, webkit } from 'playwright';

const home = homedir();
const platform = process.platform;
const appData = process.env.LOCALAPPDATA || join(home, 'AppData', 'Local');

const userData = {
  chrome: { linux: '.config/google-chrome', darwin: 'Library/Application Support/Google/Chrome', win32: 'Google/Chrome/User Data' },
  msedge: { linux: '.config/microsoft-edge', darwin: 'Library/Application Support/Microsoft Edge', win32: 'Microsoft/Edge/User Data' },
  chromium: { linux: '.config/chromium', darwin: 'Library/Application Support/Chromium', win32: 'Chromium/User Data' },
};
const userDataDir = (key) => {
  const rel = userData[key]?.[platform];
  if (!rel) return null;
  return platform === 'win32' ? join(appData, rel) : join(home, rel);
};

const exeCandidates = {
  chrome: {
    linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/opt/google/chrome/chrome'],
    darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
    win32: ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', join(appData, 'Google/Chrome/Application/chrome.exe')],
  },
  msedge: {
    linux: ['/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable', '/opt/microsoft/msedge/msedge'],
    darwin: ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
    win32: ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'],
  },
};

export const BROWSERS = {
  chrome: { label: 'Google Chrome', engine: chromium, channel: 'chrome', family: 'chromium' },
  msedge: { label: 'Microsoft Edge', engine: chromium, channel: 'msedge', family: 'chromium' },
  chromium: { label: 'Chromium (bundled)', engine: chromium, family: 'chromium' },
  firefox: { label: 'Firefox', engine: firefox, family: 'firefox' },
  webkit: { label: 'WebKit', engine: webkit, family: 'webkit' },
};

export const isBrowserKey = (k) => Object.prototype.hasOwnProperty.call(BROWSERS, k);

export function isInstalled(key) {
  const b = BROWSERS[key];
  if (!b) return false;
  if (exeCandidates[key]) return (exeCandidates[key][platform] || []).some((p) => existsSync(p));
  try { return existsSync(b.engine.executablePath()); } catch { return false; }
}

export function listBrowsers() {
  return Object.entries(BROWSERS).map(([key, b]) => ({
    key, label: b.label, installed: isInstalled(key), family: b.family,
    realProfile: b.family === 'chromium' && !!userDataDir(key) && existsSync(userDataDir(key) || ''),
  }));
}

export const getUserDataDir = userDataDir;

// Terminals started from a snap-packaged editor (e.g. VS Code) leak GTK/GSettings paths that crash
// system browsers (GLib-GIO-ERROR). Drop any variable pointing into the editor's snap.
export function cleanEnv(env = process.env) {
  const out = { ...env };
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === 'string' && /\/snap\/(code|codium)\b/.test(v) && k !== 'XDG_DATA_DIRS') delete out[k];
  }
  const orig = out.XDG_DATA_DIRS_VSCODE_SNAP_ORIG;
  if (orig) out.XDG_DATA_DIRS = orig;
  else if (out.XDG_DATA_DIRS) out.XDG_DATA_DIRS = out.XDG_DATA_DIRS.split(':').filter((d) => !/\/snap\/(code|codium)\b/.test(d)).join(':');
  return out;
}

export function launchBrowser(key, { headless = true } = {}) {
  const b = BROWSERS[key];
  if (!b) throw new Error(`unknown browser: ${key}`);
  return b.engine.launch({ headless, env: cleanEnv(), ...(b.channel ? { channel: b.channel } : {}) });
}

export function launchPersistent(key, dir, { headless = true } = {}) {
  const b = BROWSERS[key];
  return b.engine.launchPersistentContext(dir, {
    headless, env: cleanEnv(), ...(b.channel ? { channel: b.channel } : {}), viewport: headless ? { width: 1280, height: 800 } : null,
    // Playwright forces a mock/basic password store, which cannot decrypt the real profile's cookies
    // (they are encrypted with the OS keyring). Let Chrome use the real OS store instead.
    ignoreDefaultArgs: ['--password-store=basic', '--use-mock-keychain'],
  });
}
