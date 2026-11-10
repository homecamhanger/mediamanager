import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApiApp } from '../src/server/app.js';
import { computeMissingEpisodesFromGuide, MediaDatabase } from '../src/server/db/database.js';
import { createMinimalValidMp4 } from '../src/server/scanner/mediaProbe.js';
import { resetAndSeedSampleLibrary } from '../src/server/scanner/sampleGenerator.js';

const tmpDirs: string[] = [];

afterEach(() => {
  for (const d of tmpDirs) {
    fs.rmSync(d, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

const SAMPLE_PNG_BASE64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAGklEQVR4nGP4z4AEGJG5TAyUABQ9hGJqAACy9QMBvY0HkgAAAABJRU5ErkJggg==';

describe('Section 1 Capabilities', () => {
  it('supports local artwork uploads (movie/season/episode/.actors) and subtitle uploads', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-sec1-uploads-'));
    tmpDirs.push(tmp);

    const db = new MediaDatabase(path.join(tmp, 'test.db'));
    const sampleRoot = path.join(tmp, 'sample-library');
    await resetAndSeedSampleLibrary(db, sampleRoot);
    const app = createApiApp(db);

    const moviesRes = await request(app).get('/api/movies');
    const movie = moviesRes.body.movies[0];

    // 1. Movie poster upload from base64 data URL
    const upPoster = await request(app)
      .post(`/api/movies/${movie.id}/artwork`)
      .send({ kind: 'poster', dataBase64: SAMPLE_PNG_BASE64 });
    expect(upPoster.status).toBe(200);
    expect(upPoster.body.movie.artwork.poster).toBeTruthy();
    expect(fs.existsSync(upPoster.body.movie.artwork.poster)).toBe(true);

    // 2. Season & Episode artwork upload
    const treeRes = await request(app).get('/api/shows/tree');
    const severanceNode = treeRes.body.tree.find((n: { show: { title: string } }) => n.show.title === 'Severance');
    expect(severanceNode).toBeTruthy();
    const season1 = severanceNode.seasons.find((s: { seasonNumber: number }) => s.seasonNumber === 1);
    const ep1 = severanceNode.episodes[0];

    const upSeason = await request(app)
      .post(`/api/seasons/${season1.id}/artwork`)
      .send({ kind: 'poster', dataBase64: SAMPLE_PNG_BASE64 });
    expect(upSeason.status).toBe(200);
    expect(upSeason.body.season.posterPath).toMatch(/season01-poster\.jpg$/);
    expect(fs.existsSync(upSeason.body.season.posterPath)).toBe(true);

    const upEp = await request(app)
      .post(`/api/episodes/${ep1.id}/artwork`)
      .send({ dataBase64: SAMPLE_PNG_BASE64 });
    expect(upEp.status).toBe(200);
    expect(upEp.body.episode.thumbPath).toMatch(/-thumb\.jpg$/);
    expect(fs.existsSync(upEp.body.episode.thumbPath)).toBe(true);

    // 3. .actors portrait upload & serving
    const upActor = await request(app).post('/api/actors/thumb').send({
      mediaType: 'movie',
      mediaId: movie.id,
      actorName: 'Ryan Gosling',
      dataBase64: SAMPLE_PNG_BASE64,
    });
    expect(upActor.status).toBe(200);
    expect(upActor.body.thumbPath).toContain(`${path.sep}.actors${path.sep}Ryan_Gosling.jpg`);
    expect(fs.existsSync(upActor.body.thumbPath)).toBe(true);

    const serveActor = await request(app)
      .get('/api/artwork/file')
      .query({ path: upActor.body.thumbPath });
    expect(serveActor.status).toBe(200);

    // 4. Local subtitle upload (.srt text) with auto-detected forced/lang flags
    const srtSample = '1\n00:00:01,000 --> 00:00:03,000\nUploaded local cue.\n';
    const upSub = await request(app).post('/api/subtitles/upload').send({
      mediaType: 'episode',
      mediaId: ep1.id,
      fileName: 'custom.es.forced.srt',
      contentText: srtSample,
    });
    expect(upSub.status).toBe(200);
    expect(upSub.body.subtitle.language).toBe('es');
    expect(upSub.body.subtitle.forced).toBe(true);
    expect(upSub.body.subtitle.cueCount).toBe(1);
    expect(fs.existsSync(upSub.body.subtitle.filePath)).toBe(true);
  });

  it('detects missing aired episodes accurately across guide, multi-episode, and custom display order', async () => {
    const missing = computeMissingEpisodesFromGuide(
      1,
      'Test Show',
      [
        { seasonNumber: 0, episodeNumber: 1, title: 'Special Pilot', aired: '2022-01-01', plot: '', runtimeMinutes: 30 },
        { seasonNumber: 1, episodeNumber: 1, title: 'Ep 1', aired: '2022-02-01', plot: '', runtimeMinutes: 45 },
        { seasonNumber: 1, episodeNumber: 2, title: 'Ep 2', aired: '2022-02-08', plot: '', runtimeMinutes: 45 },
        { seasonNumber: 1, episodeNumber: 3, title: 'Ep 3', aired: '2022-02-15', plot: '', runtimeMinutes: 45 },
        { seasonNumber: 1, episodeNumber: 4, title: 'Ep 4', aired: '2022-02-22', plot: '', runtimeMinutes: 45 },
        { seasonNumber: 2, episodeNumber: 1, title: 'Unaired Future', aired: '2099-05-01', plot: '', runtimeMinutes: 45 },
      ],
      [
        // Multi-episode file covers S01E01 and S01E02
        { seasonNumber: 1, episodeNumber: 1, multiEpisodeEnd: 2 },
        // Custom display mapping maps file S01E99 -> S01E04
        { seasonNumber: 1, episodeNumber: 99, displaySeason: 1, displayEpisode: 4 },
      ],
      [{ id: 1, showId: 1, seasonNumber: 1, name: 'Season 1', overview: '', folderPath: null, nfoPath: null, hasNfo: false, posterPath: null, bannerPath: null, episodesCount: 2 }],
      '2026-11-10'
    );

    expect(missing.map((m) => m.code)).toEqual(['S01E03']);

    // Verify full sample integration for Severance missing episodes
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-sec1-missing-'));
    tmpDirs.push(tmp);
    const db = new MediaDatabase(path.join(tmp, 'test.db'));
    await resetAndSeedSampleLibrary(db, path.join(tmp, 'sample-library'));
    const app = createApiApp(db);

    const treeRes = await request(app).get('/api/shows/tree');
    const sevNode = treeRes.body.tree.find((n: { show: { title: string } }) => n.show.title === 'Severance');
    expect(sevNode.missingEpisodes.map((m: { code: string }) => m.code)).toEqual([
      'S01E04',
      'S01E05',
      'S01E06',
      'S01E07',
      'S01E08',
      'S02E02',
    ]);

    const showDetailRes = await request(app).get(`/api/shows/${sevNode.show.id}`);
    expect(showDetailRes.status).toBe(200);
    expect(showDetailRes.body.missingEpisodes.length).toBe(6);

    const auditRes = await request(app).get('/api/audit');
    expect(auditRes.status).toBe(200);
    expect(auditRes.body.issues.missingEpisodes.length).toBeGreaterThanOrEqual(6);
  });

  it('supports inline editable cast, genres, tags, duplicate edition tagging, and safe deletion', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-sec1-dup-'));
    tmpDirs.push(tmp);

    const moviesRoot = path.join(tmp, 'movies');
    const dir1 = path.join(moviesRoot, 'Blade Runner (1982)');
    const dir2 = path.join(moviesRoot, 'Blade Runner (1982) - Alt');
    fs.mkdirSync(dir1, { recursive: true });
    fs.mkdirSync(dir2, { recursive: true });
    const file1 = path.join(dir1, 'Blade Runner (1982) [1080p].mp4');
    const file2 = path.join(dir2, 'Blade Runner (1982) [2160p].mp4');
    fs.writeFileSync(file1, createMinimalValidMp4({ width: 1920, height: 1080, durationSeconds: 120 }));
    fs.writeFileSync(file2, createMinimalValidMp4({ width: 3840, height: 2160, durationSeconds: 120 }));

    const db = new MediaDatabase(path.join(tmp, 'test.db'));
    const app = createApiApp(db);

    const srcRes = await request(app)
      .post('/api/settings/sources')
      .send({ name: 'Test Movies', path: moviesRoot, mediaKind: 'movie', scanNow: true });
    expect(srcRes.status).toBe(200);

    const listRes = await request(app).get('/api/movies');
    const [m1, m2] = listRes.body.movies;

    // Update cast/genres/tags inline and write NFO
    const patchRes = await request(app)
      .patch(`/api/movies/${m1.id}`)
      .send({
        genres: ['Science Fiction', 'Neo-Noir'],
        tags: ['cult classic', 'cyberpunk'],
        actors: [
          { name: 'Harrison Ford', role: 'Rick Deckard', order: 0 },
          { name: 'Rutger Hauer', role: 'Roy Batty', order: 1 },
        ],
        uniqueIds: { imdb: 'tt0083658' },
        writeNfo: true,
      });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.movie.genres).toEqual(['Science Fiction', 'Neo-Noir']);
    expect(patchRes.body.movie.actors[1].name).toBe('Rutger Hauer');

    const nfoRes = await request(app).get('/api/nfo/read').query({ mediaType: 'movie', mediaId: m1.id });
    expect(nfoRes.body.xml).toContain('<genre>Neo-Noir</genre>');
    expect(nfoRes.body.xml).toContain('<tag>cyberpunk</tag>');
    expect(nfoRes.body.xml).toContain('<name>Rutger Hauer</name>');

    // Give m2 same IMDb ID -> triggers duplicateMovies
    await request(app).patch(`/api/movies/${m2.id}`).send({ uniqueIds: { imdb: 'tt0083658' }, writeNfo: true });
    const auditBefore = await request(app).get('/api/audit');
    expect(auditBefore.body.issues.duplicateMovies.length).toBe(1);

    // Tag m2 as Final Cut -> resolves duplicate collision cleanly!
    const edRes = await request(app).post(`/api/movies/${m2.id}/edition`).send({ edition: 'The Final Cut' });
    expect(edRes.status).toBe(200);
    const auditAfterEdition = await request(app).get('/api/audit');
    expect(auditAfterEdition.body.issues.duplicateMovies.length).toBe(0);

    // Delete m1 DB-only keeps file on disk; delete m2 with deleteFiles=true deletes file + NFO from disk
    const delDbRes = await request(app).delete(`/api/movies/${m1.id}?deleteFiles=false`);
    expect(delDbRes.status).toBe(200);
    expect(fs.existsSync(file1)).toBe(true);

    const nfo2 = path.join(dir2, 'movie.nfo');
    expect(fs.existsSync(nfo2)).toBe(true);
    const delDiskRes = await request(app).delete(`/api/movies/${m2.id}?deleteFiles=true`);
    expect(delDiskRes.status).toBe(200);
    expect(delDiskRes.body.deletedFiles).toBe(true);
    expect(fs.existsSync(file2)).toBe(false);
    expect(fs.existsSync(nfo2)).toBe(false);
  });

  it('tracks background batch jobs and supports cancellation', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-sec1-jobs-'));
    tmpDirs.push(tmp);
    const db = new MediaDatabase(path.join(tmp, 'test.db'));
    await resetAndSeedSampleLibrary(db, path.join(tmp, 'sample-library'));
    const app = createApiApp(db);

    // Start NFO sync job and wait for completion
    const startNfo = await request(app).post('/api/jobs/nfo').send({ scope: 'all' });
    expect(startNfo.status).toBe(200);
    const nfoJobId = startNfo.body.job.jobId;
    expect(startNfo.body.job.totalCount).toBeGreaterThan(5);

    // Cancel immediately on a new batch scrape ('all') job to verify cancellation
    const startScrape = await request(app).post('/api/jobs/scrape').send({ scope: 'all' });
    expect(startScrape.status).toBe(200);
    const scrapeJobId = startScrape.body.job.jobId;

    const cancelRes = await request(app).post(`/api/jobs/${scrapeJobId}/cancel`);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.job.cancelRequested).toBe(true);

    // Poll until both settle
    let finalNfo = startNfo.body.job;
    let finalScrape = cancelRes.body.job;
    for (let i = 0; i < 60; i++) {
      const list = await request(app).get('/api/jobs');
      finalNfo = list.body.jobs.find((j: { jobId: string }) => j.jobId === nfoJobId) ?? finalNfo;
      finalScrape = list.body.jobs.find((j: { jobId: string }) => j.jobId === scrapeJobId) ?? finalScrape;
      if (finalNfo.status !== 'running' && finalScrape.status !== 'running') break;
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(finalNfo.status).toBe('completed');
    expect(finalNfo.succeededCount).toBeGreaterThan(5);
    expect(['cancelled', 'completed']).toContain(finalScrape.status);
    if (finalScrape.status === 'cancelled') {
      expect(finalScrape.processedCount).toBeLessThanOrEqual(finalScrape.totalCount);
    }
  });

  it('returns scraped artwork candidates for movies, shows, seasons, and episodes and applies alt variants', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-sec1-artpick-'));
    tmpDirs.push(tmp);
    const db = new MediaDatabase(path.join(tmp, 'test.db'));
    await resetAndSeedSampleLibrary(db, path.join(tmp, 'sample-library'));
    const app = createApiApp(db);

    const moviesRes = await request(app).get('/api/movies');
    const movie = moviesRes.body.movies[0];
    expect(movie).toBeDefined();

    const movieCandRes = await request(app).get(
      `/api/artwork/candidates?mediaType=movie&mediaId=${movie.id}&kind=poster`
    );
    expect(movieCandRes.status).toBe(200);
    expect(movieCandRes.body.candidates.length).toBeGreaterThanOrEqual(2);
    const primaryCandidate = movieCandRes.body.candidates.find((c: { url: string }) => !c.url.includes('variant=alt'));
    const altCandidate = movieCandRes.body.candidates.find((c: { url: string }) => c.url.includes('variant=alt'));
    expect(primaryCandidate).toBeDefined();
    expect(altCandidate).toBeDefined();

    const applyPrimary = await request(app)
      .post(`/api/movies/${movie.id}/artwork`)
      .send({ kind: 'poster', url: primaryCandidate.url });
    expect(applyPrimary.status).toBe(200);
    const primaryBytes = fs.readFileSync(applyPrimary.body.movie.artwork.poster);

    const applyMovieArt = await request(app)
      .post(`/api/movies/${movie.id}/artwork`)
      .send({ kind: 'poster', url: altCandidate.url });
    expect(applyMovieArt.status).toBe(200);
    expect(fs.existsSync(applyMovieArt.body.movie.artwork.poster)).toBe(true);
    const altBytes = fs.readFileSync(applyMovieArt.body.movie.artwork.poster);
    expect(Buffer.compare(primaryBytes, altBytes)).not.toBe(0);

    const showsRes = await request(app).get('/api/shows');
    const show = showsRes.body.shows[0];
    expect(show).toBeDefined();

    const showDetail = await request(app).get(`/api/shows/${show.id}`);
    const season = showDetail.body.seasons[0];
    const episode = showDetail.body.episodes[0];

    const showCandRes = await request(app).get(
      `/api/artwork/candidates?mediaType=tvshow&mediaId=${show.id}&kind=fanart`
    );
    expect(showCandRes.status).toBe(200);
    expect(showCandRes.body.candidates.length).toBeGreaterThanOrEqual(2);

    // Ensure TV show persisted artworkCandidates in DB
    const refreshedShow = await request(app).get(`/api/shows/${show.id}`);
    expect(refreshedShow.body.show.artworkCandidates?.fanart?.length).toBeGreaterThanOrEqual(1);

    const seasonCandRes = await request(app).get(
      `/api/artwork/candidates?mediaType=season&mediaId=${season.id}&kind=poster`
    );
    expect(seasonCandRes.status).toBe(200);
    expect(seasonCandRes.body.candidates.length).toBeGreaterThanOrEqual(2);

    const epCandRes = await request(app).get(
      `/api/artwork/candidates?mediaType=episode&mediaId=${episode.id}&kind=thumb`
    );
    expect(epCandRes.status).toBe(200);
    expect(epCandRes.body.candidates.length).toBeGreaterThanOrEqual(2);
  });
});
