import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApiApp } from '../src/server/app.js';
import { MediaDatabase } from '../src/server/db/database.js';
import { toMovieListEntry, toSetMovieRef } from '../src/shared/movieListEntry.js';
import type { MovieRecord } from '../src/shared/types.js';

const tmpDirs: string[] = [];

afterEach(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
});

function freshDb(): MediaDatabase {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-cache-'));
  tmpDirs.push(dir);
  return new MediaDatabase(path.join(dir, 'test.db'));
}

const makeMovie = (over: Record<string, unknown> = {}): MovieRecord => ({
  id: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
  sourceId: 1,
  folderPath: '/tv/Movie (2020)',
  filePath: '/tv/Movie (2020)/movie.mkv',
  fileName: 'movie.mkv',
  fileSizeBytes: 1000,
  movieHash: 'hash',
  nfoPath: null,
  hasNfo: true,
  nfoValid: true,
  nfoWarnings: ['w1', 'w2'],
  scraped: true,
  scrapedSource: null,
  title: 'Movie',
  originalTitle: '',
  sortTitle: 'Movie',
  year: 2020,
  premiered: null,
  plot: 'Plot',
  tagline: '',
  runtimeMinutes: 120,
  mpaa: 'R',
  genres: ['Action'],
  studios: [],
  country: '',
  outline: '',
  trailerUrl: '',
  tags: ['tag'],
  directors: [],
  writers: [],
  actors: [{ name: 'Actor', role: 'Role', order: 0 }],
  uniqueIds: {},
  ratings: [{ source: 'imdb', value: 7, max: 10, votes: 1, isDefault: true }],
  userRating: null,
  playCount: 0,
  watched: false,
  lastPlayed: null,
  dateAdded: '2026-01-01T00:00:00.000Z',
  setId: null,
  setName: null,
  setOverview: null,
  artworkCandidates: {},
  artwork: { poster: '/p.jpg', fanart: '/f.jpg', banner: null, clearlogo: null, clearart: null, disc: null, landscape: null, thumb: null },
  streamDetails: {
    video: [{ codec: 'hevc', width: 3840, height: 2160, aspect: '16:9', durationSeconds: 7200 }],
    audio: [],
    subtitle: [],
  },
  parsedInfo: {
    cleanTitle: 'Movie', year: 2020, mediaKind: 'movie', seasonNumber: null, episodeNumber: null,
    multiEpisodeEnd: null, resolution: '2160p', source: null, videoCodec: 'x265', audioCodec: null,
    audioChannels: null, hdr: null, edition: null, releaseGroup: null,
  },
  subtitles: [],
  ...over,
});

describe('Movie list projection', () => {
  it('keeps the fields the sidebar renders and drops the heavy ones', () => {
    const entry = toMovieListEntry(makeMovie());
    expect(entry.title).toBe('Movie');
    expect(entry.poster).toBe('/p.jpg');
    expect(entry.fanart).toBe('/f.jpg');
    expect(entry.nfoWarningCount).toBe(2);
    expect(entry.subtitleCount).toBe(0);
    expect(entry.resolution).toBe('2160p');
    expect(entry.durationSeconds).toBe(7200);
    // Not carried: the detail panel refetches the full record.
    expect('streamDetails' in entry).toBe(false);
    expect('parsedInfo' in entry).toBe(false);
    expect('artwork' in entry).toBe(false);
    expect('filePath' in entry).toBe(false);
  });

  it('is substantially smaller than a full record', () => {
    const full = JSON.stringify(makeMovie());
    const slim = JSON.stringify(toMovieListEntry(makeMovie()));
    expect(slim.length).toBeLessThan(full.length * 0.5);
  });

  it('projects set members without the full record payload', () => {
    const ref = toSetMovieRef(makeMovie());
    expect(ref.poster).toBe('/p.jpg');
    expect('streamDetails' in ref).toBe(false);
    expect(JSON.stringify(ref).length).toBeLessThan(JSON.stringify(makeMovie()).length * 0.4);
  });
});

describe('Library API caching', () => {
  it('serves the slim list from /api/movies/list', async () => {
    const db = freshDb();
    const src = db.addSource({ name: 'S', path: '/tv', mediaKind: 'movie' });
    db.upsertMovie(makeMovie({ sourceId: src.id }));
    const res = await request(createApiApp(db)).get('/api/movies/list');
    expect(res.status).toBe(200);
    expect(res.body.movies).toHaveLength(1);
    expect(res.body.movies[0]).toHaveProperty('nfoWarningCount');
    expect(res.body.movies[0]).not.toHaveProperty('streamDetails');
  });

  it('sends an ETag and answers a matching If-None-Match with 304 and no body', async () => {
    const db = freshDb();
    const app = createApiApp(db);
    const first = await request(app).get('/api/movies/list');
    expect(first.headers.etag).toBeTruthy();
    expect(first.headers['cache-control']).toBe('no-cache');

    const revalidated = await request(app).get('/api/movies/list').set('If-None-Match', first.headers.etag);
    expect(revalidated.status).toBe(304);
    expect(revalidated.text ?? '').toBe('');
  });

  it('changes the ETag when the library changes', async () => {
    const db = freshDb();
    const src = db.addSource({ name: 'S', path: '/tv', mediaKind: 'movie' });
    const app = createApiApp(db);
    const before = await request(app).get('/api/movies/list');
    db.upsertMovie(makeMovie({ sourceId: src.id }));
    const after = await request(app).get('/api/movies/list');
    expect(after.headers.etag).not.toBe(before.headers.etag);
  });

  it('etags the shows tree and sets too', async () => {
    const db = freshDb();
    const app = createApiApp(db);
    for (const url of ['/api/shows/tree', '/api/sets', '/api/counts']) {
      const res = await request(app).get(url);
      expect(res.headers.etag, url).toBeTruthy();
    }
  });

  it('exposes cheap counts instead of requiring the full audit', async () => {
    const db = freshDb();
    const src = db.addSource({ name: 'S', path: '/tv', mediaKind: 'movie' });
    db.upsertMovie(makeMovie({ sourceId: src.id }));
    db.upsertMovie(makeMovie({ sourceId: src.id, filePath: '/tv/M2/m.mkv', title: 'Two', scraped: false }));
    const res = await request(createApiApp(db)).get('/api/counts');
    expect(res.status).toBe(200);
    expect(res.body.counts).toMatchObject({ movies: 2, unscrapedMovies: 1 });
  });

  it('keeps the full record endpoint for the detail panel', async () => {
    const db = freshDb();
    const src = db.addSource({ name: 'S', path: '/tv', mediaKind: 'movie' });
    const saved = db.upsertMovie(makeMovie({ sourceId: src.id }));
    const res = await request(createApiApp(db)).get(`/api/movies/${saved.id}`);
    expect(res.status).toBe(200);
    expect(res.body.movie).toHaveProperty('streamDetails');
    expect(res.body.movie).toHaveProperty('parsedInfo');
  });
});
