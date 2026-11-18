/**
 * Which films have "problems", for the purpose of a bulk targeted rescan.
 *
 * Deliberately derived from the same sources the Audit page uses (`buildAuditReport`)
 * plus the folder-ownership analysis, so the two can never drift: a film flagged on
 * the Audit page appears here, and vice versa. Re-implementing the rules a third time
 * is how a "fix everything flagged" button quietly misses things.
 *
 * Two very different kinds of problem live here:
 *
 *  - **Disk-side** problems — missing artwork, an NFO that is absent or invalid, a
 *    film that cannot own its folder. These are fixed by re-reading the file from
 *    disk, and that is what the rescan does.
 *  - **Metadata** problems — never scraped. A disk rescan cannot invent a plot.
 *
 * Only the disk-side kinds are actionable here. Scraping has its own home in the
 * audit's Unscraped section, and duplicating that action on a "problems" panel made
 * two buttons do the same job from different places. `needsScrape` is still reported
 * because it is genuinely useful context — it explains why a film stays incomplete
 * after a rescan — but nothing here acts on it.
 *
 * Callers may also narrow the set by kind, so the UI can offer per-type checkboxes
 * rather than all-or-nothing.
 */

import path from 'node:path';
import type {
  FolderProposalReport,
  LibraryAuditReport,
  MovieProblem,
  MovieProblemKind,
  MovieProblemReport,
  MovieRecord,
  ShowProblem,
  TvShowRecord,
} from '../../shared/types.js';
import { buildAuditReport } from './auditEngine.js';
import { MediaDatabase } from '../db/database.js';

const EMPTY_BY_KIND: Record<MovieProblemKind, number> = {
  unscraped: 0,
  'missing-nfo': 0,
  'invalid-nfo': 0,
  'missing-artwork': 0,
  'no-own-folder': 0,
  'low-resolution': 0,
};

/** Audit rules that mean "re-read this file" rather than "scrape this film". */
const RESCAN_FIXABLE: ReadonlySet<MovieProblemKind> = new Set<MovieProblemKind>([
  'missing-nfo',
  'invalid-nfo',
  'missing-artwork',
  'no-own-folder',
]);

export function buildMovieProblemReport(
  db: MediaDatabase,
  opts: {
    /** Folder analysis, passed in so this stays cheap when the caller has it. */
    folderReport?: FolderProposalReport;
    /** Injecting the audit keeps this testable without a full database. */
    audit?: LibraryAuditReport;
    /**
     * Restrict the report to these kinds. Omitted means all of them.
     *
     * Filtering is applied to the collected problems rather than to the audit pass, so
     * a narrowed report still costs the same to build — it is the *films returned* that
     * narrow, which is what a rescan selection needs.
     */
    kinds?: MovieProblemKind[];
  } = {},
): MovieProblemReport {
  const kindFilter = opts.kinds && opts.kinds.length > 0 ? new Set(opts.kinds) : null;
  const audit = opts.audit ?? buildAuditReport(db);
  const movies = db.listMovies();
  const shows = db.listTvShows();
  const byId = new Map<number, MovieProblem>();
  const showsById = new Map<number, ShowProblem>();

  const ensure = (m: MovieRecord): MovieProblem => {
    let entry = byId.get(m.id);
    if (!entry) {
      entry = {
        movieId: m.id,
        title: m.title,
        year: m.year,
        filePath: m.filePath,
        problems: [],
        rescanCanFix: false,
        needsScrape: false,
      };
      byId.set(m.id, entry);
    }
    return entry;
  };

  const add = (movieId: number, kind: MovieProblemKind) => {
    const m = movies.find((x) => x.id === movieId);
    if (!m) return;
    const entry = ensure(m);
    if (!entry.problems.includes(kind)) entry.problems.push(kind);
  };

  for (const item of audit.issues.unscrapedMovies) add(item.id, 'unscraped');
  for (const item of audit.issues.missingMovieNfo) add(item.id, 'missing-nfo');
  for (const item of audit.issues.invalidNfoFiles) {
    if (item.mediaType === 'movie') add(item.id, 'invalid-nfo');
  }
  for (const item of audit.issues.missingArtwork) {
    if (item.mediaType === 'movie') add(item.id, 'missing-artwork');
  }
  for (const item of audit.issues.lowResolutionItems) {
    if (item.mediaType === 'movie') add(item.id, 'low-resolution');
  }

  // A film that cannot own its folder is a problem even when everything else about it
  // looks fine: that is precisely the state that produced the crossed-poster bug.
  const folderReport = opts.folderReport;
  if (folderReport) {
    for (const p of folderReport.proposals) add(p.movieId, 'no-own-folder');
  }

  /* ---- TV shows: same kinds, different identifying fields ---- */

  const ensureShow = (s: TvShowRecord): ShowProblem => {
    let entry = showsById.get(s.id);
    if (!entry) {
      entry = {
        showId: s.id,
        title: s.title,
        year: s.year,
        folderPath: s.folderPath,
        problems: [],
        rescanCanFix: false,
        needsScrape: false,
      };
      showsById.set(s.id, entry);
    }
    return entry;
  };

  const addShow = (showId: number, kind: MovieProblemKind) => {
    const s = shows.find((x) => x.id === showId);
    if (!s) return;
    const entry = ensureShow(s);
    if (!entry.problems.includes(kind)) entry.problems.push(kind);
  };

  for (const item of audit.issues.unscrapedShows) addShow(item.id, 'unscraped');
  for (const item of audit.issues.missingArtwork) {
    if (item.mediaType === 'tvshow') addShow(item.id, 'missing-artwork');
  }
  for (const item of audit.issues.invalidNfoFiles) {
    if (item.mediaType === 'tvshow') addShow(item.id, 'invalid-nfo');
  }
  // Series NFO presence is tracked on the record rather than in an audit list, so it is
  // read directly; a show with no tvshow.nfo is the same problem as a film with none.
  for (const s of shows) {
    if (!s.hasNfo) addShow(s.id, 'missing-nfo');
  }

  const showResult = [...showsById.values()]
    .map((entry) => ({
      ...entry,
      problems: kindFilter ? entry.problems.filter((k) => kindFilter.has(k)) : entry.problems,
    }))
    .filter((entry) => entry.problems.length > 0)
    .map((entry) => ({
      ...entry,
      rescanCanFix: entry.problems.some((k) => RESCAN_FIXABLE.has(k)),
      needsScrape: entry.problems.includes('unscraped'),
    }))
    .sort((a, b) => a.title.localeCompare(b.title));

  const result = [...byId.values()]
    .map((entry) => {
      const problems = kindFilter ? entry.problems.filter((k) => kindFilter.has(k)) : entry.problems;
      return { ...entry, problems };
    })
    // A film whose only problems were filtered out is not part of this report.
    .filter((entry) => entry.problems.length > 0)
    .map((entry) => ({
      ...entry,
      rescanCanFix: entry.problems.some((k) => RESCAN_FIXABLE.has(k)),
      needsScrape: entry.problems.includes('unscraped'),
    }))
    .sort((a, b) => a.title.localeCompare(b.title));

  const byKind = { ...EMPTY_BY_KIND };
  for (const entry of result) for (const kind of entry.problems) byKind[kind] += 1;

  const showByKind = { ...EMPTY_BY_KIND };
  for (const entry of showResult) for (const kind of entry.problems) showByKind[kind] += 1;

  return {
    movies: result,
    shows: showResult,
    summary: {
      total: result.length + showResult.length,
      rescanFixable:
        result.filter((m) => m.rescanCanFix).length + showResult.filter((s) => s.rescanCanFix).length,
      needingScrape:
        result.filter((m) => m.needsScrape).length + showResult.filter((s) => s.needsScrape).length,
      byKind: Object.fromEntries(
        (Object.keys(EMPTY_BY_KIND) as MovieProblemKind[]).map((k) => [k, byKind[k] + showByKind[k]]),
      ) as Record<MovieProblemKind, number>,
      movies: result.length,
      shows: showResult.length,
    },
  };
}

/** Films whose stored folder path disagrees with where their file actually is. */
export function movieFolderOf(m: MovieRecord): string {
  return path.dirname(m.filePath);
}
