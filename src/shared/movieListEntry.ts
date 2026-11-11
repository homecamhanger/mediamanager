import type { MovieRecord } from './types.js';

/**
 * A deliberately small movie record for the sidebar list.
 *
 * The list endpoint used to ship full `MovieRecord`s — ~8.8 KB each, dominated by
 * `streamDetails`, `parsedInfo`, and eight artwork slots — so a 1,300-movie library
 * meant an ~11 MB payload and roughly 800 ms before the list could paint.
 *
 * This projection keeps exactly the fields the sidebar renders and the list
 * sorting/filtering helpers read. Anything heavier is fetched per-movie by the
 * detail panel, which already calls `GET /api/movies/:id`.
 */
export interface MovieListEntry {
  id: number;
  title: string;
  /** Sort key — the DB orders by this, and list sorting mirrors it. */
  sortTitle: string;
  /** Used by the sidebar's text search. */
  originalTitle: string;
  /** Used by the sidebar's text search (searching by file name is expected). */
  fileName: string;
  year: number | null;
  watched: boolean;
  scraped: boolean;
  hasNfo: boolean;
  nfoValid: boolean;
  nfoWarningCount: number;
  subtitleCount: number;
  setName: string | null;
  /** Set membership — used by the set panel's "add movie" picker. */
  setId: number | null;
  /** Primary poster path only — the list never shows banner/logo. */
  poster: string | null;
  /** Needed by set filtering, which checks artwork completeness. */
  fanart: string | null;
  /** Genre list, used by filtering. */
  genres: string[];
  tags: string[];
  actors: Array<{ name: string; role: string }>;
  ratings: Array<{ source: string; value: number; max: number; isDefault?: boolean }>;
  userRating: number | null;
  dateAdded: string;
  updatedAt: string;
  runtimeMinutes: number | null;
  /** Duration fallback when `runtimeMinutes` is absent — list sorting uses it. */
  durationSeconds: number;
  /** Resolution/codec for the row's technical badge. */
  resolution: string | null;
  videoCodec: string | null;
}

/**
 * Project a full record down to what the list needs. Kept pure so the reducer is
 * testable without a database and stays in sync with the SQL projection.
 */
export function toMovieListEntry(m: MovieRecord): MovieListEntry {
  return {
    id: m.id,
    title: m.title,
    sortTitle: m.sortTitle ?? '',
    originalTitle: m.originalTitle ?? '',
    fileName: m.fileName,
    year: m.year,
    watched: m.watched,
    scraped: m.scraped,
    hasNfo: m.hasNfo,
    nfoValid: m.nfoValid,
    nfoWarningCount: m.nfoWarnings.length,
    subtitleCount: m.subtitles.length,
    setName: m.setName ?? null,
    setId: m.setId ?? null,
    poster: m.artwork.poster ?? null,
    fanart: m.artwork.fanart ?? null,
    genres: m.genres,
    tags: m.tags,
    actors: m.actors.map((a) => ({ name: a.name, role: a.role ?? '' })),
    ratings: m.ratings.map((r) => ({ source: r.source, value: r.value, max: r.max, isDefault: r.isDefault })),
    userRating: m.userRating,
    dateAdded: m.dateAdded,
    updatedAt: m.updatedAt,
    runtimeMinutes: m.runtimeMinutes,
    durationSeconds: m.streamDetails.video[0]?.durationSeconds ?? 0,
    resolution: m.parsedInfo.resolution ?? null,
    videoCodec: m.parsedInfo.videoCodec ?? null,
  };
}

/**
 * The structural minimum the list helpers (`treeSort`, `castFilter`) and the
 * sidebar need. Both the slim `MovieListEntry` and a full `MovieRecord` satisfy it,
 * so those helpers accept either without a cast.
 */
export interface ListableMovie {
  id: number;
  title: string;
  sortTitle: string;
  originalTitle: string;
  fileName: string;
  year: number | null;
  watched: boolean;
  scraped: boolean;
  hasNfo: boolean;
  nfoValid: boolean;
  nfoWarningCount: number;
  subtitleCount: number;
  setName: string | null;
  setId: number | null;
  poster: string | null;
  fanart: string | null;
  genres: string[];
  tags: string[];
  actors: Array<{ name: string; role: string }>;
  ratings: Array<{ source: string; value: number; max: number; isDefault?: boolean }>;
  userRating: number | null;
  dateAdded: string;
  updatedAt: string;
  runtimeMinutes: number | null;
  durationSeconds: number;
  resolution: string | null;
  videoCodec: string | null;
}

/**
 * A movie as it appears inside a set. Sets used to embed full `MovieRecord`s
 * (7+ KB each), which dominated the `/api/sets` payload. The set panel and the
 * sidebar only need enough to draw a tile and navigate.
 */
export interface SetMovieRef {
  id: number;
  title: string;
  year: number | null;
  watched: boolean;
  poster: string | null;
  fanart: string | null;
  runtimeMinutes: number | null;
  durationSeconds: number;
  scraped: boolean;
  hasNfo: boolean;
  nfoValid: boolean;
  nfoWarningCount: number;
  subtitleCount: number;
  actors: Array<{ name: string; role: string }>;
  ratings: Array<{ source: string; value: number; max: number; isDefault?: boolean }>;
  userRating: number | null;
  dateAdded: string;
  updatedAt: string;
}

export function toSetMovieRef(m: MovieRecord): SetMovieRef {
  return {
    id: m.id,
    title: m.title,
    year: m.year,
    watched: m.watched,
    poster: m.artwork.poster ?? null,
    fanart: m.artwork.fanart ?? null,
    runtimeMinutes: m.runtimeMinutes,
    durationSeconds: m.streamDetails.video[0]?.durationSeconds ?? 0,
    scraped: m.scraped,
    hasNfo: m.hasNfo,
    nfoValid: m.nfoValid,
    nfoWarningCount: m.nfoWarnings.length,
    subtitleCount: m.subtitles.length,
    actors: m.actors.map((a) => ({ name: a.name, role: a.role ?? '' })),
    ratings: m.ratings.map((r) => ({ source: r.source, value: r.value, max: r.max, isDefault: r.isDefault })),
    userRating: m.userRating,
    dateAdded: m.dateAdded,
    updatedAt: m.updatedAt,
  };
}
