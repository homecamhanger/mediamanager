import { describe, expect, it, vi } from 'vitest';
import { DetailCache, MAX_ENTRIES } from '../src/client/lib/detailCache.js';
import { seedEpisodeFromTree, seedMovieFromList, seedShowFromTree } from '../src/client/lib/detailSeed.js';
import type { MovieListEntry, TvEpisodeRecord, TvShowRecord } from '../src/shared/types.js';
import type { ShowTreeNode } from '../src/client/lib/workspaceTypes.js';

/**
 * The detail cache exists to stop a selection from showing the *previous* item
 * while two sequential round-trips resolve. Its failure modes are therefore
 * behavioural, not just functional: an unbounded map leaks over a long session, a
 * recency bug evicts the item the user keeps returning to, and a cache that
 * silently serves stale data defeats the revalidation the panels rely on.
 *
 * Seeds are tested for the one property the UI depends on: they are honest. A
 * seed may be sparse, but it must never carry a different item's identity, or the
 * panel would paint the wrong title faster than before.
 */

const movieKey = (id: number) => ({ kind: 'movie' as const, id });

describe('DetailCache', () => {
  it('returns a cached value and refreshes recency on read', () => {
    const cache = new DetailCache(3);
    cache.set(movieKey(1), 'one');
    cache.set(movieKey(2), 'two');
    cache.set(movieKey(3), 'three');

    // Touch 1 so 2 becomes the least recently used.
    expect(cache.get(movieKey(1))).toBe('one');

    cache.set(movieKey(4), 'four');

    expect(cache.get(movieKey(1))).toBe('one');
    expect(cache.get(movieKey(2))).toBeUndefined();
    expect(cache.get(movieKey(3))).toBe('three');
    expect(cache.get(movieKey(4))).toBe('four');
  });

  it('peek does not count as a use', () => {
    const cache = new DetailCache(2);
    cache.set(movieKey(1), 'one');
    cache.set(movieKey(2), 'two');

    expect(cache.peek(movieKey(1))).toBe('one');

    cache.set(movieKey(3), 'three');
    // 1 was only peeked at, so it is still the oldest and was evicted.
    expect(cache.peek(movieKey(1))).toBeUndefined();
    expect(cache.peek(movieKey(2))).toBe('two');
    expect(cache.peek(movieKey(3))).toBe('three');
  });

  it('stays bounded under heavy churn', () => {
    const cache = new DetailCache(5);
    for (let i = 0; i < 100; i += 1) cache.set(movieKey(i), i);

    expect(cache.size()).toBe(5);
    expect(cache.peek(movieKey(99))).toBe(99);
    expect(cache.peek(movieKey(0))).toBeUndefined();
  });

  it('defaults to a bounded size suitable for a large library', () => {
    expect(MAX_ENTRIES).toBeGreaterThan(0);
    expect(MAX_ENTRIES).toBeLessThanOrEqual(1000);
    expect(new DetailCache().size()).toBe(0);
  });

  it('keys by kind, so a movie and a show with the same id do not collide', () => {
    const cache = new DetailCache();
    cache.set({ kind: 'movie', id: 7 }, 'movie-7');
    cache.set({ kind: 'tvshow', id: 7 }, 'show-7');

    expect(cache.get({ kind: 'movie', id: 7 })).toBe('movie-7');
    expect(cache.get({ kind: 'tvshow', id: 7 })).toBe('show-7');
  });

  it('refresh always fetches, even when the value is cached', async () => {
    const cache = new DetailCache();
    cache.set(movieKey(1), 'stale');

    const fetcher = vi.fn(async () => 'fresh');
    await expect(cache.refresh(movieKey(1), fetcher)).resolves.toBe('fresh');

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(cache.get(movieKey(1))).toBe('fresh');
  });

  it('collapses concurrent refreshes for the same item into one request', async () => {
    const cache = new DetailCache();
    const fetcher = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return 'value';
    });

    const [a, b, c] = await Promise.all([
      cache.refresh(movieKey(1), fetcher),
      cache.refresh(movieKey(1), fetcher),
      cache.refresh(movieKey(1), fetcher),
    ]);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect([a, b, c]).toEqual(['value', 'value', 'value']);
  });

  it('does not collapse refreshes for different items', async () => {
    const cache = new DetailCache();
    const fetcher = vi.fn(async (id: number) => id);

    await Promise.all([cache.refresh(movieKey(1), () => fetcher(1)), cache.refresh(movieKey(2), () => fetcher(2))]);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('allows a retry after a failed refresh', async () => {
    const cache = new DetailCache();
    await expect(cache.refresh(movieKey(1), async () => Promise.reject(new Error('offline')))).rejects.toThrow(
      'offline',
    );

    // The failed promise must not be retained, or the item could never be loaded.
    await expect(cache.refresh(movieKey(1), async () => 'recovered')).resolves.toBe('recovered');
    expect(cache.get(movieKey(1))).toBe('recovered');
  });

  it('skips the request inside an explicit freshness window', async () => {
    const cache = new DetailCache();
    const fetcher = vi.fn(async () => 'value');

    cache.set(movieKey(1), 'cached');
    await expect(cache.refresh(movieKey(1), fetcher, { maxAgeMs: 30_000 })).resolves.toBe('cached');

    // Episodes rely on this: one show payload serves every episode in the window.
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('refetches once the freshness window has passed', async () => {
    const cache = new DetailCache();
    const fetcher = vi.fn(async () => 'fresh');

    cache.set(movieKey(1), 'cached');
    // Move the entry's timestamp into the past rather than waiting in the test.
    const internal = cache as unknown as { writtenAt: Map<string, number> };
    internal.writtenAt.set('movie:1', Date.now() - 60_000);

    await expect(cache.refresh(movieKey(1), fetcher, { maxAgeMs: 30_000 })).resolves.toBe('fresh');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(cache.get(movieKey(1))).toBe('fresh');
  });

  it('revalidates when no freshness window is given', async () => {
    const cache = new DetailCache();
    const fetcher = vi.fn(async () => 'fresh');

    cache.set(movieKey(1), 'cached');
    await expect(cache.refresh(movieKey(1), fetcher)).resolves.toBe('fresh');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('a fresh window never serves an evicted entry', async () => {
    const cache = new DetailCache(1);
    cache.set(movieKey(1), 'one');
    cache.set(movieKey(2), 'two');

    const fetcher = vi.fn(async () => 'reloaded');
    await expect(cache.refresh(movieKey(1), fetcher, { maxAgeMs: 30_000 })).resolves.toBe('reloaded');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('invalidate and clear drop entries', async () => {
    const cache = new DetailCache();
    cache.set(movieKey(1), 'one');
    cache.set(movieKey(2), 'two');

    cache.invalidate(movieKey(1));
    expect(cache.get(movieKey(1))).toBeUndefined();
    expect(cache.size()).toBe(1);

    cache.clear();
    expect(cache.size()).toBe(0);
  });
});

const movieEntry = {
  id: 12,
  title: 'Ant-Man',
  sortTitle: 'Ant-Man',
  originalTitle: 'Ant-Man',
  year: 2015,
  fileName: 'Ant-Man (2015).mkv',
  hasNfo: true,
  nfoValid: true,
  scraped: true,
  runtimeMinutes: 117,
  genres: ['Action'],
  tags: [],
  actors: [{ name: 'Paul Rudd', role: 'Scott Lang' }],
  ratings: { imdb: 7.3 },
  userRating: null,
  watched: false,
  dateAdded: '2024-01-01',
  updatedAt: '2024-01-02',
  setId: null,
  setName: null,
  poster: '/artwork/poster/12',
  fanart: '/artwork/fanart/12',
  resolution: '1080p',
  videoCodec: 'h264',
} as unknown as MovieListEntry;

describe('detail seeds', () => {
  it('seeds a movie from the list row with the row identity intact', () => {
    const seed = seedMovieFromList(movieEntry);

    expect(seed.id).toBe(12);
    expect(seed.title).toBe('Ant-Man');
    expect(seed.year).toBe(2015);
    expect(seed.artwork.poster).toBe('/artwork/poster/12');
    expect(seed.artwork.fanart).toBe('/artwork/fanart/12');
    expect(seed.hasNfo).toBe(true);
    expect(seed.parsedInfo.mediaKind).toBe('movie');
    expect(seed.parsedInfo.resolution).toBe('1080p');
  });

  it('leaves unknown movie fields empty rather than inventing them', () => {
    const seed = seedMovieFromList(movieEntry);

    // These are real properties the panel renders; a seed must not guess them.
    expect(seed.plot).toBe('');
    expect(seed.folderPath).toBe('');
    expect(seed.actors[0]).toMatchObject({ name: 'Paul Rudd', role: 'Scott Lang' });
    expect(seed.streamDetails).toEqual({ video: [], audio: [], subtitle: [] });
    expect(seed.subtitles).toEqual([]);
  });

  it('seeds a show from a tree node', () => {
    const show = { id: 3, title: 'The Office', year: 2005, artwork: {} } as unknown as TvShowRecord;
    const node: ShowTreeNode = { show, seasons: [], episodes: [] };

    expect(seedShowFromTree(node)).toMatchObject({ id: 3, title: 'The Office' });
  });

  it('seeds an episode together with its show', () => {
    const show = { id: 3, title: 'The Office' } as unknown as TvShowRecord;
    const episode = {
      id: 55,
      showId: 3,
      title: 'Pilot',
      seasonNumber: 1,
      episodeNumber: 1,
    } as unknown as TvEpisodeRecord;
    const node: ShowTreeNode = { show, seasons: [], episodes: [episode] };

    expect(seedEpisodeFromTree(node, 55)).toMatchObject({
      show: { id: 3 },
      episode: { id: 55, title: 'Pilot' },
    });
  });

  it('returns no episode seed when the tree does not have the episode', () => {
    const show = { id: 3 } as unknown as TvShowRecord;
    const node: ShowTreeNode = { show, seasons: [], episodes: [] };

    // Null, not an empty object: the panel must fall back to its skeleton rather
    // than paint a header for an episode it knows nothing about.
    expect(seedEpisodeFromTree(node, 999)).toBeNull();
  });
});
