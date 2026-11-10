import express from 'express';
import { MediaDatabase } from './db/database.js';
import { createJobsRouter } from './routes/jobs.js';
import { createLibraryRouter } from './routes/library.js';
import { createMediaRouter } from './routes/media.js';
import { createNfoRouter } from './routes/nfo.js';
import { createRenamerRouter } from './routes/renamer.js';
import { createScrapersRouter } from './routes/scrapers.js';
import { createSettingsRouter } from './routes/settings.js';
import { createSubtitlesRouter } from './routes/subtitles.js';
import { BatchJobManager } from './scanner/batchJobManager.js';
import { ScanJobManager } from './scanner/scanJobManager.js';

export function createApiApp(db: MediaDatabase) {
  const app = express();
  app.use(express.json({ limit: '30mb' }));

  const scanJobs = new ScanJobManager();
  const batchJobs = new BatchJobManager(db);

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

  return app;
}
