import { Router } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AppPreferences, KodiRpcConfig } from '../../shared/types.js';
import { DEFAULT_KODI_RPC, DEFAULT_PREFERENCES, MediaDatabase } from '../db/database.js';
import { isPathInsideAnyRoot } from '../lib/pathSafety.js';
import { mergeSecretUpdate, redactFields } from '../lib/redact.js';
import { KodiClient } from '../kodi/kodiClient.js';
import { LibraryScanner } from '../scanner/libraryScanner.js';
import { ScanJobManager } from '../scanner/scanJobManager.js';
import { resetAndSeedSampleLibrary } from '../scanner/sampleGenerator.js';

export function createSettingsRouter(db: MediaDatabase, sharedScanJobs?: ScanJobManager): Router {
  const router = Router();
  const scanner = new LibraryScanner(db);
  const kodi = new KodiClient(db);
  const scanJobs = sharedScanJobs ?? new ScanJobManager();

  const startAsyncScan = (source: ReturnType<MediaDatabase['addSource']>) => {
    return scanJobs.enqueueScan(source, async (jobId) => {
      const res = await scanner.scanSource(source, (update) => {
        scanJobs.updateJob(jobId, update);
      });
      scanJobs.updateJob(jobId, {
        status: 'completed',
        overallPercent: 100,
        currentItem: undefined,
        moviesScanned: res.moviesScanned,
        showsScanned: res.showsScanned,
        episodesScanned: res.episodesScanned,
        finishedAt: new Date().toISOString(),
      });
    });
  };

  router.get('/sources', (_req, res) => {
    res.json({ sources: db.listSources() });
  });

  router.get('/sources/jobs', (_req, res) => {
    res.json({ jobs: scanJobs.listJobs() });
  });

  router.get('/sources/jobs/:jobId', (req, res) => {
    const job = scanJobs.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Scan job not found' });
    res.json({ job });
  });

  router.post('/sources', async (req, res) => {
    const {
      name,
      path: folderPath,
      mediaKind,
      nfoNaming,
      artworkNaming,
      scanNow = true,
      asyncScan = false,
    } = req.body as {
      name: string;
      path: string;
      mediaKind: 'movie' | 'tvshow';
      nfoNaming?: 'movie.nfo' | 'filename.nfo';
      artworkNaming?: 'folder' | 'filename';
      scanNow?: boolean;
      asyncScan?: boolean;
    };
    if (!folderPath || !name) return res.status(400).json({ error: 'Name and path are required' });
    const resolved = path.resolve(folderPath);
    if (!fs.existsSync(resolved)) {
      fs.mkdirSync(resolved, { recursive: true });
    }
    try {
      const src = db.addSource({ name, path: resolved, mediaKind, nfoNaming, artworkNaming });
      if (scanNow && asyncScan) {
        const job = startAsyncScan(src);
        return res.json({ source: src, job });
      }
      let scanResult = null;
      if (scanNow) {
        scanResult = await scanner.scanSource(src);
      }
      res.json({ source: src, scanResult });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.delete('/sources/:id', (req, res) => {
    db.deleteSource(Number(req.params.id));
    res.json({ ok: true });
  });

  router.post('/sources/scan', async (req, res) => {
    const sourceId = req.body?.sourceId ? Number(req.body.sourceId) : null;
    const asyncScan = Boolean(req.body?.asyncScan);
    if (sourceId) {
      const src = db.getSource(sourceId);
      if (!src) return res.status(404).json({ error: 'Source not found' });
      if (asyncScan) {
        const job = startAsyncScan(src);
        return res.json({ job });
      }
      const result = await scanner.scanSource(src);
      return res.json(result);
    }
    const result = await scanner.scanAllSources();
    res.json(result);
  });

  /**
   * Directories the folder browser may show.
   *
   * It exists to help pick a media folder, but it accepted any absolute path and
   * would enumerate the whole host (`?path=/`), which is a filesystem disclosure
   * for anyone who can reach the port. Allowed roots are the configured media
   * sources, the sample library, and whatever `BROWSE_ROOTS` adds — a comma
   * separated list for the "I need to see /mnt before I've added a source" case.
   */
  const browseRoots = (): string[] => {
    const fromEnv = (process.env.BROWSE_ROOTS ?? '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    const sources = db.listSources().map((s) => s.path);
    const sampleDir = path.resolve(process.cwd(), 'sample-library');
    return [...new Set([...fromEnv, ...sources, sampleDir, os.homedir()].map((p) => path.resolve(p)))];
  };

  router.get('/fs/browse', (req, res) => {
    const roots = browseRoots();
    const requested = req.query.path ? path.resolve(String(req.query.path)) : roots[0] ?? os.homedir();

    // Refuse anything outside the allowed roots rather than silently redirecting:
    // a redirect would make a traversal attempt look like a successful browse.
    if (!isPathInsideAnyRoot(requested, roots)) {
      return res.status(403).json({
        error: 'Path is outside the browsable roots',
        browsableRoots: roots,
      });
    }

    const safeTarget = fs.existsSync(requested) ? requested : os.homedir();
    try {
      const entries = fs
        .readdirSync(safeTarget, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
        .map((d) => ({ name: d.name, path: path.join(safeTarget, d.name) }))
        .sort((a, b) => a.name.localeCompare(b.name));
      res.json({
        currentPath: safeTarget,
        parentPath: path.dirname(safeTarget) !== safeTarget ? path.dirname(safeTarget) : null,
        directories: entries,
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.get('/preferences', (_req, res) => {
    res.json(db.getSetting<AppPreferences>('preferences', DEFAULT_PREFERENCES));
  });

  router.put('/preferences', (req, res) => {
    const next = { ...DEFAULT_PREFERENCES, ...(req.body as Partial<AppPreferences>) };
    db.setSetting('preferences', next);
    res.json(next);
  });

  router.get('/kodi', (_req, res) => {
    // The Kodi RPC password is a credential; never echo it back.
    res.json(redactFields(kodi.getConfig(), ['password'] as const));
  });

  router.put('/kodi', (req, res) => {
    const body = req.body as Partial<KodiRpcConfig>;
    const pathMappings = Array.isArray(body.pathMappings)
      ? body.pathMappings
          .map((m) => ({
            localPrefix: String(m?.localPrefix ?? '').trim(),
            kodiPrefix: String(m?.kodiPrefix ?? '').trim(),
          }))
          .filter((m) => m.localPrefix && m.kodiPrefix)
      : kodi.getConfig().pathMappings;
    const stored = { ...DEFAULT_KODI_RPC, ...kodi.getConfig() };
    const next = mergeSecretUpdate({ ...body, pathMappings }, stored, ['password'] as const);
    db.setSetting('kodi_rpc', next);
    res.json(redactFields(next, ['password'] as const));
  });

  router.post('/kodi/test', async (_req, res) => {
    res.json(await kodi.testConnection());
  });

  router.post('/kodi/scan', async (_req, res) => {
    res.json(await kodi.triggerScan());
  });

  router.post('/kodi/clean', async (_req, res) => {
    res.json(await kodi.triggerClean());
  });

  router.post('/kodi/sync', async (req, res) => {
    const direction = (req.body as { direction?: 'pull' | 'push' })?.direction === 'push' ? 'push' : 'pull';
    const result = direction === 'push' ? await kodi.pushToKodi() : await kodi.pullFromKodi();
    res.json(result);
  });

  router.post('/kodi/refresh', async (req, res) => {
    const { mediaType, mediaId } = (req.body ?? {}) as { mediaType?: 'movie' | 'episode'; mediaId?: number };
    if ((mediaType !== 'movie' && mediaType !== 'episode') || !mediaId) {
      return res.status(400).json({ error: 'Valid mediaType and mediaId are required' });
    }
    res.json(await kodi.refreshItem(mediaType, Number(mediaId)));
  });

  router.post('/sample/reset', async (_req, res) => {
    const sampleDir = path.resolve(process.cwd(), 'sample-library');
    // Clear existing sample sources & files cleanly
    for (const s of db.listSources()) {
      if (path.resolve(s.path).startsWith(sampleDir)) {
        db.deleteSource(s.id);
      }
    }
    if (fs.existsSync(sampleDir)) {
      fs.rmSync(sampleDir, { recursive: true, force: true });
    }
    await resetAndSeedSampleLibrary(db, sampleDir);
    res.json({ ok: true });
  });

  return router;
}
