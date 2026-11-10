import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApiApp } from '../src/server/app.js';
import { MediaDatabase } from '../src/server/db/database.js';
import { resetAndSeedSampleLibrary } from '../src/server/scanner/sampleGenerator.js';

const tmpDirs: string[] = [];

afterEach(() => {
  for (const d of tmpDirs) {
    fs.rmSync(d, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

describe('KodiVault Full API Integration', () => {
  it('supports scanning, multi-source scraping, NFO editing, subtitle downloading, renaming, and auditing', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-api-'));
    tmpDirs.push(tmp);

    const db = new MediaDatabase(path.join(tmp, 'api.db'));
    const sampleRoot = path.join(tmp, 'sample-library');
    await resetAndSeedSampleLibrary(db, sampleRoot);

    const app = createApiApp(db);

    // 1. Dashboard summary reflects seeded movies, shows, sets, and subtitles
    const dashRes = await request(app).get('/api/dashboard');
    expect(dashRes.status).toBe(200);
    expect(dashRes.body.counts.movies).toBeGreaterThanOrEqual(10);
    expect(dashRes.body.counts.shows).toBeGreaterThanOrEqual(3);
    expect(dashRes.body.counts.sets).toBeGreaterThanOrEqual(2);

    // 2. Find unscraped movie (Interstellar) and scrape via multi-source scraper
    const moviesRes = await request(app).get('/api/movies');
    const interstellar = moviesRes.body.movies.find((m: { title: string; scraped: boolean }) =>
      m.title.toLowerCase().includes('interstellar')
    );
    expect(interstellar).toBeTruthy();
    expect(interstellar.scraped).toBe(false);

    const searchRes = await request(app)
      .post('/api/scrapers/search')
      .send({ query: 'Interstellar', mediaKind: 'movie', year: 2014 });
    expect(searchRes.status).toBe(200);
    expect(searchRes.body.results.length).toBeGreaterThan(0);

    const best = searchRes.body.results[0];
    const bundleRes = await request(app)
      .post('/api/scrapers/bundle')
      .send({ externalId: best.externalId, provider: best.provider, mediaKind: 'movie' });
    expect(bundleRes.status).toBe(200);
    expect(bundleRes.body.bundle.ratings.length).toBeGreaterThanOrEqual(3);

    const applyRes = await request(app)
      .post(`/api/scrapers/apply/movie/${interstellar.id}`)
      .send({ bundle: bundleRes.body.bundle });
    expect(applyRes.status).toBe(200);
    expect(applyRes.body.movie.scraped).toBe(true);
    expect(applyRes.body.movie.hasNfo).toBe(true);
    expect(applyRes.body.movie.artwork.poster).toBeTruthy();
    expect(fs.existsSync(applyRes.body.movie.artwork.poster)).toBe(true);

    // 3. Read & validate generated NFO XML
    const nfoRead = await request(app).get(`/api/nfo/read?mediaType=movie&mediaId=${interstellar.id}`);
    expect(nfoRead.status).toBe(200);
    expect(nfoRead.body.validation.valid).toBe(true);
    expect(nfoRead.body.xml).toContain('<uniqueid type="imdb" default="true">tt0816692</uniqueid>');

    // 4. Search & download subtitle + shift timing
    const subSearch = await request(app)
      .post('/api/subtitles/search')
      .send({ mediaType: 'movie', mediaId: interstellar.id, languages: ['en'] });
    expect(subSearch.status).toBe(200);
    expect(subSearch.body.results.length).toBeGreaterThan(0);

    const subDl = await request(app)
      .post('/api/subtitles/download')
      .send({ mediaType: 'movie', mediaId: interstellar.id, candidate: subSearch.body.results[0] });
    expect(subDl.status).toBe(200);
    expect(fs.existsSync(subDl.body.subtitle.filePath)).toBe(true);

    const subShift = await request(app)
      .post(`/api/subtitles/${subDl.body.subtitle.id}/transform`)
      .send({ shiftMs: 500, forced: true });
    expect(subShift.status).toBe(200);
    expect(subShift.body.subtitle.forced).toBe(true);

    // 5. Dry-run preview & execute rename, then undo
    const renamePrev = await request(app)
      .post('/api/renamer/preview')
      .send({ movieIds: [interstellar.id] });
    expect(renamePrev.status).toBe(200);
    expect(renamePrev.body.items[0].hasChanges).toBe(true);

    const renameExec = await request(app)
      .post('/api/renamer/execute')
      .send({ items: renamePrev.body.items, cleanupEmptyFolders: true });
    expect(renameExec.status).toBe(200);
    expect(renameExec.body.movedCount).toBe(1);

    const undoRes = await request(app).post(`/api/renamer/undo/${renameExec.body.batchId}`);
    expect(undoRes.status).toBe(200);
    expect(undoRes.body.revertedFiles).toBeGreaterThan(0);

    // 6. Smart playlist export & audit report
    const xspRes = await request(app)
      .post('/api/export/smartplaylist')
      .send({ name: '4K Sci-Fi', type: 'movies', genre: 'Science Fiction', resolution: '2160p' });
    expect(xspRes.status).toBe(200);
    expect(xspRes.body.xml).toContain('<smartplaylist type="movies">');

    const auditRes = await request(app).get('/api/audit');
    expect(auditRes.status).toBe(200);
    expect(auditRes.body.summary.healthScore).toBeGreaterThan(0);
    if (auditRes.body.issues.missingEpisodeNfo.length > 0) {
      expect(auditRes.body.issues.missingEpisodeNfo[0].showId).toBeTypeOf('number');
    }

    // 7. Hierarchical TV shows tree (Show -> Seasons -> Episodes)
    const treeRes = await request(app).get('/api/shows/tree');
    expect(treeRes.status).toBe(200);
    expect(treeRes.body.tree.length).toBeGreaterThanOrEqual(3);
    expect(treeRes.body.tree[0].show.title).toBeTruthy();
    expect(treeRes.body.tree[0].seasons.length).toBeGreaterThan(0);
    expect(treeRes.body.tree[0].episodes.length).toBeGreaterThan(0);

    db.close();
  }, 20000);
});
