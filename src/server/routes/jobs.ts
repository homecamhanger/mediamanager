import { Router } from 'express';
import { BatchJobManager } from '../scanner/batchJobManager.js';
import { ScanJobManager } from '../scanner/scanJobManager.js';

export function createJobsRouter(batchJobs: BatchJobManager, scanJobs?: ScanJobManager): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({
      jobs: batchJobs.listJobs(),
      scanJobs: scanJobs ? scanJobs.listJobs() : [],
    });
  });

  router.get('/:jobId', (req, res) => {
    const job = batchJobs.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json({ job });
  });

  router.post('/scrape', (req, res) => {
    const scope = req.body?.scope === 'all' ? 'all' : 'unscraped';
    const job = batchJobs.startBatchScrape({ scope });
    res.json({ job });
  });

  router.post('/subtitles', (req, res) => {
    const languages = Array.isArray(req.body?.languages) ? (req.body.languages as string[]) : undefined;
    const job = batchJobs.startBatchSubtitles({ languages });
    res.json({ job });
  });

  router.post('/nfo', (req, res) => {
    const scope = req.body?.scope === 'missing' ? 'missing' : 'all';
    const job = batchJobs.startBatchNfoSync({ scope });
    res.json({ job });
  });

  router.post('/:jobId/cancel', (req, res) => {
    const job = batchJobs.cancelJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json({ job });
  });

  return router;
}
