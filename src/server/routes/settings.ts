import { Router } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AppPreferences, KodiRpcConfig } from '../../shared/types.js';
import { DEFAULT_KODI_RPC, DEFAULT_PREFERENCES, MediaDatabase } from '../db/database.js';
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
    const job = scanJobs.createJob(source, true);
    setImmediate(() => {
      void (async () => {
        try {
          const res = await scanner.scanSource(source, (update) => {
            scanJobs.updateJob(job.jobId, update);
          });
          scanJobs.updateJob(job.jobId, {
            status: 'completed',
            overallPercent: 100,
            moviesScanned: res.moviesScanned,
            showsScanned: res.showsScanned,
            episodesScanned: res.episodesScanned,
            finishedAt: new Date().toISOString(),
          });
        } catch (err) {
          scanJobs.failJob(job.jobId, (err as Error).message);
        }
      })();
    });
    return job;
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

  router.get('/fs/browse', (req, res) => {
    const target = req.query.path ? path.resolve(String(req.query.path)) : process.cwd();
    const safeTarget = fs.existsSync(target) ? target : os.homedir();
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
    res.json(kodi.getConfig());
  });

  router.put('/kodi', (req, res) => {
    const next = { ...DEFAULT_KODI_RPC, ...(req.body as Partial<KodiRpcConfig>) };
    db.setSetting('kodi_rpc', next);
    res.json(next);
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
