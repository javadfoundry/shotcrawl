import { describe, it, expect } from 'vitest';
import { normalizeUrl, isSameSite, hasNonPageExtension, isExcluded, slugFor } from '../src/url-utils.js';

describe('url-utils', () => {
  it('normalizes', () => {
    expect(normalizeUrl('HTTP://Example.COM/a/?b=2&a=1#x')).toBe('http://example.com/a?a=1&b=2');
    expect(normalizeUrl('http://example.com/')).toBe('http://example.com/');
    expect(normalizeUrl('mailto:a@b.c')).toBeNull();
    expect(normalizeUrl('/x', 'http://e.com/y/')).toBe('http://e.com/x');
  });
  it('same site', () => {
    expect(isSameSite('http://a.com/x', 'http://a.com')).toBe(true);
    expect(isSameSite('http://blog.a.com/', 'http://a.com')).toBe(false);
    expect(isSameSite('http://blog.a.com/', 'http://a.com', true)).toBe(true);
    expect(isSameSite('http://evil-a.com/', 'http://a.com', true)).toBe(false);
  });
  it('extension filter', () => {
    expect(hasNonPageExtension('http://a.com/f.PDF')).toBe(true);
    expect(hasNonPageExtension('http://a.com/about')).toBe(false);
    expect(hasNonPageExtension('http://a.com/a.html')).toBe(false);
  });
  it('excludes', () => {
    expect(isExcluded('http://a.com/Logout')).toBe(true);
    expect(isExcluded('http://a.com/x?action=delete')).toBe(true);
    expect(isExcluded('http://a.com/api/v1')).toBe(true);
    expect(isExcluded('http://a.com/about')).toBe(false);
    expect(isExcluded('http://a.com/private/x', ['/private/*'])).toBe(true);
  });
  it('slugs and collisions', () => {
    const used = new Set();
    expect(slugFor('http://a.com/', used)).toBe('home');
    expect(slugFor('http://a.com/about/team', used)).toBe('about-team');
    expect(slugFor('http://a.com/about-team', used)).toBe('about-team-2');
    expect(slugFor('http://a.com/x?q=1')).toMatch(/^x-[0-9a-f]{6}$/);
    expect(slugFor('http://a.com/' + 'a'.repeat(300)).length).toBeLessThanOrEqual(100);
  });
});
