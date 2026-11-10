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

async function pollUntilDone(app: ReturnType<typeof createApiApp>, jobId: string) {
  const seenPercents: number[] = [];
  for (let i = 0; i < 60; i++) {
    const res = await request(app).get(`/api/settings/sources/jobs/${jobId}`);
    expect(res.status).toBe(200);
    seenPercents.push(res.body.job.overallPercent);
    if (res.body.job.status !== 'running') {
      return { job: res.body.job, seenPercents };
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('Timed out waiting for async source scan job');
}

describe('Async Source Addition & Step Progress Tracking', () => {
  it('immediately registers a new movie source and tracks 5 scan steps to completion', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-scan-prog-'));
    tmpDirs.push(tmp);

    const moviesDir = path.join(tmp, 'NewMovies');
    fs.mkdirSync(path.join(moviesDir, 'Dune (2021)'), { recursive: true });
    fs.mkdirSync(path.join(moviesDir, 'Arrival (2016)'), { recursive: true });
    fs.writeFileSync(
      path.join(moviesDir, 'Dune (2021)', 'Dune (2021) [2160p HEVC].mp4'),
      createMinimalValidMp4({ width: 3840, height: 2160, durationSeconds: 9300 })
    );
    fs.writeFileSync(
      path.join(moviesDir, 'Arrival (2016)', 'Arrival (2016) [1080p x264].mp4'),
      createMinimalValidMp4({ width: 1920, height: 1080, durationSeconds: 6960 })
    );

    const db = new MediaDatabase(path.join(tmp, 'test.db'));
    const app = createApiApp(db);

    const addRes = await request(app)
      .post('/api/settings/sources')
      .send({ name: '4K NAS Movies', path: moviesDir, mediaKind: 'movie', asyncScan: true });

    expect(addRes.status).toBe(200);
    expect(addRes.body.source.id).toBeTruthy();
    expect(addRes.body.source.name).toBe('4K NAS Movies');
    expect(addRes.body.job).toBeTruthy();
    expect(addRes.body.job.steps.map((s: { id: string }) => s.id)).toEqual([
      'register_source',
      'discover_files',
      'probe_and_hash',
      'parse_sidecars',
      'finalize',
    ]);
    expect(addRes.body.job.steps[0].status).toBe('completed');

    // Source already shows up in /api/settings/sources before scan finishes
    const listRes = await request(app).get('/api/settings/sources');
    expect(listRes.body.sources.some((s: { id: number }) => s.id === addRes.body.source.id)).toBe(true);

    const { job } = await pollUntilDone(app, addRes.body.job.jobId);
    expect(job.status).toBe('completed');
    expect(job.overallPercent).toBe(100);
    expect(job.moviesScanned).toBe(2);
    expect(job.steps.every((s: { status: string }) => s.status === 'completed')).toBe(true);

    const moviesRes = await request(app).get('/api/movies');
    expect(moviesRes.body.movies).toHaveLength(2);

    db.close();
  });

  it('tracks TV show source step progress and episode counts asynchronously', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-tv-prog-'));
    tmpDirs.push(tmp);

    const tvDir = path.join(tmp, 'TV');
    const showDir = path.join(tvDir, 'Andor (2022)', 'Season 01');
    fs.mkdirSync(showDir, { recursive: true });
    fs.writeFileSync(path.join(showDir, 'Andor - S01E01.mp4'), createMinimalValidMp4({ width: 1920, height: 1080, durationSeconds: 2700 }));
    fs.writeFileSync(path.join(showDir, 'Andor - S01E02.mp4'), createMinimalValidMp4({ width: 1920, height: 1080, durationSeconds: 2700 }));

    const db = new MediaDatabase(path.join(tmp, 'tv.db'));
    const app = createApiApp(db);

    const addRes = await request(app)
      .post('/api/settings/sources')
      .send({ name: 'TV Archive', path: tvDir, mediaKind: 'tvshow', asyncScan: true });
    expect(addRes.status).toBe(200);

    const { job } = await pollUntilDone(app, addRes.body.job.jobId);
    expect(job.status).toBe('completed');
    expect(job.showsScanned).toBe(1);
    expect(job.episodesScanned).toBe(2);
    expect(job.overallPercent).toBe(100);

    const jobsList = await request(app).get('/api/settings/sources/jobs');
    expect(jobsList.status).toBe(200);
    expect(jobsList.body.jobs.length).toBeGreaterThanOrEqual(1);

    db.close();
  });
});
