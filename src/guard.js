import { isExcluded } from './url-utils.js';

// Keeps the browser read-only: only GET, never destructive URLs (e.g. /logout via redirect or script).
export async function guardContext(context, excludePatterns) {
  await context.route('**/*', (route) => {
    const req = route.request();
    if (req.method() !== 'GET' && req.method() !== 'HEAD' && req.method() !== 'OPTIONS') return route.abort();
    if (isExcluded(req.url(), excludePatterns)) return route.abort();
    return route.continue();
  });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
