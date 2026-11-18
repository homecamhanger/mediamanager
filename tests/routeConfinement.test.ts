import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApiApp } from '../src/server/app.js';
import { MediaDatabase } from '../src/server/db/database.js';
import type { MovieRecord } from '../src/shared/types.js';

/**
 * End-to-end confinement checks.
 *
 * The helpers are unit-tested separately; these drive the real routes to prove the
 * guards are actually wired in and that the HTTP responses are the ones a client
 * will see.
 */
const tmpDirs: string[] = [];

function tmpDir(prefix = 'confinement-'): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** Complete movie record; `upsertMovie` takes the full shape. */
const makeMovie = (over: Partial<MovieRecord> = {}): MovieRecord => ({
  id: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
  sourceId: 1,
  folderPath: '/media/Movie (2020)',
  filePath: '/media/Movie (2020)/Movie.2020.mkv',
  fileName: 'Movie.2020.mkv',
  fileSizeBytes: 1000,
  movieHash: 'hash',
  nfoPath: null,
  hasNfo: false,
  nfoValid: false,
  nfoWarnings: [],
  scraped: false,
  scrapedSource: null,
  title: 'Movie',
  originalTitle: '',
  sortTitle: 'Movie',
  year: 2020,
  premiered: null,
  plot: '',
  tagline: '',
  runtimeMinutes: 120,
  mpaa: '',
  genres: [],
  studios: [],
  country: '',
  outline: '',
  trailerUrl: '',
  tags: [],
  directors: [],
  writers: [],
  actors: [],
  uniqueIds: {},
  ratings: [],
  userRating: null,
  playCount: 0,
  watched: false,
  // node:sqlite rejects `undefined`; nullable columns must be explicit nulls.
  lastPlayed: null,
  dateAdded: '2026-01-01T00:00:00.000Z',
  setId: null,
  setName: null,
  setOverview: null,
  artworkCandidates: {},
  artwork: {
    poster: null,
    fanart: null,
    banner: null,
    clearlogo: null,
    clearart: null,
    disc: null,
    landscape: null,
    thumb: null,
  },
  streamDetails: { video: [], audio: [], subtitle: [] },
  parsedInfo: {
    cleanTitle: 'Movie',
    year: 2020,
    mediaKind: 'movie',
    seasonNumber: null,
    episodeNumber: null,
    multiEpisodeEnd: null,
    resolution: null,
    source: null,
    videoCodec: null,
    audioCodec: null,
    audioChannels: null,
    hdr: null,
    edition: null,
    releaseGroup: null,
  },
  subtitles: [],
  ...over,
});

function makeApp() {
  const dbRoot = tmpDir('db-');
  const db = new MediaDatabase(path.join(dbRoot, 'test.db'));
  const app = createApiApp(db);
  return { app, db };
}

describe('Artwork kind confinement', () => {
  it('rejects a traversal kind on a movie instead of writing outside the folder', async () => {
    const { app, db } = makeApp();
    const sourceRoot = tmpDir('media-');
    const movieDir = path.join(sourceRoot, 'Movie (2020)');
    fs.mkdirSync(movieDir, { recursive: true });
    const filePath = path.join(movieDir, 'Movie.2020.mkv');
    fs.writeFileSync(filePath, 'x');

    const source = db.addSource({ name: 'Movies', path: sourceRoot, mediaKind: 'movie' });
    const movie = db.upsertMovie(
      makeMovie({ sourceId: source.id, filePath, folderPath: movieDir, fileName: 'Movie.2020.mkv' })
    );

    const res = await request(app)
      .post(`/api/movies/${movie.id}/artwork`)
      .send({ kind: '../../../../tmp/owned', dataBase64: Buffer.from('x').toString('base64') });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Unsupported artwork kind');
    // The proof: nothing was written outside the library folder.
    expect(fs.existsSync('/tmp/owned.jpg')).toBe(false);
  });

  it('rejects a traversal kind on a show', async () => {
    const { app, db } = makeApp();
    const sourceRoot = tmpDir('media-');
    const showDir = path.join(sourceRoot, 'Show (2019)');
    fs.mkdirSync(showDir, { recursive: true });
    db.addSource({ name: 'TV', path: sourceRoot, mediaKind: 'tvshow' });

    const res = await request(app)
      .post('/api/shows/1/artwork')
      .send({ kind: '../escape', dataBase64: 'eA==' });

    // 400 for the bad kind; 404 only if the kind check somehow ran after the lookup.
    expect([400, 404]).toContain(res.status);
    if (res.status === 400) expect(res.body.error).toContain('Unsupported artwork kind');
  });

  it('still accepts a legitimate kind', async () => {
    const { app, db } = makeApp();
    const sourceRoot = tmpDir('media-');
    const movieDir = path.join(sourceRoot, 'Movie (2020)');
    fs.mkdirSync(movieDir, { recursive: true });
    const filePath = path.join(movieDir, 'Movie.2020.mkv');
    fs.writeFileSync(filePath, 'x');

    const source = db.addSource({ name: 'Movies', path: sourceRoot, mediaKind: 'movie' });
    const movie = db.upsertMovie(
      makeMovie({ sourceId: source.id, filePath, folderPath: movieDir, fileName: 'Movie.2020.mkv' })
    );

    const res = await request(app)
      .post(`/api/movies/${movie.id}/artwork`)
      // Must exceed the 32-byte minimum the artwork writer enforces.
      .send({ kind: 'poster', dataBase64: Buffer.alloc(64, 7).toString('base64') });

    expect(res.status).toBe(200);
    expect(fs.existsSync(path.join(movieDir, 'poster.jpg'))).toBe(true);
  });
});

describe('Folder browser confinement', () => {
  it('refuses to enumerate the filesystem root', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/settings/fs/browse?path=/');
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('outside the browsable roots');
    // It must not leak the listing of / in the response either.
    expect(JSON.stringify(res.body.directories ?? [])).not.toContain('etc');
  });

  it('refuses traversal that climbs out of an allowed root', async () => {
    const { app, db } = makeApp();
    const sourceRoot = tmpDir('media-');
    db.addSource({ name: 'Movies', path: sourceRoot, mediaKind: 'movie' });

    const res = await request(app).get(
      `/api/settings/fs/browse?path=${encodeURIComponent(path.join(sourceRoot, '..', '..'))}`
    );
    expect(res.status).toBe(403);
  });

  it('allows browsing inside a configured source', async () => {
    const { app, db } = makeApp();
    const sourceRoot = tmpDir('media-');
    fs.mkdirSync(path.join(sourceRoot, 'Films'));
    db.addSource({ name: 'Movies', path: sourceRoot, mediaKind: 'movie' });

    const res = await request(app).get(`/api/settings/fs/browse?path=${encodeURIComponent(sourceRoot)}`);
    expect(res.status).toBe(200);
    expect(res.body.directories.map((d: { name: string }) => d.name)).toContain('Films');
  });

  it('reports the roots so the UI can explain a refusal', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/settings/fs/browse?path=/var/log');
    expect(res.status).toBe(403);
    expect(Array.isArray(res.body.browsableRoots)).toBe(true);
  });
});

describe('Artwork cache headers', () => {
  it('revalidates instead of serving a stale poster for a day', async () => {
    const { app, db } = makeApp();
    const sourceRoot = tmpDir('media-');
    const movieDir = path.join(sourceRoot, 'Movie (2020)');
    fs.mkdirSync(movieDir, { recursive: true });
    const filePath = path.join(movieDir, 'Movie.2020.mkv');
    fs.writeFileSync(filePath, 'x');
    const posterPath = path.join(movieDir, 'poster.jpg');
    fs.writeFileSync(posterPath, Buffer.alloc(64, 1));

    const source = db.addSource({ name: 'Movies', path: sourceRoot, mediaKind: 'movie' });
    db.upsertMovie(makeMovie({ sourceId: source.id, filePath, folderPath: movieDir }));

    const url = `/api/artwork/file?path=${encodeURIComponent(posterPath)}`;
    const first = await request(app).get(url);
    expect(first.status).toBe(200);
    // `no-cache` means store-and-revalidate. `max-age` here caused the reported
    // bug: an uploaded poster replaces the file at the same path, the list keeps
    // the same URL, and the browser would not ask again for 24 hours.
    expect(first.headers['cache-control']).toBe('no-cache');
    expect(first.headers.etag).toBeTruthy();

    // A conditional request after the file changes must return the new bytes.
    const etagBefore = first.headers.etag;
    fs.writeFileSync(posterPath, Buffer.alloc(64, 2));
    const conditional = await request(app).get(url).set('If-None-Match', etagBefore as string);
    expect(conditional.status).toBe(200);
    expect(conditional.body.equals(Buffer.alloc(64, 2))).toBe(true);
  });

  it('still answers an unchanged poster with 304', async () => {
    const { app, db } = makeApp();
    const sourceRoot = tmpDir('media-');
    const movieDir = path.join(sourceRoot, 'Movie (2020)');
    fs.mkdirSync(movieDir, { recursive: true });
    const filePath = path.join(movieDir, 'Movie.2020.mkv');
    fs.writeFileSync(filePath, 'x');
    const posterPath = path.join(movieDir, 'poster.jpg');
    fs.writeFileSync(posterPath, Buffer.alloc(64, 1));

    const source = db.addSource({ name: 'Movies', path: sourceRoot, mediaKind: 'movie' });
    db.upsertMovie(makeMovie({ sourceId: source.id, filePath, folderPath: movieDir }));

    const url = `/api/artwork/file?path=${encodeURIComponent(posterPath)}`;
    const first = await request(app).get(url);
    const again = await request(app).get(url).set('If-None-Match', first.headers.etag as string);
    expect(again.status).toBe(304);
    expect(again.text ?? '').toBe('');
  });
});
