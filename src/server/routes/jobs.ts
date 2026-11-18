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

  /**
   * Re-reads only the films that have problems, in bulk.
   *
   * A `mode` of `all` derives the film list server-side from the same problem report
   * the UI shows, so "rescan everything flagged" and the list on screen can never
   * disagree. `movieIds` exists so the UI can act on a specific selection.
   */
  router.post('/rescan', (req, res) => {
    const mode = req.body?.mode === 'all' ? 'all' : 'ids';
    let movieIds: number[] = Array.isArray(req.body?.movieIds)
      ? (req.body.movieIds as unknown[]).filter((id): id is number => typeof id === 'number')
      : [];

    if (mode === 'all') {
      movieIds = batchJobs.problemMovieIds();
    }
    if (movieIds.length === 0) {
      return res.status(400).json({ error: 'No films to rescan' });
    }
    const job = batchJobs.startTargetedRescan(movieIds);
    res.json({ job, movieIds });
  });

  router.post('/:jobId/cancel', (req, res) => {
    const job = batchJobs.cancelJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json({ job });
  });

  return router;
}
