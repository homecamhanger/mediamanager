import { describe, expect, it, vi } from 'vitest';
import { RenderCache, renderCacheKey } from '../src/server/lib/renderCache.js';

/**
 * The render cache sits in front of a resvg + PNG-decode + JPEG-encode pipeline.
 * The risk is not "does it cache" but "does it stay bounded" — the key includes
 * user-supplied title text, so an unbounded map would be a remote-triggerable leak.
 */
describe('RenderCache', () => {
  it('returns a cached value without recomputing', () => {
    const cache = new RenderCache();
    const compute = vi.fn(() => Buffer.from('pixels'));
    expect(cache.getOrCompute('k', compute).toString()).toBe('pixels');
    expect(cache.getOrCompute('k', compute).toString()).toBe('pixels');
    expect(compute).toHaveBeenCalledTimes(1);
    expect(cache.stats().hits).toBe(1);
    expect(cache.stats().misses).toBe(1);
  });

  it('distinguishes different keys', () => {
    const cache = new RenderCache();
    cache.set('a', Buffer.from('aaa'));
    cache.set('b', Buffer.from('bbb'));
    expect(cache.get('a')?.toString()).toBe('aaa');
    expect(cache.get('b')?.toString()).toBe('bbb');
  });

  it('evicts the least recently used entry when over the entry cap', () => {
    const cache = new RenderCache({ maxEntries: 2 });
    cache.set('a', Buffer.from('a'));
    cache.set('b', Buffer.from('b'));
    // Touch "a" so "b" becomes the oldest.
    cache.get('a');
    cache.set('c', Buffer.from('c'));

    expect(cache.get('a')).toBeDefined();
    expect(cache.get('c')).toBeDefined();
    expect(cache.get('b')).toBeUndefined();
    expect(cache.stats().evictions).toBeGreaterThan(0);
  });

  it('evicts when over the byte budget', () => {
    const cache = new RenderCache({ maxEntries: 100, maxBytes: 30 });
    cache.set('a', Buffer.alloc(10, 1));
    cache.set('b', Buffer.alloc(10, 2));
    cache.set('c', Buffer.alloc(10, 3));
    expect(cache.stats().bytes).toBeLessThanOrEqual(30);

    // A fourth entry pushes the total over the budget; the oldest must go.
    cache.set('d', Buffer.alloc(10, 4));
    expect(cache.stats().bytes).toBeLessThanOrEqual(30);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('d')).toBeDefined();
  });

  it('does not retain an image larger than the whole budget', () => {
    const cache = new RenderCache({ maxEntries: 10, maxBytes: 50 });
    cache.set('small', Buffer.alloc(10, 1));
    cache.set('huge', Buffer.alloc(500, 2));
    expect(cache.get('huge')).toBeUndefined();
    expect(cache.stats().bytes).toBeLessThanOrEqual(50);
  });

  it('stays bounded under many distinct keys', () => {
    const cache = new RenderCache({ maxEntries: 8 });
    for (let i = 0; i < 200; i++) {
      cache.set(`k${i}`, Buffer.alloc(16, i % 256));
    }
    expect(cache.stats().entries).toBeLessThanOrEqual(8);
    expect(cache.stats().bytes).toBeLessThanOrEqual(8 * 16);
  });

  it('replacing an existing key does not double-count bytes', () => {
    const cache = new RenderCache({ maxBytes: 1000 });
    cache.set('k', Buffer.alloc(10, 1));
    cache.set('k', Buffer.alloc(10, 2));
    expect(cache.stats().bytes).toBe(10);
    expect(cache.stats().entries).toBe(1);
  });

  it('counts stats and clears', () => {
    const cache = new RenderCache();
    cache.set('a', Buffer.from('x'));
    cache.get('a');
    cache.get('missing');
    expect(cache.stats()).toMatchObject({ entries: 1, hits: 1, misses: 1 });
    cache.clear();
    expect(cache.stats().entries).toBe(0);
    expect(cache.stats().bytes).toBe(0);
  });
});

describe('renderCacheKey', () => {
  const base = { kind: 'poster', title: 'Dune' };

  it('is stable for identical input', () => {
    expect(renderCacheKey(base, '.jpg')).toBe(renderCacheKey({ ...base }, '.jpg'));
  });

  it('separates different titles', () => {
    expect(renderCacheKey(base, '.jpg')).not.toBe(renderCacheKey({ ...base, title: 'Dune Part Two' }, '.jpg'));
  });

  it('separates every input that affects the pixels', () => {
    const variants = [
      { ...base, subtitle: 'A subtitle' },
      { ...base, year: 2021 },
      { ...base, genres: ['Sci-Fi'] },
      { ...base, rating: 8 },
      { ...base, accentColor: '#ff0000' },
      { ...base, secondaryColor: '#00ff00' },
      { ...base, episodeCode: 'S01E01' },
      { ...base, kind: 'fanart' },
    ];
    const seen = new Set([renderCacheKey(base, '.jpg')]);
    for (const v of variants) {
      const key = renderCacheKey(v, '.jpg');
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('separates output formats', () => {
    expect(renderCacheKey(base, '.jpg')).not.toBe(renderCacheKey(base, '.png'));
  });

  it('does not collide when title text looks like part of the key', () => {
    // Naive concatenation would let these alias: "a" + "bc" === "ab" + "c".
    const a = renderCacheKey({ kind: 'poster', title: 'a', subtitle: 'bc' }, '.jpg');
    const b = renderCacheKey({ kind: 'poster', title: 'ab', subtitle: 'c' }, '.jpg');
    expect(a).not.toBe(b);
  });

  it('treats absent and empty optional values the same', () => {
    expect(renderCacheKey({ kind: 'poster', title: 'X', subtitle: undefined }, '.jpg')).toBe(
      renderCacheKey({ kind: 'poster', title: 'X', subtitle: '' }, '.jpg')
    );
  });
});
