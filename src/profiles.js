import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BROWSERS, getUserDataDir } from './browsers.js';

export async function listProfiles(browserKey) {
  const root = getUserDataDir(browserKey);
  if (!BROWSERS[browserKey] || !root) return [];
  try {
    const state = JSON.parse(await readFile(join(root, 'Local State'), 'utf8'));
    const cache = state.profile?.info_cache || {};
    return Object.entries(cache).map(([id, v]) => ({ id, name: v.name || id }));
  } catch { return []; }
}

// Only what is needed to read cookies / site storage, not the whole (multi-GB) profile.
const PROFILE_ITEMS = [
  'Cookies', 'Cookies-journal', 'Network/Cookies', 'Network/Cookies-journal',
  'Preferences', 'Secure Preferences', 'Local Storage', 'Session Storage',
];

/**
 * Chrome refuses remote debugging on its *default* user-data dir, and a live profile is locked,
 * so we work on a private, minimal copy that is deleted afterwards.
 */
export async function copyProfile(browserKey, profileId) {
  const profiles = await listProfiles(browserKey);
  if (!profiles.some((p) => p.id === profileId)) throw new Error('profile not found');
  const root = getUserDataDir(browserKey);
  const dir = await mkdtemp(join(tmpdir(), 'shotcrawl-profile-'));   // mode 0700
  const cleanup = () => rm(dir, { recursive: true, force: true }).catch(() => {});
  try {
    await cp(join(root, 'Local State'), join(dir, 'Local State'));
    for (const item of PROFILE_ITEMS) {
      const src = join(root, profileId, item);
      if (existsSync(src)) await cp(src, join(dir, profileId, item), { recursive: true }).catch(() => {});
    }
    return { dir, cleanup };
  } catch (e) { await cleanup(); throw e; }
}
