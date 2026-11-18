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
    const numeric = (value: unknown): number[] =>
      Array.isArray(value) ? value.filter((id): id is number => typeof id === 'number') : [];
    let movieIds = numeric(req.body?.movieIds);
    let showIds = numeric(req.body?.showIds);

    const kinds = Array.isArray(req.body?.kinds)
      ? (req.body.kinds as unknown[]).filter((k): k is string => typeof k === 'string')
      : undefined;

    if (mode === 'all') {
      // The panel's two type checkboxes map to `includeMovies` / `includeShows`. Both
      // default to on, so a caller that sends neither gets both.
      const all = batchJobs.problemIds(kinds as never);
      const wantsMovies = req.body?.includeMovies !== false;
      const wantsShows = req.body?.includeShows !== false;
      movieIds = wantsMovies ? all.movieIds : [];
      showIds = wantsShows ? all.showIds : [];
    }
    if (movieIds.length === 0 && showIds.length === 0) {
      return res.status(400).json({ error: 'No items to rescan' });
    }
    const job = batchJobs.startTargetedRescan(movieIds, undefined, showIds);
    res.json({ job, movieIds, showIds });
  });

  router.post('/:jobId/cancel', (req, res) => {
    const job = batchJobs.cancelJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json({ job });
  });

  return router;
}
