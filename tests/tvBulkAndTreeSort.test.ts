import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  ArtworkKind,
  MovieRecord,
  MovieSetRecord,
  ParsedFilenameInfo,
  TvEpisodeRecord,
  TvSeasonRecord,
  TvShowRecord,
} from '../src/shared/types.js';
import { createApiApp } from '../src/server/app.js';
import { MediaDatabase } from '../src/server/db/database.js';
import { resetAndSeedSampleLibrary } from '../src/server/scanner/sampleGenerator.js';
import {
  filterShowTreeNodes,
  movieMatchesFilter,
  sortMovies,
  sortSets,
  sortShowTree,
} from '../src/client/lib/treeSort.js';
import type { ShowTreeNode } from '../src/client/lib/workspaceTypes.js';

const tmpDirs: string[] = [];

afterEach(() => {
  for (const d of tmpDirs) {
    fs.rmSync(d, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

const EMPTY_ARTWORK: Record<ArtworkKind, string | null> = {
  poster: null,
  fanart: null,
  banner: null,
  clearlogo: null,
  clearart: null,
  disc: null,
  landscape: null,
  thumb: null,
};

function makeParsed(title: string, mediaKind: 'movie' | 'episode', seasonNumber: number | null = null, episodeNumber: number | null = null): ParsedFilenameInfo {
  return {
    cleanTitle: title,
    year: 2020,
    mediaKind,
    seasonNumber,
    episodeNumber,
    multiEpisodeEnd: null,
    resolution: '1080p',
    source: 'WEB-DL',
    videoCodec: 'H265',
    audioCodec: 'EAC3',
    audioChannels: 6,
    hdr: null,
    edition: null,
    releaseGroup: null,
  };
}

function makeMovie(overrides: Partial<MovieRecord> & { id: number; title: string }): MovieRecord {
  return {
    sourceId: 1,
    folderPath: `/media/${overrides.title}`,
    filePath: `/media/${overrides.title}.mkv`,
    fileName: `${overrides.title}.mkv`,
    fileSizeBytes: 1000,
    movieHash: null,
    nfoPath: `/media/${overrides.title}.nfo`,
    hasNfo: true,
    nfoValid: true,
    nfoWarnings: [],
    scraped: true,
    scrapedSource: 'tmdb',
    originalTitle: overrides.title,
    sortTitle: overrides.title,
    year: 2020,
    premiered: '2020-01-01',
    tagline: '',
    plot: '',
    outline: '',
    runtimeMinutes: 120,
    mpaa: 'PG-13',
    country: 'USA',
    studios: [],
    genres: [],
    tags: [],
    directors: [],
    writers: [],
    actors: [],
    trailerUrl: '',
    setId: null,
    setName: null,
    setOverview: null,
    uniqueIds: {},
    ratings: [{ source: 'tmdb', value: 7.5, max: 10, votes: 100, isDefault: true }],
    userRating: null,
    playCount: 0,
    watched: false,
    lastPlayed: null,
    dateAdded: '2026-01-01T00:00:00.000Z',
    artwork: { ...EMPTY_ARTWORK, poster: '/p.jpg', fanart: '/f.jpg' },
    streamDetails: { video: [], audio: [], subtitle: [] },
    subtitles: [
      {
        id: 1,
        mediaType: 'movie',
        mediaId: overrides.id,
        filePath: '/sub.srt',
        fileName: 'sub.srt',
        language: 'en',
        format: 'srt',
        forced: false,
        sdh: false,
        sizeBytes: 100,
      },
    ],
    parsedInfo: makeParsed(overrides.title, 'movie'),
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeShowNode(
  showOverrides: Partial<TvShowRecord> & { id: number; title: string },
  episodes: TvEpisodeRecord[] = [],
  seasons: TvSeasonRecord[] = []
): ShowTreeNode {
  const show: TvShowRecord = {
    sourceId: 2,
    folderPath: `/tv/${showOverrides.title}`,
    nfoPath: `/tv/${showOverrides.title}/tvshow.nfo`,
    hasNfo: true,
    nfoValid: true,
    nfoWarnings: [],
    scraped: true,
    scrapedSource: 'tmdb',
    originalTitle: showOverrides.title,
    sortTitle: showOverrides.title,
    year: 2020,
    premiered: '2020-01-01',
    status: 'Ended',
    plot: '',
    mpaa: 'TV-MA',
    studio: 'HBO',
    genres: [],
    tags: [],
    actors: [],
    episodeOrder: 'aired',
    uniqueIds: {},
    ratings: [{ source: 'tmdb', value: 8.0, max: 10, votes: 100, isDefault: true }],
    userRating: null,
    dateAdded: '2026-01-01T00:00:00.000Z',
    artwork: { ...EMPTY_ARTWORK, poster: '/p.jpg', fanart: '/f.jpg' },
    seasonsCount: seasons.length || 1,
    episodesCount: episodes.length,
    watchedEpisodesCount: episodes.filter((e) => e.watched).length,
    missingSubtitlesCount: episodes.filter((e) => e.subtitles.length === 0).length,
    missingNfoCount: episodes.filter((e) => !e.hasNfo).length,
    missingEpisodesCount: 0,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...showOverrides,
  };
  return { show, seasons, episodes };
}

function makeEp(overrides: Partial<TvEpisodeRecord> & { id: number; showId: number; seasonNumber: number; episodeNumber: number }): TvEpisodeRecord {
  return {
    folderPath: '/tv/Show/S01',
    filePath: `/tv/Show/S01/E${overrides.episodeNumber}.mkv`,
    fileName: `E${overrides.episodeNumber}.mkv`,
    fileSizeBytes: 500,
    movieHash: null,
    nfoPath: `/tv/Show/S01/E${overrides.episodeNumber}.nfo`,
    hasNfo: true,
    nfoValid: true,
    nfoWarnings: [],
    scraped: true,
    title: `Episode ${overrides.episodeNumber}`,
    showTitle: 'Show',
    aired: '2020-01-01',
    plot: '',
    runtimeMinutes: 45,
    directors: [],
    writers: [],
    actors: [],
    uniqueIds: {},
    ratings: [],
    userRating: null,
    playCount: 0,
    watched: false,
    lastPlayed: null,
    thumbPath: null,
    streamDetails: { video: [], audio: [], subtitle: [] },
    subtitles: [],
    parsedInfo: makeParsed('Show', 'episode', overrides.seasonNumber, overrides.episodeNumber),
    ...overrides,
  };
}

describe('TV Bulk Actions & Multi-Criteria Tree Sorting / Filtering', () => {
  it('supports POST /api/shows/batch for show/episode NFO writes, tagging, and watch toggles plus scoped batch scraping/subs', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-tvbulk-'));
    tmpDirs.push(tmp);

    const db = new MediaDatabase(path.join(tmp, 'tvbulk.db'));
    const sampleRoot = path.join(tmp, 'sample-library');
    await resetAndSeedSampleLibrary(db, sampleRoot);

    const app = createApiApp(db);

    const treeRes = await request(app).get('/api/shows/tree');
    expect(treeRes.status).toBe(200);
    const [showA, showB] = treeRes.body.tree as ShowTreeNode[];
    expect(showA.episodes.length).toBeGreaterThanOrEqual(2);
    expect(showB.episodes.length).toBeGreaterThanOrEqual(1);

    // 1. Add tag to showA directly
    const tagShowRes = await request(app)
      .post('/api/shows/batch')
      .send({ action: 'addTag', showIds: [showA.show.id], payload: { tag: 'MustWatch' } });
    expect(tagShowRes.status).toBe(200);
    expect(tagShowRes.body.affectedShows).toBe(1);

    const refreshedTree1 = await request(app).get('/api/shows/tree');
    const updatedA1 = refreshedTree1.body.tree.find((n: ShowTreeNode) => n.show.id === showA.show.id)!;
    expect(updatedA1.show.tags).toContain('MustWatch');
    expect(fs.readFileSync(updatedA1.show.nfoPath!, 'utf-8')).toContain('<tag>MustWatch</tag>');

    // 2. Add tag with only episodeIds -> resolves parent showB cleanly
    const tagEpRes = await request(app)
      .post('/api/shows/batch')
      .send({ action: 'addTag', episodeIds: [showB.episodes[0].id], payload: { tag: 'SciFiFavorites' } });
    expect(tagEpRes.status).toBe(200);
    expect(tagEpRes.body.affectedShows).toBe(1);
    const refreshedTree2 = await request(app).get('/api/shows/tree');
    const updatedB = refreshedTree2.body.tree.find((n: ShowTreeNode) => n.show.id === showB.show.id)!;
    expect(updatedB.show.tags).toContain('SciFiFavorites');

    // 3. Mark only episode[0] of showA watched (leaves episode[1] untouched)
    const targetEp = showA.episodes[0];
    const siblingEp = showA.episodes[1];
    await request(app)
      .post('/api/shows/batch')
      .send({ action: 'markUnwatched', episodeIds: [targetEp.id, siblingEp.id] });

    const watchEpRes = await request(app)
      .post('/api/shows/batch')
      .send({ action: 'markWatched', episodeIds: [targetEp.id] });
    expect(watchEpRes.status).toBe(200);
    expect(watchEpRes.body.affectedEpisodes).toBe(1);

    const refreshedTree3 = await request(app).get('/api/shows/tree');
    const updatedA3 = refreshedTree3.body.tree.find((n: ShowTreeNode) => n.show.id === showA.show.id)!;
    expect(updatedA3.episodes.find((e: TvEpisodeRecord) => e.id === targetEp.id)?.watched).toBe(true);
    expect(updatedA3.episodes.find((e: TvEpisodeRecord) => e.id === siblingEp.id)?.watched).toBe(false);
    expect(fs.readFileSync(updatedA3.episodes.find((e: TvEpisodeRecord) => e.id === targetEp.id)!.nfoPath!, 'utf-8')).toContain('<playcount>1</playcount>');

    // 4. Mark full showA watched + writeNfo
    const watchShowRes = await request(app)
      .post('/api/shows/batch')
      .send({ action: 'markWatched', showIds: [showA.show.id] });
    expect(watchShowRes.status).toBe(200);
    expect(watchShowRes.body.affectedShows).toBe(1);
    expect(watchShowRes.body.affectedEpisodes).toBe(showA.episodes.length);

    const nfoWriteRes = await request(app)
      .post('/api/shows/batch')
      .send({ action: 'writeNfo', showIds: [showA.show.id] });
    expect(nfoWriteRes.status).toBe(200);
    expect(nfoWriteRes.body.affectedShows).toBe(1);
    expect(nfoWriteRes.body.affectedEpisodes).toBe(showA.episodes.length);

    // 5. Scoped batch scrape on showIds does NOT scrape movies
    const scrapeShowsOnly = await request(app)
      .post('/api/scrapers/batch')
      .send({ showIds: [showA.show.id] });
    expect(scrapeShowsOnly.status).toBe(200);
    expect(scrapeShowsOnly.body.scrapedMovies).toBe(0);
    expect(scrapeShowsOnly.body.unmatchedMovies).toBe(0);
  }, 15_000);

  it('sorts Movies, TV Shows, and Sets across all 6 criteria and filters missing artwork / missing episodes / unwatched', () => {
    const mAlpha = makeMovie({
      id: 1,
      title: 'Alpha',
      year: 2010,
      runtimeMinutes: 95,
      ratings: [{ source: 'tmdb', value: 6.2, max: 10, votes: 10, isDefault: true }],
      dateAdded: '2026-01-01T00:00:00.000Z',
      scraped: false,
      hasNfo: false,
      artwork: { ...EMPTY_ARTWORK },
      subtitles: [],
    });
    const mBeta = makeMovie({
      id: 2,
      title: 'Beta',
      year: 2024,
      runtimeMinutes: 165,
      ratings: [{ source: 'tmdb', value: 9.1, max: 10, votes: 100, isDefault: true }],
      dateAdded: '2026-03-01T00:00:00.000Z',
      watched: true,
      parsedInfo: { ...makeParsed('Beta', 'movie'), resolution: '2160p' },
    });
    const mGamma = makeMovie({
      id: 3,
      title: 'Gamma',
      year: 2018,
      runtimeMinutes: 130,
      ratings: [{ source: 'tmdb', value: 7.8, max: 10, votes: 50, isDefault: true }],
      dateAdded: '2026-02-01T00:00:00.000Z',
      artwork: { ...EMPTY_ARTWORK, poster: '/p.jpg', fanart: null },
    });

    const movies = [mGamma, mAlpha, mBeta];
    expect(sortMovies(movies, 'title', 'asc').map((m) => m.title)).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(sortMovies(movies, 'title', 'desc').map((m) => m.title)).toEqual(['Gamma', 'Beta', 'Alpha']);
    expect(sortMovies(movies, 'year', 'desc').map((m) => m.title)).toEqual(['Beta', 'Gamma', 'Alpha']);
    expect(sortMovies(movies, 'rating', 'desc').map((m) => m.title)).toEqual(['Beta', 'Gamma', 'Alpha']);
    expect(sortMovies(movies, 'runtime', 'desc').map((m) => m.title)).toEqual(['Beta', 'Gamma', 'Alpha']);
    expect(sortMovies(movies, 'added', 'desc').map((m) => m.title)).toEqual(['Beta', 'Gamma', 'Alpha']);
    expect(sortMovies(movies, 'completeness', 'desc').map((m) => m.title)).toEqual(['Beta', 'Gamma', 'Alpha']);

    expect(movies.filter((m) => movieMatchesFilter(m, 'missing_art')).map((m) => m.title)).toEqual(['Gamma', 'Alpha']);
    expect(movies.filter((m) => movieMatchesFilter(m, '4k')).map((m) => m.title)).toEqual(['Beta']);
    expect(movies.filter((m) => movieMatchesFilter(m, 'unwatched')).map((m) => m.title)).toEqual(['Gamma', 'Alpha']);

    const ep1 = makeEp({ id: 10, showId: 10, seasonNumber: 1, episodeNumber: 1, runtimeMinutes: 60, watched: true });
    const ep2 = makeEp({ id: 11, showId: 10, seasonNumber: 1, episodeNumber: 2, runtimeMinutes: 55, watched: false });
    const sLow = makeShowNode(
      {
        id: 10,
        title: 'Zeta Show',
        year: 2015,
        ratings: [{ source: 'tmdb', value: 7.0, max: 10, votes: 10, isDefault: true }],
        dateAdded: '2026-01-01T00:00:00.000Z',
        missingEpisodesCount: 2,
        artwork: { ...EMPTY_ARTWORK, poster: '/p.jpg', fanart: null },
      },
      [ep1, ep2],
      [{ id: 1, showId: 10, seasonNumber: 1, name: 'Season 1', overview: '', folderPath: null, nfoPath: null, hasNfo: false, posterPath: null, bannerPath: null, episodesCount: 2 }]
    );
    const ep3 = makeEp({ id: 12, showId: 20, seasonNumber: 1, episodeNumber: 1, runtimeMinutes: 30, watched: true });
    const sHigh = makeShowNode(
      {
        id: 20,
        title: 'Apex Show',
        year: 2025,
        ratings: [{ source: 'tmdb', value: 9.4, max: 10, votes: 90, isDefault: true }],
        dateAdded: '2026-05-01T00:00:00.000Z',
      },
      [ep3],
      [{ id: 2, showId: 20, seasonNumber: 1, name: 'Season 1', overview: '', folderPath: null, nfoPath: null, hasNfo: false, posterPath: null, bannerPath: null, episodesCount: 1 }]
    );

    const shows = [sLow, sHigh];
    expect(sortShowTree(shows, 'title', 'asc').map((s) => s.show.title)).toEqual(['Apex Show', 'Zeta Show']);
    expect(sortShowTree(shows, 'year', 'desc').map((s) => s.show.title)).toEqual(['Apex Show', 'Zeta Show']);
    expect(sortShowTree(shows, 'rating', 'desc').map((s) => s.show.title)).toEqual(['Apex Show', 'Zeta Show']);
    expect(sortShowTree(shows, 'runtime', 'desc').map((s) => s.show.title)).toEqual(['Zeta Show', 'Apex Show']);
    expect(sortShowTree(shows, 'completeness', 'desc').map((s) => s.show.title)).toEqual(['Apex Show', 'Zeta Show']);

    expect(filterShowTreeNodes(shows, 'missing_art').map((s) => s.show.title)).toEqual(['Zeta Show']);
    expect(filterShowTreeNodes(shows, 'missing_eps').map((s) => s.show.title)).toEqual(['Zeta Show']);
    const unwatchedOnly = filterShowTreeNodes(shows, 'unwatched');
    expect(unwatchedOnly).toHaveLength(1);
    expect(unwatchedOnly[0].episodes.map((e) => e.id)).toEqual([11]);

    const sets: MovieSetRecord[] = [
      { id: 1, name: 'Set Alpha', overview: '', posterPath: null, fanartPath: null, clearlogoPath: null, movies: [mAlpha] },
      { id: 2, name: 'Set Beta', overview: '', posterPath: null, fanartPath: null, clearlogoPath: null, movies: [mBeta, mGamma] },
    ];
    expect(sortSets(sets, 'rating', 'desc').map((s) => s.name)).toEqual(['Set Beta', 'Set Alpha']);
    expect(sortSets(sets, 'runtime', 'asc').map((s) => s.name)).toEqual(['Set Alpha', 'Set Beta']);
  });
});
