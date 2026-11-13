import { describe, it, expect } from 'vitest';
import { parseCookies } from '../src/cookies.js';
const site = 'http://localhost:1234';

describe('cookies', () => {
  it('header string', () => {
    expect(parseCookies('a=1; b=x=y', site)).toEqual([
      { name: 'a', value: '1', url: site }, { name: 'b', value: 'x=y', url: site }]);
  });
  it('json array with mappings', () => {
    const [c] = parseCookies(JSON.stringify([{ name: 's', value: 'v', domain: 'a.com', expirationDate: 1700000000.5, sameSite: 'no_restriction', httpOnly: true }]), site);
    expect(c).toMatchObject({ domain: 'a.com', path: '/', expires: 1700000000.5, sameSite: 'None', httpOnly: true });
    const [d] = parseCookies(JSON.stringify([{ name: 's', value: 'v', sameSite: 'unspecified' }]), site);
    expect(d.sameSite).toBeUndefined();
    expect(d.expires).toBe(-1);
    expect(d.url).toBe(site);
  });
  it('storageState object', () => {
    expect(parseCookies('{"cookies":[{"name":"a","value":"1"}]}', site)).toHaveLength(1);
  });
  it('errors do not echo values', () => {
    for (const bad of ['{bad json SECRETVAL', 'noequals', '[{"value":"SECRETVAL"}]']) {
      try { parseCookies(bad, site); throw new Error('no throw'); }
      catch (e) { expect(e.message).not.toContain('SECRETVAL'); expect(e.message).not.toBe('no throw'); }
    }
  });
});
