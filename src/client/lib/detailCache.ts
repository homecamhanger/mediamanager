/**
 * In-memory cache for detail-panel payloads.
 *
 * Selecting a list item used to leave the *previous* item on screen until two
 * sequential round-trips finished: `GET /api/movies/:id`, then a synchronous NFO
 * read off the media share. On an SMB library that is a visible second or more of
 * showing the wrong thing, which is what makes the app feel like it is always one
 * step behind.
 *
 * The list already knows enough to paint (title, year, poster), so the panel can
 * open populated and revalidate behind the user. This cache is what it paints from
 * when the item has been seen before.
 *
 * Design:
 *  - Keyed by media kind and id; entries are whole API payloads, so a hit needs no
 *    second request to render.
 *  - Bounded LRU, because a 1,300-film library would otherwise retain every detail
 *    payload for the session.
 *  - Deliberately in-memory only. IndexedDB is for the snapshot that makes a cold
 *    start fast; per-item detail is cheap to refetch and would bloat the schema.
 *  - A hit is a *head start*, never a substitute for the request: `refresh` always
 *    fetches, but collapses concurrent fetches for the same item so that clicking
 *    rapidly between titles does not stack up duplicate requests.
 */

import type {
  MissingEpisodeRecord,
  TvEpisodeRecord,
  TvSeasonRecord,
  TvShowRecord,
  UnmatchedVideoFile,
} from '../../shared/types.js';

/** Whole `GET /api/shows/:id` payload, cached as one unit. */
export interface ShowDetailPayload {
  show: TvShowRecord;
  seasons: TvSeasonRecord[];
  episodes: TvEpisodeRecord[];
  missingEpisodes: MissingEpisodeRecord[];
  unmatchedFiles: UnmatchedVideoFile[];
}

export interface DetailCacheKey {
  kind: 'movie' | 'tvshow' | 'episode';
  id: number;
}

export const MAX_ENTRIES = 200;

function keyOf(key: DetailCacheKey): string {
  return `${key.kind}:${key.id}`;
}

export class DetailCache {
  private map = new Map<string, unknown>();
  /** When each entry was written, for the optional freshness window. */
  private writtenAt = new Map<string, number>();
  private inflight = new Map<string, Promise<unknown>>();

  constructor(private readonly maxEntries: number = MAX_ENTRIES) {}

  /** Reads without marking the entry as recently used. */
  peek<T>(key: DetailCacheKey): T | undefined {
    return this.map.get(keyOf(key)) as T | undefined;
  }

  /** Reads and marks the entry as most recently used. */
  get<T>(key: DetailCacheKey): T | undefined {
    const k = keyOf(key);
    if (!this.map.has(k)) return undefined;
    const found = this.map.get(k) as T;
    // Refresh recency: delete + reinsert moves the key to the end of iteration order.
    this.map.delete(k);
    this.map.set(k, found);
    return found;
  }

  set<T>(key: DetailCacheKey, value: T): void {
    const k = keyOf(key);
    this.map.delete(k);
    this.map.set(k, value);
    this.writtenAt.set(k, Date.now());
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
      this.writtenAt.delete(oldest);
    }
  }

  /** How old the cached entry is, in milliseconds, or `undefined` if absent. */
  age(key: DetailCacheKey): number | undefined {
    const at = this.writtenAt.get(keyOf(key));
    return at === undefined ? undefined : Date.now() - at;
  }

  /**
   * Fetches and stores a fresh value, collapsing concurrent duplicates.
   *
   * Normally hits the network — a cached value is for painting, not for skipping the
   * revalidation that keeps the panel honest. Two panels (or two rapid clicks)
   * asking for the same item share one request.
   *
   * `maxAgeMs` opts into skipping that request when the entry is fresh enough.
   * Episodes use it because they all read the same `GET /api/shows/:id` payload:
   * without it, clicking through a season would refetch the whole series per click.
   * Any mutation calls `refreshAll`, which clears this cache, so a freshness window
   * cannot outlive an edit.
   */
  refresh<T>(key: DetailCacheKey, fetcher: () => Promise<T>, opts: { maxAgeMs?: number } = {}): Promise<T> {
    const k = keyOf(key);
    const pending = this.inflight.get(k);
    if (pending) return pending as Promise<T>;

    if (opts.maxAgeMs !== undefined) {
      const age = this.age(key);
      const cached = this.peek<T>(key);
      if (cached !== undefined && age !== undefined && age <= opts.maxAgeMs) {
        return Promise.resolve(cached);
      }
    }

    const request = fetcher()
      .then((value) => {
        this.set(key, value);
        return value;
      })
      .finally(() => {
        // Only clear our own entry: a later request may already have taken the slot.
        if (this.inflight.get(k) === request) this.inflight.delete(k);
      });
    this.inflight.set(k, request);
    return request;
  }

  invalidate(key: DetailCacheKey): void {
    const k = keyOf(key);
    this.map.delete(k);
    this.writtenAt.delete(k);
  }

  clear(): void {
    this.map.clear();
    this.writtenAt.clear();
    this.inflight.clear();
  }

  size(): number {
    return this.map.size;
  }
}

/** Shared cache used by the detail panels. */
export const detailCache = new DetailCache();

/** Convenience key builders, so call sites do not hand-write discriminants. */
export const movieKey = (id: number): DetailCacheKey => ({ kind: 'movie', id });
export const showKey = (id: number): DetailCacheKey => ({ kind: 'tvshow', id });
