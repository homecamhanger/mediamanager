import { Router } from 'express';
import type { RenamePatternsConfig, RenamePreviewItem } from '../../shared/types.js';
import { DEFAULT_RENAME_PATTERNS, MediaDatabase } from '../db/database.js';
import { RenamerEngine } from '../renamer/renamerEngine.js';

export function createRenamerRouter(db: MediaDatabase): Router {
  const router = Router();
  const renamer = new RenamerEngine(db);

  router.get('/patterns', (_req, res) => {
    res.json(renamer.getPatterns());
  });

  router.put('/patterns', (req, res) => {
    const next = { ...DEFAULT_RENAME_PATTERNS, ...(req.body as Partial<RenamePatternsConfig>) };
    db.setSetting('rename_patterns', next);
    res.json(next);
  });

  router.post('/preview', (req, res) => {
    const { movieIds = [], episodeIds = [], patterns } = req.body as {
      movieIds?: number[];
      episodeIds?: number[];
      patterns?: Partial<RenamePatternsConfig>;
    };
    const mIds = movieIds.length > 0 || episodeIds.length > 0 ? movieIds : db.listMovies().map((m) => m.id);
    const eIds = movieIds.length > 0 || episodeIds.length > 0 ? episodeIds : db.listAllEpisodes().map((e) => e.id);

    const items: RenamePreviewItem[] = [
      ...renamer.previewMovieRename(mIds, patterns),
      ...renamer.previewEpisodeRename(eIds, patterns),
    ];
    res.json({ items });
  });

  router.post('/execute', (req, res) => {
    const { items, cleanupEmptyFolders = true } = req.body as {
      items: RenamePreviewItem[];
      cleanupEmptyFolders?: boolean;
    };
    const result = renamer.executeRename(items ?? [], cleanupEmptyFolders);
    res.json(result);
  });

  router.get('/history', (_req, res) => {
    res.json({ batches: db.listRenameHistory(30) });
  });

  router.post('/undo/:batchId', (req, res) => {
    try {
      const result = renamer.revertBatch(req.params.batchId);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  return router;
}
