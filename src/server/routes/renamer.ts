import { Router } from 'express';
import type { RenamePatternsConfig, RenamePreviewItem } from '../../shared/types.js';
import { DEFAULT_RENAME_PATTERNS, MediaDatabase } from '../db/database.js';
import { RenamerEngine } from '../renamer/renamerEngine.js';
import { FolderProposalService } from '../renamer/folderProposalService.js';

export function createRenamerRouter(db: MediaDatabase): Router {
  const router = Router();
  const renamer = new RenamerEngine(db);
  const folderProposals = new FolderProposalService(db);

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

  /**
   * Films that cannot own a folder, with a destination proposed for each.
   *
   * Read-only: nothing is created or moved until `/folder-proposals/apply` is called
   * with the ids the user explicitly approved.
   */
  router.get('/folder-proposals', (_req, res) => {
    res.json(folderProposals.build());
  });

  /** Applies an approved subset. Ids are re-validated against live state. */
  router.post('/folder-proposals/apply', (req, res) => {
    const { movieIds } = req.body as { movieIds?: unknown };
    if (!Array.isArray(movieIds) || movieIds.some((id) => typeof id !== 'number')) {
      return res.status(400).json({ error: 'movieIds must be an array of numbers' });
    }
    if (movieIds.length === 0) {
      return res.status(400).json({ error: 'No proposals approved' });
    }
    try {
      const result = folderProposals.apply(movieIds as number[]);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
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
