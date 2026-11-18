import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type { ArtworkKind } from '../../shared/types.js';
import { MediaDatabase } from '../db/database.js';
import { artworkRenderCache, renderCacheKey } from '../lib/renderCache.js';
import { renderArtworkBuffer } from '../scrapers/artworkRenderer.js';

export function createMediaRouter(db: MediaDatabase): Router {
  const router = Router();

  router.get('/artwork/file', (req, res) => {
    const reqPath = String(req.query.path ?? '');
    if (!reqPath) return res.status(400).send('Missing path');

    const resolved = path.resolve(reqPath);
    const sources = db.listSources().map((s) => path.resolve(s.path));
    const sampleDir = path.resolve(process.cwd(), 'sample-library');
    const allowedRoots = [...sources, sampleDir];

    const isAllowed = allowedRoots.some((root) => resolved === root || resolved.startsWith(root + path.sep));
    if (!isAllowed) {
      return res.status(403).send('Forbidden artwork path');
    }
    if (!fs.existsSync(resolved)) {
      return res.status(404).send('Not found');
    }
    // `no-cache` means "store, but revalidate before use" — it does not disable
    // caching. The previous `max-age=86400` did: an uploaded poster replaces the
    // file at the same path, so the list kept its old URL and the browser never
    // asked again, showing a stale thumbnail for up to a day while the detail
    // panel (which bumps `?v=`) looked correct. Revalidation is a 304 of ~100
    // bytes; only artwork that actually changed transfers.
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Vary', 'Accept-Encoding');
    return res.sendFile(resolved, { dotfiles: 'allow' });
  });

  router.get('/artwork/render', (req, res) => {
    const kind = (String(req.query.kind ?? 'poster') as ArtworkKind) || 'poster';
    const title = String(req.query.title ?? 'Untitled');
    const subtitle = req.query.subtitle ? String(req.query.subtitle) : undefined;
    const year = req.query.year ? Number(req.query.year) : null;
    const genres = req.query.genres ? String(req.query.genres).split(',').filter(Boolean) : [];
    const rating = req.query.rating ? Number(req.query.rating) : null;
    const accentColor = req.query.accent ? String(req.query.accent) : undefined;
    const secondaryColor = req.query.secondary ? String(req.query.secondary) : undefined;
    const episodeCode = req.query.episodeCode ? String(req.query.episodeCode) : undefined;
    const variant = req.query.variant ? String(req.query.variant) : '';

    const ext = kind === 'clearlogo' || kind === 'clearart' || kind === 'disc' ? '.png' : '.jpg';
    const renderInput = {
      kind,
      title,
      subtitle,
      year: Number.isNaN(year) ? null : year,
      genres,
      rating: Number.isNaN(rating) ? null : rating,
      accentColor: variant === 'alt' ? secondaryColor || '#8b5cf6' : accentColor,
      secondaryColor: variant === 'alt' ? accentColor || '#38bdf8' : secondaryColor,
      episodeCode,
    };

    // Rasterising the SVG plus a JPEG re-encode is CPU-bound and was repeated for
    // every client on every expiry. The key covers every input that affects pixels.
    const isPng = ext === '.png';
    const buf = artworkRenderCache.getOrCompute(renderCacheKey(renderInput, ext), () =>
      renderArtworkBuffer(renderInput, ext)
    );

    res.setHeader('Content-Type', isPng ? 'image/png' : 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(buf);
  });

  return router;
}
