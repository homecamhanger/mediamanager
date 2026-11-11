import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApiApp } from '../src/server/app.js';
import { MediaDatabase } from '../src/server/db/database.js';
import { createMinimalValidMp4 } from '../src/server/scanner/mediaProbe.js';

const tmpDirs: string[] = [];

afterEach(() => {
  for (const d of tmpDirs) {
    fs.rmSync(d, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

describe('Per-Episode Scraping & Multi-Episode NFO Support', () => {
  it('scans, previews, applies multi-episode scraping, syncs NFO edits, updates missing episodes, and scrapes scoped episodeIds', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-ep-scrape-'));
    tmpDirs.push(tmp);

    const tvRoot = path.join(tmp, 'TV Shows');
    const andorS1 = path.join(tvRoot, 'Andor (2022)', 'Season 01');
    fs.mkdirSync(andorS1, { recursive: true });

    // Multi-episode 3-part file (S01E01-E03) + separate single episode (S01E06)
    fs.writeFileSync(
      path.join(andorS1, 'Andor.S01E01-E03.1080p.WEB-DL.mp4'),
      createMinimalValidMp4({ width: 1920, height: 1080, durationSeconds: 7200 })
    );
    fs.writeFileSync(
      path.join(andorS1, 'Andor.S01E06.1080p.WEB-DL.mp4'),
      createMinimalValidMp4({ width: 1920, height: 1080, durationSeconds: 3200 })
    );

    const db = new MediaDatabase(path.join(tmp, 'test.db'));
    const app = createApiApp(db);

    const addSrcRes = await request(app)
      .post('/api/settings/sources')
      .send({ name: 'TV Library', path: tvRoot, mediaKind: 'tvshow', scanNow: true, asyncScan: false })
      .expect(200);
    expect(addSrcRes.body.scanResult.episodesScanned).toBe(2);

    const treeRes = await request(app).get('/api/shows/tree').expect(200);
    const andorShow = treeRes.body.tree[0].show;
    const episodes = treeRes.body.tree[0].episodes;
    expect(episodes).toHaveLength(2);

    const multiEp = episodes.find((e: { episodeNumber: number }) => e.episodeNumber === 1);
    const epSix = episodes.find((e: { episodeNumber: number }) => e.episodeNumber === 6);
    expect(multiEp.multiEpisodeEnd).toBe(3);
    expect(epSix.scraped).toBe(false);

    // 1. Preview multi-episode scrape (returns 3 distinct parts for S01E01, S01E02, S01E03)
    const previewRes = await request(app)
      .post(`/api/scrapers/episode/${multiEp.id}/preview`)
      .send({})
      .expect(200);
    expect(previewRes.body.preview.matched).toBe(true);
    expect(previewRes.body.preview.parts).toHaveLength(3);
    expect(previewRes.body.preview.parts[0].title).toBe('Kassa');
    expect(previewRes.body.preview.parts[1].title).toBe('That Would Be Me');
    expect(previewRes.body.preview.parts[2].title).toBe('Reckoning');

    // 2. Apply multi-episode scrape -> persists multiEpisodeParts & writes 3-block Kodi NFO + thumb
    const applyRes = await request(app)
      .post(`/api/scrapers/episode/${multiEp.id}/apply`)
      .send({
        parts: previewRes.body.preview.parts,
        showUniqueIds: previewRes.body.preview.showUniqueIds,
        seasonNumber: 1,
        episodeNumber: 1,
        multiEpisodeEnd: 3,
        writeNfo: true,
      })
      .expect(200);

    expect(applyRes.body.episode.scraped).toBe(true);
    expect(applyRes.body.episode.title).toBe('Kassa');
    expect(applyRes.body.episode.multiEpisodeParts).toHaveLength(2);
    expect(applyRes.body.episode.multiEpisodeParts[0].title).toBe('That Would Be Me');
    expect(applyRes.body.episode.multiEpisodeParts[1].title).toBe('Reckoning');
    expect(applyRes.body.episode.hasNfo).toBe(true);
    expect(fs.existsSync(applyRes.body.episode.thumbPath)).toBe(true);

    const writtenXml = fs.readFileSync(applyRes.body.episode.nfoPath, 'utf-8');
    expect((writtenXml.match(/<episodedetails>/g) ?? []).length).toBe(3);
    expect(writtenXml).toContain('<title>Kassa</title>');
    expect(writtenXml).toContain('<title>That Would Be Me</title>');
    expect(writtenXml).toContain('<title>Reckoning</title>');

    // Parent show episode 6 should still be unscraped!
    const epSixCheck = db.getTvEpisode(epSix.id)!;
    expect(epSixCheck.scraped).toBe(false);

    // 3. Edit Part 2 directly via PUT /api/nfo/save and verify DB syncs all parts
    const editedXml = writtenXml.replace('<title>That Would Be Me</title>', '<title>That Would Be Me (Edited)</title>');
    const saveNfoRes = await request(app)
      .put('/api/nfo/save')
      .send({ mediaType: 'episode', mediaId: multiEp.id, xml: editedXml })
      .expect(200);
    expect(saveNfoRes.body.episode.multiEpisodeParts[0].title).toBe('That Would Be Me (Edited)');

    // 4. Scoped batch scrape with episodeIds only scrapes epSix (and marks it scraped with "The Eye")
    const batchEpRes = await request(app)
      .post('/api/scrapers/batch')
      .send({ episodeIds: [epSix.id] })
      .expect(200);
    expect(batchEpRes.body.scrapedEpisodes).toBe(1);
    expect(batchEpRes.body.scrapedShows).toBe(0);

    const epSixAfter = db.getTvEpisode(epSix.id)!;
    expect(epSixAfter.scraped).toBe(true);
    expect(epSixAfter.title).toBe('The Eye');

    // 5. Missing episode calculation respects all 3 parts inside S01E01-E03 + S01E06
    const showAfter = db.getTvShow(andorShow.id)!;
    db.updateTvShow(showAfter.id, {
      episodeGuide: [
        { seasonNumber: 1, episodeNumber: 1, title: 'Kassa', aired: '2022-09-21', plot: '', runtimeMinutes: 42 },
        { seasonNumber: 1, episodeNumber: 2, title: 'That Would Be Me', aired: '2022-09-21', plot: '', runtimeMinutes: 37 },
        { seasonNumber: 1, episodeNumber: 3, title: 'Reckoning', aired: '2022-09-21', plot: '', runtimeMinutes: 41 },
        { seasonNumber: 1, episodeNumber: 6, title: 'The Eye', aired: '2022-10-12', plot: '', runtimeMinutes: 54 },
        { seasonNumber: 1, episodeNumber: 10, title: 'One Way Out', aired: '2022-11-09', plot: '', runtimeMinutes: 48 },
      ],
    });
    const showDetail = await request(app).get(`/api/shows/${andorShow.id}`).expect(200);
    expect(showDetail.body.missingEpisodes.map((m: { code: string }) => m.code)).toEqual(['S01E10']);

    db.close();
  }, 15_000);
});
