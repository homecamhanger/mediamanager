import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApiApp } from '../src/server/app.js';
import { MediaDatabase } from '../src/server/db/database.js';
import { parseEpisodeNfoXml } from '../src/server/nfo/kodiNfo.js';
import { resetAndSeedSampleLibrary } from '../src/server/scanner/sampleGenerator.js';

const tmpDirs: string[] = [];

afterEach(() => {
  for (const d of tmpDirs) {
    fs.rmSync(d, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

describe('TV Episode Custom Ordering via Kodi NFO', () => {
  it('reorders episodes via <displayseason>/<displayepisode>, syncs raw NFO edits, and resets to file order', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-order-'));
    tmpDirs.push(tmp);

    const db = new MediaDatabase(path.join(tmp, 'order.db'));
    const sampleRoot = path.join(tmp, 'sample-library');
    await resetAndSeedSampleLibrary(db, sampleRoot);
    const app = createApiApp(db);

    const treeRes = await request(app).get('/api/shows/tree');
    expect(treeRes.status).toBe(200);
    const showNode = treeRes.body.tree.find((n: { episodes: unknown[] }) => n.episodes.length >= 2);
    expect(showNode).toBeTruthy();

    const showId = showNode.show.id;
    const s1Eps = showNode.episodes.filter((e: { seasonNumber: number }) => e.seasonNumber === 1);
    expect(s1Eps.length).toBeGreaterThanOrEqual(2);

    const reversed = [...s1Eps].reverse();
    const displayRes = await request(app)
      .post(`/api/shows/${showId}/episode-order`)
      .send({
        mode: 'display',
        items: reversed.map((ep: { id: number }, idx: number) => ({
          episodeId: ep.id,
          targetSeason: 1,
          targetEpisode: idx + 1,
        })),
      });

    expect(displayRes.status).toBe(200);
    expect(displayRes.body.updatedCount).toBe(reversed.length);
    // DB + API should return the custom display order immediately
    const returnedS1 = displayRes.body.episodes.filter(
      (e: { seasonNumber: number; displaySeason?: number | null }) => (e.displaySeason ?? e.seasonNumber) === 1
    );
    expect(returnedS1[0].id).toBe(reversed[0].id);
    expect(returnedS1[0].displaySeason).toBe(1);
    expect(returnedS1[0].displayEpisode).toBe(1);
    // Original canonical episodeNumber stays untouched in display mode
    expect(returnedS1[0].episodeNumber).toBe(reversed[0].episodeNumber);

    // Verify NFO on disk contains both canonical <episode> and custom <displayseason>/<displayepisode>
    const nfoContent = fs.readFileSync(returnedS1[0].nfoPath, 'utf-8');
    expect(nfoContent).toContain('<displayseason>1</displayseason>');
    expect(nfoContent).toContain('<displayepisode>1</displayepisode>');
    const parsedNfo = parseEpisodeNfoXml(nfoContent)[0];
    expect(parsedNfo.displaySeason).toBe(1);
    expect(parsedNfo.displayEpisode).toBe(1);
    expect(parsedNfo.episodeNumber).toBe(reversed[0].episodeNumber);

    // Raw NFO save should immediately sync <displayepisode> back into DB ordering
    const targetEp = returnedS1[returnedS1.length - 1];
    const targetNfoXml = fs.readFileSync(targetEp.nfoPath, 'utf-8').replace(
      `<displayepisode>${targetEp.displayEpisode}</displayepisode>`,
      '<displayepisode>0</displayepisode>'
    );
    const saveRes = await request(app)
      .put('/api/nfo/save')
      .send({ mediaType: 'episode', mediaId: targetEp.id, xml: targetNfoXml });
    expect(saveRes.status).toBe(200);
    expect(saveRes.body.episode.displayEpisode).toBe(0);

    const afterRawSave = await request(app).get(`/api/shows/${showId}`);
    expect(afterRawSave.body.episodes[0].id).toBe(targetEp.id);

    // Reset back to filename order clears displaySeason/displayEpisode from DB and NFO
    const resetRes = await request(app)
      .post(`/api/shows/${showId}/episode-order`)
      .send({
        mode: 'reset',
        items: s1Eps.map((ep: { id: number; seasonNumber: number; episodeNumber: number }) => ({
          episodeId: ep.id,
          targetSeason: ep.seasonNumber,
          targetEpisode: ep.episodeNumber,
        })),
      });
    expect(resetRes.status).toBe(200);
    expect(resetRes.body.episodes[0].id).toBe(s1Eps[0].id);
    expect(resetRes.body.episodes[0].displaySeason).toBeNull();
    expect(resetRes.body.episodes[0].displayEpisode).toBeNull();
    const resetXml = fs.readFileSync(resetRes.body.episodes[0].nfoPath, 'utf-8');
    expect(resetXml).not.toContain('<displayseason>');
    expect(resetXml).not.toContain('<displayepisode>');

    // Canonical mode updates <season> and <episode> directly
    const canonRes = await request(app)
      .post(`/api/shows/${showId}/episode-order`)
      .send({
        mode: 'canonical',
        items: reversed.map((ep: { id: number }, idx: number) => ({
          episodeId: ep.id,
          targetSeason: 1,
          targetEpisode: idx + 1,
        })),
      });
    expect(canonRes.status).toBe(200);
    expect(canonRes.body.episodes[0].id).toBe(reversed[0].id);
    expect(canonRes.body.episodes[0].episodeNumber).toBe(1);
    expect(canonRes.body.episodes[0].displayEpisode).toBeNull();

    db.close();
  }, 15000);
});
