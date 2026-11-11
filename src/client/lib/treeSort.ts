import type { ListableMovie, MovieSetRecord, RatingEntry, TvEpisodeRecord, TvShowRecord } from '../../shared/types.js';

/** Everything `sortSets` aggregates over — satisfied by `SetMovieRef`. */
type SetSortableMovie = Pick<
  ListableMovie,
  'id' | 'year' | 'ratings' | 'userRating' | 'runtimeMinutes' | 'durationSeconds' | 'dateAdded' | 'updatedAt' | 'scraped' | 'hasNfo' | 'nfoValid' | 'poster' | 'subtitleCount'
>;
import type { ShowTreeNode } from './workspaceTypes.js';

export type SortKey = 'title' | 'year' | 'rating' | 'runtime' | 'added' | 'completeness';
export type SortDir = 'asc' | 'desc';

export type MovieFilter =
  | 'all'
  | 'unscraped'
  | 'missing_nfo'
  | 'nfo_warnings'
  | 'missing_subs'
  | 'missing_art'
  | '4k'
  | 'unwatched';

export type TvFilter =
  | 'all'
  | 'unscraped'
  | 'missing_nfo'
  | 'nfo_warnings'
  | 'missing_subs'
  | 'missing_art'
  | 'missing_eps'
  | 'unwatched';

export const DEFAULT_SORT_DIR: Record<SortKey, SortDir> = {
  title: 'asc',
  year: 'desc',
  rating: 'desc',
  runtime: 'desc',
  added: 'desc',
  completeness: 'desc',
};

export function getPrimaryRating(ratings: RatingEntry[], userRating: number | null): number {
  const def = ratings.find((r) => r.isDefault);
  if (def) return def.value;
  if (ratings.length > 0) return ratings[0].value;
  return userRating ?? 0;
}

export function getMovieCompleteness(m: SetSortableMovie): number {
  let score = 0;
  if (m.scraped) score++;
  if (m.hasNfo && m.nfoValid) score++;
  if (m.poster) score++;
  // The list projection only carries a poster; an absent one still scores the
  // same as before, and the detail panel shows fanart when present.
  if (m.subtitleCount > 0) score++;
  return score;
}

export function getShowCompleteness(node: ShowTreeNode): number {
  let score = 0;
  if (node.show.scraped) score++;
  if (node.show.hasNfo && node.show.nfoValid) score++;
  if (node.show.artwork.poster) score++;
  if (node.show.artwork.fanart) score++;
  if (node.show.missingNfoCount === 0 && (node.show.missingEpisodesCount ?? 0) === 0) score++;
  return score;
}

function getMovieRuntime(m: SetSortableMovie): number {
  if (m.runtimeMinutes != null && m.runtimeMinutes > 0) return m.runtimeMinutes;
  return m.durationSeconds > 0 ? Math.round(m.durationSeconds / 60) : 0;
}

function getShowRuntime(node: ShowTreeNode): number {
  return node.episodes.reduce((sum, ep) => {
    if (ep.runtimeMinutes != null && ep.runtimeMinutes > 0) return sum + ep.runtimeMinutes;
    const secs = ep.streamDetails.video[0]?.durationSeconds ?? 0;
    return sum + (secs > 0 ? Math.round(secs / 60) : 0);
  }, 0);
}

function parseTimestamp(iso: string | null | undefined, fallback: number): number {
  if (!iso) return fallback;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function compareNumbers(a: number, b: number, dir: SortDir): number {
  return dir === 'asc' ? a - b : b - a;
}

function compareStrings(a: string, b: string, dir: SortDir): number {
  const cmp = a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
  return dir === 'asc' ? cmp : -cmp;
}

export function sortMovies<T extends ListableMovie>(list: T[], sortKey: SortKey, sortDir: SortDir): T[] {
  return [...list].sort((a, b) => {
    const aLabel = a.sortTitle || a.title;
    const bLabel = b.sortTitle || b.title;
    let cmp = 0;
    switch (sortKey) {
      case 'title':
        cmp = compareStrings(aLabel, bLabel, sortDir);
        break;
      case 'year':
        cmp = compareNumbers(a.year ?? 0, b.year ?? 0, sortDir);
        break;
      case 'rating':
        cmp = compareNumbers(
          getPrimaryRating(a.ratings, a.userRating),
          getPrimaryRating(b.ratings, b.userRating),
          sortDir
        );
        break;
      case 'runtime':
        cmp = compareNumbers(getMovieRuntime(a), getMovieRuntime(b), sortDir);
        break;
      case 'added':
        cmp = compareNumbers(
          parseTimestamp(a.dateAdded || a.updatedAt, a.id),
          parseTimestamp(b.dateAdded || b.updatedAt, b.id),
          sortDir
        );
        break;
      case 'completeness':
        cmp = compareNumbers(getMovieCompleteness(a), getMovieCompleteness(b), sortDir);
        break;
    }
    if (cmp !== 0) return cmp;
    return aLabel.localeCompare(bLabel, undefined, { sensitivity: 'base', numeric: true });
  });
}

export function sortShowTree(list: ShowTreeNode[], sortKey: SortKey, sortDir: SortDir): ShowTreeNode[] {
  return [...list].sort((a, b) => {
    const aShow: TvShowRecord = a.show;
    const bShow: TvShowRecord = b.show;
    const aLabel = aShow.sortTitle || aShow.title;
    const bLabel = bShow.sortTitle || bShow.title;
    let cmp = 0;
    switch (sortKey) {
      case 'title':
        cmp = compareStrings(aLabel, bLabel, sortDir);
        break;
      case 'year':
        cmp = compareNumbers(aShow.year ?? 0, bShow.year ?? 0, sortDir);
        break;
      case 'rating':
        cmp = compareNumbers(
          getPrimaryRating(aShow.ratings, aShow.userRating),
          getPrimaryRating(bShow.ratings, bShow.userRating),
          sortDir
        );
        break;
      case 'runtime':
        cmp = compareNumbers(getShowRuntime(a), getShowRuntime(b), sortDir);
        break;
      case 'added':
        cmp = compareNumbers(
          parseTimestamp(aShow.dateAdded || aShow.updatedAt, aShow.id),
          parseTimestamp(bShow.dateAdded || bShow.updatedAt, bShow.id),
          sortDir
        );
        break;
      case 'completeness':
        cmp = compareNumbers(getShowCompleteness(a), getShowCompleteness(b), sortDir);
        break;
    }
    if (cmp !== 0) return cmp;
    return aLabel.localeCompare(bLabel, undefined, { sensitivity: 'base', numeric: true });
  });
}

export function sortSets(list: MovieSetRecord[], sortKey: SortKey, sortDir: SortDir): MovieSetRecord[] {
  return [...list].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'title':
        cmp = compareStrings(a.name, b.name, sortDir);
        break;
      case 'year': {
        const ay = Math.max(0, ...a.movies.map((m) => m.year ?? 0));
        const by = Math.max(0, ...b.movies.map((m) => m.year ?? 0));
        cmp = compareNumbers(ay, by, sortDir);
        break;
      }
      case 'rating': {
        const ar = a.movies.length
          ? a.movies.reduce((s, m) => s + getPrimaryRating(m.ratings, m.userRating), 0) / a.movies.length
          : 0;
        const br = b.movies.length
          ? b.movies.reduce((s, m) => s + getPrimaryRating(m.ratings, m.userRating), 0) / b.movies.length
          : 0;
        cmp = compareNumbers(ar, br, sortDir);
        break;
      }
      case 'runtime': {
        const art = a.movies.reduce((s, m) => s + getMovieRuntime(m), 0);
        const brt = b.movies.reduce((s, m) => s + getMovieRuntime(m), 0);
        cmp = compareNumbers(art, brt, sortDir);
        break;
      }
      case 'added': {
        const at = a.movies.length
          ? Math.max(...a.movies.map((m) => parseTimestamp(m.dateAdded || m.updatedAt, m.id)))
          : a.id;
        const bt = b.movies.length
          ? Math.max(...b.movies.map((m) => parseTimestamp(m.dateAdded || m.updatedAt, m.id)))
          : b.id;
        cmp = compareNumbers(at, bt, sortDir);
        break;
      }
      case 'completeness': {
        const ac = a.movies.length
          ? a.movies.reduce((s, m) => s + getMovieCompleteness(m), 0) / a.movies.length
          : 0;
        const bc = b.movies.length
          ? b.movies.reduce((s, m) => s + getMovieCompleteness(m), 0) / b.movies.length
          : 0;
        cmp = compareNumbers(ac, bc, sortDir);
        break;
      }
    }
    if (cmp !== 0) return cmp;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
  });
}

export function movieMatchesFilter(m: ListableMovie, filter: MovieFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'unscraped') return !m.scraped;
  if (filter === 'missing_nfo') return !m.hasNfo;
  if (filter === 'nfo_warnings') return m.hasNfo && (!m.nfoValid || m.nfoWarningCount > 0);
  if (filter === 'missing_subs') return m.subtitleCount === 0;
  if (filter === 'missing_art') return !m.poster || !m.fanart;
  if (filter === 'unwatched') return !m.watched;
  if (filter === '4k') {
    return m.resolution === '2160p';
  }
  return true;
}

function pruneNodeToEpisodes(node: ShowTreeNode, matchingEpisodes: TvEpisodeRecord[]): ShowTreeNode {
  const seasonNums = new Set(matchingEpisodes.map((e) => e.displaySeason ?? e.seasonNumber));
  return {
    show: node.show,
    seasons: node.seasons.filter((s) => seasonNums.has(s.seasonNumber)),
    episodes: matchingEpisodes,
  };
}

export function filterShowTreeNodes(nodes: ShowTreeNode[], filter: TvFilter): ShowTreeNode[] {
  if (filter === 'all') return nodes;
  const out: ShowTreeNode[] = [];

  for (const node of nodes) {
    const showHasNfoWarn = node.show.hasNfo && (!node.show.nfoValid || node.show.nfoWarnings.length > 0);
    const epHasNfoWarn = (ep: TvEpisodeRecord) => ep.hasNfo && (!ep.nfoValid || ep.nfoWarnings.length > 0);

    if (filter === 'unscraped') {
      if (!node.show.scraped) out.push(node);
    } else if (filter === 'missing_nfo') {
      if (!node.show.hasNfo || node.show.missingNfoCount > 0) out.push(node);
    } else if (filter === 'missing_art') {
      if (!node.show.artwork.poster || !node.show.artwork.fanart) out.push(node);
    } else if (filter === 'missing_eps') {
      if ((node.show.missingEpisodesCount ?? 0) > 0) out.push(node);
    } else if (filter === 'nfo_warnings') {
      if (showHasNfoWarn) {
        out.push(node);
      } else {
        const warnEps = node.episodes.filter(epHasNfoWarn);
        if (warnEps.length > 0) out.push(pruneNodeToEpisodes(node, warnEps));
      }
    } else if (filter === 'missing_subs') {
      const noSubEps = node.episodes.filter((ep) => ep.subtitles.length === 0);
      if (noSubEps.length > 0) out.push(pruneNodeToEpisodes(node, noSubEps));
    } else if (filter === 'unwatched') {
      const unwatchedEps = node.episodes.filter((ep) => !ep.watched);
      if (unwatchedEps.length > 0) out.push(pruneNodeToEpisodes(node, unwatchedEps));
    }
  }
  return out;
}
