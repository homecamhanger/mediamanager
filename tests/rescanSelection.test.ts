/**
 * The rescan kinds filter.
 *
 * The rescan used to act on every flagged film at once. The requirement was that film
 * types of problem could be selected individually, so a "fix missing artwork" run must
 * not drag NFO-only films along with it — and a film whose only problems were filtered
 * out must disappear from the report entirely, not come back with an empty list.
 */
import { describe, expect, it } from 'vitest';
import { buildMovieProblemReport } from '../src/server/audit/movieProblems.js';
import type { LibraryAuditReport } from '../src/shared/types.js';
import type { MediaDatabase } from '../src/server/db/database.js';

const movie = (id: number, title: string) => ({
  id,
  sourceId: 1,
  folderPath: `/lib/Movies/${title}`,
  filePath: `/lib/Movies/${title}/film.mkv`,
  fileName: 'film.mkv',
  hasNfo: true,
  nfoValid: true,
  nfoWarnings: [] as string[],
  scraped: true,
  title,
  artwork: { poster: 'p.jpg', fanart: 'f.jpg', banner: 'b.jpg' },
  streamDetails: { video: [{ height: 1080 }], audio: [] },
  subtitles: [{ language: 'en' }],
  uniqueIds: {},
  parsedInfo: { cleanTitle: title, year: 2020, mediaKind: 'movie' },
});

const FILMS = [movie(1, 'Alpha'), movie(2, 'Beta'), movie(3, 'Gamma')];

/**
 * Alpha: missing artwork only.
 * Beta:  missing NFO only.
 * Gamma: both, plus unscraped.
 */
function auditWithMixedProblems(): LibraryAuditReport {
  return {
    issues: {
      unscrapedMovies: [{ id: 3, title: 'Gamma', filePath: FILMS[2].filePath }],
      unscrapedShows: [],
      missingMovieNfo: [{ id: 2, title: 'Beta', filePath: FILMS[1].filePath }],
      missingEpisodeNfo: [],
      missingArtwork: [{ mediaType: 'movie', id: 1, title: 'Alpha', missing: ['poster'] }],
      invalidNfoFiles: [],
      lowResolutionItems: [],
    },
  } as unknown as LibraryAuditReport;
}

function dbWith(films = FILMS, shows: unknown[] = []) {
  return { listMovies: () => films, listTvShows: () => shows } as unknown as MediaDatabase;
}


function build(kinds?: ('unscraped' | 'missing-nfo' | 'missing-artwork' | 'invalid-nfo' | 'no-own-folder' | 'low-resolution')[]) {
  return buildMovieProblemReport(dbWith(), {
    audit: auditWithMixedProblems(),
    ...(kinds ? { kinds } : {}),
  });
}

describe('rescan kinds filter', () => {
  it('returns every flagged film when no kinds are given', () => {
    const r = build();
    expect(r.movies.map((m) => m.title).sort()).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(r.summary.total).toBe(3);
  });

  it('narrows to films with the selected problem only', () => {
    const r = build(['missing-artwork']);
    expect(r.movies.map((m) => m.title)).toEqual(['Alpha']);
  });

  it('keeps a film that has several problems when one is selected', () => {
    const r = build(['unscraped']);
    expect(r.movies.map((m) => m.title)).toEqual(['Gamma']);
    // Only the selected kind is listed, so the row does not imply the others are ticked.
    expect(r.movies[0].problems).toEqual(['unscraped']);
  });

  it('drops films whose problems were all filtered out', () => {
    // Beta only has a missing NFO; asking about artwork must not return it with an
    // empty problem list, which would render as a broken row and could be rescanned.
    const r = build(['missing-artwork', 'unscraped']);
    expect(r.movies.some((m) => m.title === 'Beta')).toBe(false);
  });

  it('recomputes the per-kind summary from the filtered set', () => {
    const all = build();
    const art = build(['missing-artwork']);
    expect(art.summary.total).toBeLessThan(all.summary.total);
    // art.summary.byKind counts only what survived.
    const totalByKind = Object.values(art.summary.byKind).reduce((a, b) => a + b, 0);
    expect(totalByKind).toBe(art.movies.reduce((n, m) => n + m.problems.length, 0));
  });

  it('treats an empty kinds list as no filter', () => {
    expect(build([]).summary.total).toBe(3);
  });

  it('returns nothing when the selected kinds match no film', () => {
    const r = build(['no-own-folder']);
    expect(r.movies).toEqual([]);
    expect(r.summary.total).toBe(0);
  });

  it('marks rescanCanFix from the filtered problems, not the original ones', () => {
    // 'unscraped' is not rescan-fixable. If a film's only selected problem is that,
    // a rescan must not claim it can fix it.
    const r = build(['unscraped']);
    expect(r.movies[0].needsScrape).toBe(true);
    expect(r.movies[0].rescanCanFix).toBe(false);
  });
});

/**
 * Shows are part of the same report.
 *
 * The panel rescan uses has movies and TV shows checkboxes, so the report has to carry
 * both. Shows identify by folder, not video file, and are flagged by different audit
 * lists — which is exactly the sort of mismatch that would silently leave a whole media
 * type out of a rescan.
 */
describe('show problems', () => {
  const show = (id: number, title: string, hasNfo = true) => ({
    id,
    sourceId: 1,
    folderPath: `/lib/TV/${title}`,
    hasNfo,
    nfoValid: true,
    nfoWarnings: [] as string[],
    scraped: true,
    title,
    year: 2022,
    episodeGuide: [],
    artwork: { poster: 'p.jpg', fanart: 'f.jpg', banner: 'b.jpg' },
    uniqueIds: {},
  });

  const shows = [show(101, 'Andor', false), show(102, 'Foundation', true)];

  function auditWithShowProblems(): LibraryAuditReport {
    return {
      issues: {
        unscrapedMovies: [],
        unscrapedShows: [{ id: 102, title: 'Foundation', folderPath: '/lib/TV/Foundation' }],
        missingMovieNfo: [],
        missingEpisodeNfo: [],
        missingArtwork: [
          { mediaType: 'tvshow', id: 101, title: 'Andor', missing: ['poster'] },
        ],
        invalidNfoFiles: [],
        lowResolutionItems: [],
      },
    } as unknown as LibraryAuditReport;
  }

  const buildShows = (kinds?: ('unscraped' | 'missing-nfo' | 'missing-artwork' | 'invalid-nfo' | 'no-own-folder' | 'low-resolution')[]) =>
    buildMovieProblemReport(dbWith([], shows), {
      audit: auditWithShowProblems(),
      ...(kinds ? { kinds } : {}),
    });

  it('reports shows alongside films', () => {
    const r = buildShows();
    expect(r.shows.map((s) => s.title).sort()).toEqual(['Andor', 'Foundation']);
    expect(r.summary.shows).toBe(2);
    expect(r.summary.movies).toBe(0);
  });

  it('flags a show with no tvshow.nfo', () => {
    const r = buildShows(['missing-nfo']);
    expect(r.shows.map((s) => s.title)).toEqual(['Andor']);
    expect(r.shows[0].problems).toEqual(['missing-nfo']);
  });

  it('identifies shows by folder path, not a video file', () => {
    const r = buildShows(['missing-artwork']);
    expect(r.shows[0].folderPath).toBe('/lib/TV/Andor');
  });

  it('narrows shows by kind the same way it narrows films', () => {
    expect(buildShows(['missing-artwork']).shows.map((s) => s.title)).toEqual(['Andor']);
    expect(buildShows(['unscraped']).shows.map((s) => s.title)).toEqual(['Foundation']);
  });

  it('counts total across both media types', () => {
    const r = buildShows();
    expect(r.summary.total).toBe(r.movies.length + r.shows.length);
  });
});
