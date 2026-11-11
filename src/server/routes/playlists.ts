import express from 'express';
import type { MediaDatabase } from '../db/database.js';
import { KodiClient } from '../kodi/kodiClient.js';
import {
  SMART_PLAYLIST_FIELDS,
  SMART_PLAYLIST_PRESETS,
  presetDefinition,
  previewDefinition,
  sanitizeDefinition,
  serializeSmartPlaylist,
  toKodiPlaylistFileName,
} from '../playlists/smartPlaylistEngine.js';
import type {
  SmartPlaylistDefinition,
  SmartPlaylistPresetId,
  SmartPlaylistType,
} from '../../shared/types.js';

export function createPlaylistsRouter(db: MediaDatabase) {
  const router = express.Router();
  const kodi = new KodiClient(db);

  const libraryFor = (type: SmartPlaylistType) => {
    if (type === 'movies') return { movies: db.listMovies(), episodes: [], shows: [] };
    if (type === 'episodes') return { movies: [], episodes: db.listAllEpisodes(), shows: db.listTvShows() };
    return { movies: [], episodes: [], shows: db.listTvShows() };
  };

  // Surface the field catalogue so the client never hard-codes rule metadata.
  router.get('/fields', (_req, res) => {
    res.json({ fields: SMART_PLAYLIST_FIELDS });
  });

  router.get('/presets', (_req, res) => {
    res.json({
      presets: SMART_PLAYLIST_PRESETS.map((p) => ({
        id: p.id,
        label: p.label,
        description: p.description,
        type: p.definition.type,
        ruleCount: p.definition.rules.length,
      })),
    });
  });

  router.get('/presets/:id', (req, res) => {
    const definition = presetDefinition(req.params.id as SmartPlaylistPresetId);
    if (!definition) return res.status(404).json({ error: 'Unknown preset' });
    res.json({ definition });
  });

  // Stateless preview — also used by the "unsaved draft" builder before a save.
  router.post('/preview', (req, res) => {
    const { definition, warnings } = sanitizeDefinition(req.body?.definition ?? req.body ?? {});
    const { movies, episodes, shows } = libraryFor(definition.type);
    const { preview, matched } = previewDefinition(definition, movies, episodes, shows);
    res.json({
      definition,
      validationWarnings: warnings,
      preview: {
        ...preview,
        kodiFileName: toKodiPlaylistFileName(definition.name),
        xml: serializeSmartPlaylist(definition),
      },
      matchedCount: matched.length,
    });
  });

  // Legacy-compatible export used by SettingsPage + apiIntegration test.
  router.post('/export', (req, res) => {
    const { definition, warnings } = sanitizeDefinition(req.body?.definition ?? req.body ?? {});
    const { movies, episodes, shows } = libraryFor(definition.type);
    const { preview } = previewDefinition(definition, movies, episodes, shows);
    res.json({
      definition,
      validationWarnings: warnings,
      xml: serializeSmartPlaylist(definition),
      kodiFileName: toKodiPlaylistFileName(definition.name),
      totalCount: preview.totalCount,
    });
  });

  /* ---------------- saved playlists ---------------- */

  router.get('/', (_req, res) => {
    const playlists = db.listSmartPlaylists();
    // Refresh cached counts so the list can show live sizes cheaply.
    const withCounts = playlists.map((p) => {
      const { movies, episodes, shows } = libraryFor(p.type);
      const { preview } = previewDefinition(p, movies, episodes, shows, 1);
      return { ...p, lastKnownCount: preview.totalCount };
    });
    res.json({ playlists: withCounts });
  });

  router.get('/:id', (req, res) => {
    const playlist = db.getSmartPlaylist(Number(req.params.id));
    if (!playlist) return res.status(404).json({ error: 'Playlist not found' });
    res.json({ playlist });
  });

  router.post('/', (req, res) => {
    const { definition, warnings } = sanitizeDefinition(req.body?.definition ?? req.body ?? {});
    const created = db.createSmartPlaylist(definition);
    db.logActivity('system', 'Create Smart Playlist', `Created "${created.name}" (${created.type})`, 'success');
    res.status(201).json({ playlist: created, validationWarnings: warnings });
  });

  router.put('/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!db.getSmartPlaylist(id)) return res.status(404).json({ error: 'Playlist not found' });
    const { definition, warnings } = sanitizeDefinition(req.body?.definition ?? req.body ?? {});
    const updated = db.updateSmartPlaylist(id, definition);
    res.json({ playlist: updated, validationWarnings: warnings });
  });

  router.delete('/:id', (req, res) => {
    const ok = db.deleteSmartPlaylist(Number(req.params.id));
    if (!ok) return res.status(404).json({ error: 'Playlist not found' });
    res.json({ ok: true });
  });

  router.post('/:id/duplicate', (req, res) => {
    const source = db.getSmartPlaylist(Number(req.params.id));
    if (!source) return res.status(404).json({ error: 'Playlist not found' });
    const copy = db.createSmartPlaylist({ ...source, name: `${source.name} (copy)` });
    res.status(201).json({ playlist: copy });
  });

  /** Preview a saved playlist, using its stored definition (or an override from the editor). */
  router.post('/:id/preview', (req, res) => {
    const saved = db.getSmartPlaylist(Number(req.params.id));
    if (!saved) return res.status(404).json({ error: 'Playlist not found' });
    const source = req.body?.definition ? sanitizeDefinition(req.body.definition) : { definition: saved, warnings: [] };
    const { definition, warnings } = source;
    const { movies, episodes, shows } = libraryFor(definition.type);
    const { preview } = previewDefinition(definition, movies, episodes, shows);
    if (!req.body?.definition) db.recordSmartPlaylistCount(saved.id, preview.totalCount);
    res.json({
      definition,
      validationWarnings: warnings,
      matchedCount: preview.totalCount,
      preview: {
        ...preview,
        kodiFileName: toKodiPlaylistFileName(definition.name),
        xml: serializeSmartPlaylist(definition),
      },
    });
  });

  /** Download as an .xsp attachment. */
  router.get('/:id/download', (req, res) => {
    const saved = db.getSmartPlaylist(Number(req.params.id));
    if (!saved) return res.status(404).json({ error: 'Playlist not found' });
    const xml = serializeSmartPlaylist(saved);
    db.markSmartPlaylistExported(saved.id, saved.lastKnownCount ?? null);
    const fileName = `${toKodiPlaylistFileName(saved.name)}.xsp`;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/"/g, '')}"`);
    res.send(xml);
  });

  /**
   * Push straight into Kodi's userdata over JSON-RPC. Falls back to a mapped
   * local profile folder when Kodi is unreachable, so the feature still works
   * for setups that sync userdata by other means.
   */
  router.post('/:id/push', async (req, res) => {
    const saved = db.getSmartPlaylist(Number(req.params.id));
    if (!saved) return res.status(404).json({ error: 'Playlist not found' });
    const xml = serializeSmartPlaylist(saved);
    const fileName = toKodiPlaylistFileName(saved.name);

    const ping = await kodi.testConnection();
    if (ping.ok) {
      const result = await kodi.writeSmartPlaylistToKodi(xml, fileName);
      if (result.ok) {
        db.markSmartPlaylistExported(saved.id, saved.lastKnownCount ?? null);
        return res.json({ ok: true, method: 'json-rpc', targetPath: result.path, xml });
      }
      return res.status(502).json({ ok: false, method: 'json-rpc', error: result.error, xml });
    }

    const local = kodi.writeSmartPlaylistToLocalProfile(xml, fileName);
    if (local.ok) {
      db.markSmartPlaylistExported(saved.id, saved.lastKnownCount ?? null);
      return res.json({ ok: true, method: 'local-file', targetPath: local.path, xml });
    }
    return res.status(400).json({
      ok: false,
      method: 'local-file',
      error: `Kodi unreachable (${ping.status ?? "connection failed"}) and no "special://profile" path mapping is configured`,
      xml,
    });
  });

  /** Update the cached match count for a saved playlist. */
  router.post('/:id/refresh-count', (req, res) => {
    const saved = db.getSmartPlaylist(Number(req.params.id));
    if (!saved) return res.status(404).json({ error: 'Playlist not found' });
    const { movies, episodes, shows } = libraryFor(saved.type);
    const { preview } = previewDefinition(saved, movies, episodes, shows, 1);
    db.recordSmartPlaylistCount(saved.id, preview.totalCount);
    res.json({ totalCount: preview.totalCount });
  });

  return router;
}

/** Helper so callers can validate a definition without importing the engine. */
export function normalizePlaylistDefinition(body: unknown): SmartPlaylistDefinition {
  return sanitizeDefinition((body as Partial<SmartPlaylistDefinition>) ?? {}).definition;
}
