/**
 * Bounded in-memory cache for rendered artwork.
 *
 * `renderArtworkBuffer` rasterises an SVG with Resvg, decodes the PNG, and
 * re-encodes it as JPEG — ~40 KB of output and genuinely CPU-bound. The
 * `/api/artwork/render` route ran all of that on every cache miss, and a cache miss
 * happens on every client that has not seen the image, plus again after the
 * one-hour client cache expires.
 *
 * Bounded on purpose: an unbounded map keyed by arbitrary query strings is a
 * memory leak with a remote trigger. This evicts by entry count *and* total bytes,
 * and the key is derived from the full render input so two different titles can
 * never collide.
 */

export interface RenderCacheOptions {
  /** Maximum number of rendered images retained. */
  maxEntries?: number;
  /** Maximum total bytes retained. */
  maxBytes?: number;
}

export interface RenderCacheStats {
  entries: number;
  bytes: number;
  hits: number;
  misses: number;
  evictions: number;
}

const DEFAULT_MAX_ENTRIES = 128;
const DEFAULT_MAX_BYTES = 64 * 1024 * 1024; // 64 MB

export class RenderCache {
  private map = new Map<string, Buffer>();
  private bytes = 0;
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private readonly maxEntries: number;
  private readonly maxBytes: number;

  constructor(options: RenderCacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  }

  get(key: string): Buffer | undefined {
    const found = this.map.get(key);
    if (!found) {
      this.misses += 1;
      return undefined;
    }
    // Refresh recency: delete + re-insert moves it to the end of insertion order.
    this.map.delete(key);
    this.map.set(key, found);
    this.hits += 1;
    return found;
  }

  set(key: string, value: Buffer): void {
    const existing = this.map.get(key);
    if (existing) {
      this.bytes -= existing.length;
      this.map.delete(key);
    }
    this.map.set(key, value);
    this.bytes += value.length;
    this.evict();
  }

  /** Returns the cached value, or computes, stores and returns it. */
  getOrCompute(key: string, compute: () => Buffer): Buffer {
    const cached = this.get(key);
    if (cached) return cached;
    const value = compute();
    this.set(key, value);
    return value;
  }

  clear(): void {
    this.map.clear();
    this.bytes = 0;
  }

  stats(): RenderCacheStats {
    return {
      entries: this.map.size,
      bytes: this.bytes,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
    };
  }

  private evict(): void {
    // Oldest first. A single oversized image (larger than the whole budget) is
    // dropped immediately rather than flushing the cache to make room for it.
    while (this.map.size > this.maxEntries || this.bytes > this.maxBytes) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey === undefined) break;
      const oldest = this.map.get(oldestKey)!;
      this.map.delete(oldestKey);
      this.bytes -= oldest.length;
      this.evictions += 1;
      if (this.map.size === 0) break;
    }
  }
}

/** Stable key for a render: every input that affects the pixels is included. */
export function renderCacheKey(
  input: {
    kind: string;
    title: string;
    subtitle?: string;
    year?: number | null;
    genres?: string[];
    rating?: number | null;
    accentColor?: string;
    secondaryColor?: string;
    episodeCode?: string;
  },
  ext: string
): string {
  return JSON.stringify([
    input.kind,
    input.title,
    input.subtitle ?? '',
    input.year ?? null,
    input.genres ?? [],
    input.rating ?? null,
    input.accentColor ?? '',
    input.secondaryColor ?? '',
    input.episodeCode ?? '',
    ext,
  ]);
}

/** Process-wide cache used by the artwork route. */
export const artworkRenderCache = new RenderCache();
