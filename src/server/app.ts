import express from 'express';
import { MediaDatabase } from './db/database.js';
import { createJobsRouter } from './routes/jobs.js';
import { createLibraryRouter } from './routes/library.js';
import { createMediaRouter } from './routes/media.js';
import { createNfoRouter } from './routes/nfo.js';
import { createPlaylistsRouter } from './routes/playlists.js';
import { createRenamerRouter } from './routes/renamer.js';
import { createScrapersRouter } from './routes/scrapers.js';
import { createSettingsRouter } from './routes/settings.js';
import { createSubtitlesRouter } from './routes/subtitles.js';
import { AuditJobManager } from './audit/auditJobs.js';
import { buildMovieProblemReport } from './audit/movieProblems.js';
import { FolderProposalService } from './renamer/folderProposalService.js';
import { BatchJobManager } from './scanner/batchJobManager.js';
import { ScanJobManager } from './scanner/scanJobManager.js';

export function createApiApp(db: MediaDatabase) {
  const app = express();
  app.use(express.json({ limit: '30mb' }));

  const scanJobs = new ScanJobManager();
  const batchJobs = new BatchJobManager(db);
  const folderProposals = new FolderProposalService(db);
  const auditJobs = new AuditJobManager(db);

  // The bulk rescan needs "every film with a problem", which combines the audit rules
  // with folder ownership. Wiring it here keeps that graph out of the job manager.
  batchJobs.setProblemIdsProvider((kinds) =>
    buildMovieProblemReport(db, {
      folderReport: folderProposals.build(),
      // Narrowing by kind is what the per-type checkboxes in the UI send.
      kinds: kinds as never,
    })
      .movies.filter((m) => m.rescanCanFix)
      .map((m) => m.movieId),
  );

  /** Films with problems, split into what a rescan fixes and what needs a scrape. */
  app.get('/api/movies/problems', (_req, res) => {
    res.json(
      buildMovieProblemReport(db, { folderReport: folderProposals.build() }),
    );
  });

  /**
   * Audit as a pollable job.
   *
   * The old single request could not report progress, which is exactly the complaint:
   * a long audit and a hung one looked identical. The sync `/api/audit` route stays for
   * callers that want one shot (and for the tests), but the UI polls these instead.
   */
  app.post('/api/audit/run', (_req, res) => {
    res.json({ job: auditJobs.start() });
  });

  app.get('/api/audit/job/:jobId', (req, res) => {
    const job = auditJobs.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Audit job not found' });
    res.json({ job });
  });

  /** Lets a reloaded page reattach to an audit that is already running. */
  app.get('/api/audit/latest', (_req, res) => {
    res.json({ job: auditJobs.latest() });
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'KodiVault', dbPath: db.dbPath });
  });

  app.use('/api', createLibraryRouter(db));
  app.use('/api', createMediaRouter(db));
  app.use('/api/jobs', createJobsRouter(batchJobs, scanJobs));
  app.use('/api/scrapers', createScrapersRouter(db));
  app.use('/api/nfo', createNfoRouter(db));
  app.use('/api/subtitles', createSubtitlesRouter(db));
  app.use('/api/renamer', createRenamerRouter(db));
  app.use('/api/settings', createSettingsRouter(db, scanJobs));
  app.use('/api/playlists', createPlaylistsRouter(db));

  return app;
}
