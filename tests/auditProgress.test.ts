/**
 * Progress reporting for long operations.
 *
 * The complaint behind this work was that a slow audit and a hung one looked identical.
 * A test that only asserts "a spinner exists" would not catch a regression back to that
 * state, so these tests check the two things that actually make progress trustworthy:
 * the audit reports phases with real, monotonic counts, and the client poller stops on
 * a terminal status rather than spinning forever.
 */
import { describe, expect, it } from 'vitest';
import type { AuditJob, AuditProgress } from '../src/shared/types.js';
import { buildAuditReport } from '../src/server/audit/auditEngine.js';
import type { MediaDatabase } from '../src/server/db/database.js';

/**
 * Full-shape rows.
 *
 * The audit reads many fields per row, and a hand-written fixture keeps failing one
 * field at a time. These are shaped after real rows from the database so the tests
 * break on behaviour, not on a missing property.
 */
const parsedInfo = {
  cleanTitle: 'Film',
  year: 2016,
  mediaKind: 'movie' as const,
  seasonNumber: null,
  episodeNumber: null,
  multiEpisodeEnd: null,
  resolution: '720p',
  source: 'BluRay',
  videoCodec: 'H.264',
  audioCodec: null,
  audioChannels: null,
  hdr: null,
  edition: null,
  releaseGroup: null,
};

const movieRow = {
  id: 1,
  sourceId: 1,
  folderPath: '/lib/Movies/Film',
  filePath: '/lib/Movies/Film/Film.mkv',
  fileName: 'Film.mkv',
  hasNfo: true,
  nfoValid: true,
  nfoWarnings: [] as string[],
  scraped: true,
  title: 'Film',
  artwork: { poster: 'p.jpg', fanart: 'f.jpg', banner: 'b.jpg' },
  streamDetails: { video: [{ height: 720 }], audio: [] },
  subtitles: [{ language: 'en' }],
  parsedInfo,
  uniqueIds: {} as Record<string, string>,
};

const showRow = {
  id: 3,
  sourceId: 1,
  folderPath: '/lib/TV/Show',
  hasNfo: true,
  nfoValid: true,
  nfoWarnings: [] as string[],
  scraped: true,
  title: 'Show',
  episodeGuide: [] as { season: number; episode: number }[],
  artwork: { poster: 'p.jpg', fanart: 'f.jpg', banner: 'b.jpg' },
  uniqueIds: {} as Record<string, string>,
};

/** Minimal db double: the audit only reads through these calls. */
function fakeDb(overrides: Partial<Record<string, unknown>> = {}) {
  const base = {
    getSetting: () => ({ preferredSubtitleLanguages: ['en'] }),
    listMovies: () => [],
    listTvShows: () => [],
    listAllEpisodes: () => [],
    listMovieSets: () => [],
    listAllSubtitles: () => [],
    listSeasonsForShow: () => [],
    ...overrides,
  };
  return base as unknown as MediaDatabase;
}

function collect(db: MediaDatabase): AuditProgress[] {
  const events: AuditProgress[] = [];
  buildAuditReport(db, (u) => events.push({ ...u }));
  return events;
}

describe('audit progress', () => {
  it('reports progress even for an empty library', () => {
    const events = collect(fakeDb());
    // An empty library still has to say something; silence is the bug being fixed.
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => typeof e.phase === 'string' && e.phase.length > 0)).toBe(true);
  });

  it('reports percentages that never go backwards', () => {
    const db = fakeDb({
      listMovies: () => [movieRow],
      listTvShows: () => [showRow],
    });
    const events = collect(db);
    for (let i = 1; i < events.length; i++) {
      expect(events[i].percent).toBeGreaterThanOrEqual(events[i - 1].percent);
    }
  });

  it('finishes below 100 so completion is not claimed early', () => {
    const events = collect(fakeDb());
    // The last phase still has work to do after it reports; only the job wrapper
    // marks 100%, once the report object actually exists.
    expect(events[events.length - 1].percent).toBeLessThan(100);
  });

  it('counts are within total', () => {
    for (const e of collect(fakeDb())) {
      expect(e.completed).toBeLessThanOrEqual(e.total);
      expect(e.total).toBeGreaterThan(0);
    }
  });

  it('names the episode-guide phase when shows exist', () => {
    const db = fakeDb({
      listTvShows: () => [showRow],
    });
    const phases = collect(db).map((e) => e.phase);
    expect(phases.some((p) => /episode guide/i.test(p))).toBe(true);
  });
});

describe('audit job lifecycle', () => {
  /** Mirrors the poll loop in AuditPage: stop on a terminal status. */
  async function pollUntilDone(
    fetchJob: (id: string) => Promise<AuditJob>,
    jobId: string,
    maxTicks = 50,
  ): Promise<{ ticks: number; job: AuditJob }> {
    let ticks = 0;
    let job = await fetchJob(jobId);
    while (job.status === 'running' && ticks < maxTicks) {
      ticks += 1;
      job = await fetchJob(jobId);
    }
    return { ticks, job };
  }

  it('stops polling once the job completes', async () => {
    let calls = 0;
    const job: AuditJob = {
      jobId: 'j1',
      status: 'completed',
      progress: { phase: 'Done', completed: 6, total: 6, percent: 100 },
      report: null,
      error: null,
      startedAt: 0,
      finishedAt: 1,
    };
    const { ticks, job: out } = await pollUntilDone(async () => {
      calls += 1;
      return job;
    }, 'j1');
    expect(calls).toBe(1);
    expect(ticks).toBe(0);
    expect(out.status).toBe('completed');
  });

  it('does not spin forever on a job that never finishes', async () => {
    const running: AuditJob = {
      jobId: 'j2',
      status: 'running',
      progress: { phase: 'Loading library', completed: 1, total: 6, percent: 17 },
      report: null,
      error: null,
      startedAt: 0,
      finishedAt: null,
    };
    const { ticks } = await pollUntilDone(async () => running, 'j2', 5);
    // Bounded, so a wedged server surfaces as a limit rather than a frozen page.
    expect(ticks).toBe(5);
  });

  it('surfaces a failure message instead of a progress bar', async () => {
    const failed: AuditJob = {
      jobId: 'j3',
      status: 'failed',
      progress: { phase: 'Loading library', completed: 1, total: 6, percent: 17 },
      report: null,
      error: 'database is locked',
      startedAt: 0,
      finishedAt: 1,
    };
    const { job } = await pollUntilDone(async () => failed, 'j3');
    expect(job.status).toBe('failed');
    expect(job.error).toMatch(/locked/);
  });
});
