import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type {
  ArtworkKind,
  DashboardSummary,
  LibraryAuditReport,
  MissingEpisodeRecord,
  MovieRecord,
} from '../../shared/types.js';
import { computeMissingEpisodesFromGuide, DEFAULT_PREFERENCES, MediaDatabase } from '../db/database.js';
import { KodiClient } from '../kodi/kodiClient.js';
import { serializeEpisodeNfo, serializeTvShowNfo, validateKodiNfoXml } from '../nfo/kodiNfo.js';
import {
  saveActorThumbToDisk,
  saveArtworkToDisk,
  saveUploadedArtworkToDisk,
} from '../scrapers/artworkRenderer.js';
import { ScraperEngine } from '../scrapers/scraperEngine.js';

export function createLibraryRouter(db: MediaDatabase): Router {
  const router = Router();
  const scraper = new ScraperEngine(db);
  const kodi = new KodiClient(db);

  router.get('/dashboard', (_req, res) => {
    const movies = db.listMovies();
    const shows = db.listTvShows();
    const episodes = db.listAllEpisodes();
    const sets = db.listMovieSets();
    const subs = db.listAllSubtitles();
    const providers = scraper.getProviders();

    const qualityMap = new Map<string, number>();
    const genreMap = new Map<string, number>();

    let storageBytes = 0;
    for (const m of movies) {
      storageBytes += m.fileSizeBytes;
      const resLabel =
        m.parsedInfo.resolution?.toUpperCase() ||
        (m.streamDetails.video[0]?.height >= 2000
          ? '2160P'
          : m.streamDetails.video[0]?.height >= 1000
            ? '1080P'
            : m.streamDetails.video[0]?.height >= 700
              ? '720P'
              : 'SD');
      qualityMap.set(resLabel, (qualityMap.get(resLabel) ?? 0) + 1);
      for (const g of m.genres) {
        genreMap.set(g, (genreMap.get(g) ?? 0) + 1);
      }
    }
    for (const ep of episodes) {
      storageBytes += ep.fileSizeBytes;
    }

    const audit = buildAuditReport(db);

    const summary: DashboardSummary = {
      counts: {
        movies: movies.length,
        shows: shows.length,
        episodes: episodes.length,
        sets: sets.length,
        subtitles: subs.length,
        scrapedMovies: movies.filter((m) => m.scraped).length,
        scrapedShows: shows.filter((s) => s.scraped).length,
        moviesWithNfo: movies.filter((m) => m.hasNfo).length,
        moviesWithPoster: movies.filter((m) => Boolean(m.artwork.poster)).length,
        moviesWithFanart: movies.filter((m) => Boolean(m.artwork.fanart)).length,
        moviesWithClearlogo: movies.filter((m) => Boolean(m.artwork.clearlogo)).length,
        totalStorageBytes: storageBytes,
      },
      qualityDistribution: [...qualityMap.entries()].map(([label, count]) => ({ label, count })),
      genreDistribution: [...genreMap.entries()]
        .map(([genre, count]) => ({ genre, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
      sourceStatuses: providers.map((p) => ({
        id: p.id,
        name: p.name,
        enabled: p.enabled,
        configured: !p.requiresKey || Boolean(p.apiKey),
        mode:
          p.id === 'kodi-catalog'
            ? 'Built-in Catalog'
            : !p.requiresKey
              ? 'Keyless Live Ready'
              : p.apiKey
                ? 'Live API Ready'
                : p.useDemoFallback
                  ? 'Demo Catalog Ready'
                  : 'Key Required',
      })),
      recentActivity: db.getRecentActivity(15),
      healthScore: audit.summary.healthScore,
    };

    res.json(summary);
  });

  // ---- Movies ----
  router.get('/movies', (_req, res) => {
    res.json({ movies: db.listMovies() });
  });

  router.get('/movies/:id', (req, res) => {
    const m = db.getMovie(Number(req.params.id));
    if (!m) return res.status(404).json({ error: 'Movie not found' });
    res.json({ movie: m });
  });

  router.patch('/movies/:id', async (req, res) => {
    const id = Number(req.params.id);
    const { writeNfo = true, ...patch } = req.body as Partial<MovieRecord> & {
      writeNfo?: boolean;
      setName?: string | null;
    };
    const updated = db.updateMovie(id, patch);
    if (!updated) return res.status(404).json({ error: 'Movie not found' });
    if (writeNfo) {
      await scraper.writeMovieNfo(id);
    }
    res.json({ movie: db.getMovie(id) });
  });

  router.post('/movies/:id/artwork', async (req, res) => {
    const id = Number(req.params.id);
    const { kind, url, dataBase64 } = req.body as { kind: ArtworkKind; url?: string; dataBase64?: string };
    const movie = db.getMovie(id);
    if (!movie) return res.status(404).json({ error: 'Movie not found' });

    const src = db.getSource(movie.sourceId);
    const prefs = db.getSetting('preferences', DEFAULT_PREFERENCES);
    const artNaming = src?.artworkNaming ?? prefs.defaultArtworkNaming;
    const base = path.basename(movie.filePath, path.extname(movie.filePath));
    const ext = kind === 'clearlogo' || kind === 'clearart' || kind === 'disc' ? '.png' : '.jpg';
    const targetPath = path.join(movie.folderPath, artNaming === 'filename' ? `${base}-${kind}${ext}` : `${kind}${ext}`);

    try {
      if (dataBase64) {
        saveUploadedArtworkToDisk(targetPath, dataBase64);
      } else {
        const defaultRating = movie.ratings.find((r) => r.isDefault)?.value ?? movie.ratings[0]?.value ?? null;
        await saveArtworkToDisk(targetPath, url, {
          kind,
          title: movie.title,
          year: movie.year,
          tagline: movie.tagline,
          genres: movie.genres,
          rating: defaultRating,
        });
      }
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }

    const updated = db.updateMovie(id, { artwork: { ...movie.artwork, [kind]: targetPath } });
    db.logActivity('scrape', 'Update Artwork', `Saved ${kind} artwork for "${movie.title}"`, 'success');
    res.json({ movie: updated });
  });

  router.post('/movies/:id/edition', async (req, res) => {
    const id = Number(req.params.id);
    const movie = db.getMovie(id);
    if (!movie) return res.status(404).json({ error: 'Movie not found' });
    const edition = String((req.body as { edition?: string })?.edition ?? '').trim();
    const nextParsed = {
      ...movie.parsedInfo,
      edition: edition || null,
    };
    const updated = db.updateMovie(id, { parsedInfo: nextParsed });
    db.logActivity(
      'scan',
      'Tag Movie Edition',
      edition ? `Tagged "${movie.title}" as "${edition}"` : `Cleared edition tag for "${movie.title}"`,
      'info'
    );
    res.json({ movie: updated });
  });

  router.delete('/movies/:id', (req, res) => {
    const id = Number(req.params.id);
    const movie = db.getMovie(id);
    if (!movie) return res.status(404).json({ error: 'Movie not found' });

    const deleteFiles = req.query.deleteFiles === 'true' || req.body?.deleteFiles === true;
    const removedPaths: string[] = [];

    if (deleteFiles) {
      const source = db.getSource(movie.sourceId);
      const sourceRoot = source ? path.resolve(source.path) : null;
      const isSafePath = (p: string | null | undefined) => {
        if (!p) return false;
        const resolved = path.resolve(p);
        if (sourceRoot) return resolved.startsWith(sourceRoot + path.sep);
        return resolved.startsWith(path.resolve(movie.folderPath) + path.sep) || resolved === path.resolve(movie.filePath);
      };

      const siblingsInSameFolder = db
        .listMovies()
        .filter((m) => m.id !== movie.id && path.resolve(m.folderPath) === path.resolve(movie.folderPath));

      const candidates = [movie.filePath, movie.nfoPath, ...movie.subtitles.map((s) => s.filePath)];
      if (siblingsInSameFolder.length === 0) {
        candidates.push(...Object.values(movie.artwork));
      }

      for (const p of candidates) {
        if (p && isSafePath(p) && fs.existsSync(p)) {
          try {
            fs.unlinkSync(p);
            removedPaths.push(p);
          } catch {
            // ignore unlink errors on read-only paths
          }
        }
      }
    }

    db.deleteMovie(id);
    db.logActivity(
      'scan',
      deleteFiles ? 'Delete Movie & Files' : 'Remove Movie from Library',
      `${deleteFiles ? 'Deleted files and removed' : 'Removed'} "${movie.title}"`,
      deleteFiles ? 'warning' : 'info'
    );
    res.json({ ok: true, deletedFiles: deleteFiles, removedPaths });
  });

  router.post('/movies/batch', async (req, res) => {
    const { action, movieIds = [], payload } = req.body as {
      action: 'markWatched' | 'markUnwatched' | 'writeNfo' | 'addTag' | 'assignSet';
      movieIds: number[];
      payload?: { tag?: string; setName?: string | null };
    };
    let affected = 0;
    for (const id of movieIds) {
      const m = db.getMovie(id);
      if (!m) continue;
      if (action === 'markWatched') {
        db.updateMovie(id, { watched: true, playCount: Math.max(1, m.playCount), lastPlayed: new Date().toISOString().slice(0, 19).replace('T', ' ') });
        await scraper.writeMovieNfo(id);
        affected++;
      } else if (action === 'markUnwatched') {
        db.updateMovie(id, { watched: false, playCount: 0, lastPlayed: null });
        await scraper.writeMovieNfo(id);
        affected++;
      } else if (action === 'writeNfo') {
        await scraper.writeMovieNfo(id);
        affected++;
      } else if (action === 'addTag' && payload?.tag) {
        const tags = Array.from(new Set([...m.tags, payload.tag.trim()]));
        db.updateMovie(id, { tags });
        await scraper.writeMovieNfo(id);
        affected++;
      } else if (action === 'assignSet') {
        db.updateMovie(id, { setName: payload?.setName ?? null });
        await scraper.writeMovieNfo(id);
        affected++;
      }
    }
    res.json({ affected });
  });

  // ---- Movie Sets ----
  router.get('/sets', (_req, res) => {
    res.json({ sets: db.listMovieSets() });
  });

  router.post('/sets', async (req, res) => {
    const { name, overview = '', movieIds = [] } = req.body as { name: string; overview?: string; movieIds?: number[] };
    if (!name?.trim()) return res.status(400).json({ error: 'Set name required' });
    const id = db.upsertMovieSet(name, overview);
    for (const mid of movieIds) {
      db.updateMovie(mid, { setId: id });
      await scraper.writeMovieNfo(mid);
    }
    res.json({ set: db.listMovieSets().find((s) => s.id === id) });
  });

  router.patch('/sets/:id', async (req, res) => {
    const id = Number(req.params.id);
    const updated = db.updateMovieSet(id, req.body ?? {});
    if (!updated) return res.status(404).json({ error: 'Set not found' });
    for (const m of updated.movies) {
      await scraper.writeMovieNfo(m.id);
    }
    res.json({ set: updated });
  });

  router.delete('/sets/:id', (req, res) => {
    db.deleteMovieSet(Number(req.params.id));
    res.json({ ok: true });
  });

  // ---- TV Shows & Episodes ----
  router.get('/shows/tree', (_req, res) => {
    const shows = db.listTvShows();
    const tree = shows.map((show) => {
      const seasons = db.listSeasonsForShow(show.id);
      const episodes = db.listEpisodesForShow(show.id);
      const missingEpisodes = computeMissingEpisodesFromGuide(
        show.id,
        show.title,
        show.episodeGuide ?? [],
        episodes,
        seasons
      );
      return {
        show,
        seasons,
        episodes,
        missingEpisodes,
      };
    });
    res.json({ tree });
  });

  router.get('/shows', (_req, res) => {
    res.json({ shows: db.listTvShows() });
  });

  router.get('/shows/:id', (req, res) => {
    const showId = Number(req.params.id);
    const show = db.getTvShow(showId);
    if (!show) return res.status(404).json({ error: 'TV Show not found' });
    const seasons = db.listSeasonsForShow(showId);
    const episodes = db.listEpisodesForShow(showId);
    const missingEpisodes = computeMissingEpisodesFromGuide(
      show.id,
      show.title,
      show.episodeGuide ?? [],
      episodes,
      seasons
    );
    res.json({ show, seasons, episodes, missingEpisodes });
  });

  router.patch('/shows/:id', (req, res) => {
    const showId = Number(req.params.id);
    const { writeNfo = true, ...patch } = req.body ?? {};
    const updated = db.updateTvShow(showId, patch);
    if (!updated) return res.status(404).json({ error: 'TV Show not found' });
    if (writeNfo) {
      const xml = serializeTvShowNfo(updated, db.listSeasonsForShow(showId));
      const nfoPath = updated.nfoPath ?? path.join(updated.folderPath, 'tvshow.nfo');
      fs.writeFileSync(nfoPath, xml, 'utf-8');
      const rep = validateKodiNfoXml(xml);
      db.updateTvShow(showId, { nfoPath, hasNfo: true, nfoValid: rep.valid, nfoWarnings: rep.warnings });
    }
    res.json({ show: db.getTvShow(showId) });
  });

  router.post('/shows/:id/artwork', async (req, res) => {
    const showId = Number(req.params.id);
    const { kind, url, dataBase64 } = req.body as { kind: ArtworkKind; url?: string; dataBase64?: string };
    const show = db.getTvShow(showId);
    if (!show) return res.status(404).json({ error: 'TV Show not found' });

    const ext = kind === 'clearlogo' || kind === 'clearart' || kind === 'disc' ? '.png' : '.jpg';
    const targetPath = path.join(show.folderPath, `${kind}${ext}`);
    const defaultRating = show.ratings.find((r) => r.isDefault)?.value ?? show.ratings[0]?.value ?? null;

    try {
      if (dataBase64) {
        saveUploadedArtworkToDisk(targetPath, dataBase64);
      } else {
        await saveArtworkToDisk(targetPath, url, {
          kind,
          title: show.title,
          year: show.year,
          tagline: show.status,
          genres: show.genres,
          rating: defaultRating,
        });
      }
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }

    const updated = db.updateTvShow(showId, { artwork: { ...show.artwork, [kind]: targetPath } });
    db.logActivity('scrape', 'Update Artwork', `Saved ${kind} artwork for "${show.title}"`, 'success');
    res.json({ show: updated });
  });

  router.post('/seasons/:id/artwork', async (req, res) => {
    const seasonId = Number(req.params.id);
    const { kind = 'poster', url, dataBase64 } = req.body as {
      kind?: 'poster' | 'banner';
      url?: string;
      dataBase64?: string;
    };
    const season = db.getTvSeasonById(seasonId);
    if (!season) return res.status(404).json({ error: 'Season not found' });
    const show = db.getTvShow(season.showId);
    if (!show) return res.status(404).json({ error: 'TV Show not found' });

    const prefix =
      season.seasonNumber === 0 ? 'season-specials' : `season${String(season.seasonNumber).padStart(2, '0')}`;
    const fileName = kind === 'banner' ? `${prefix}-banner.jpg` : `${prefix}-poster.jpg`;
    const targetPath = path.join(show.folderPath, fileName);

    try {
      if (dataBase64) {
        saveUploadedArtworkToDisk(targetPath, dataBase64);
      } else {
        await saveArtworkToDisk(targetPath, url, {
          kind: kind === 'banner' ? 'banner' : 'poster',
          title: show.title,
          subtitle: season.name,
          year: show.year,
          genres: show.genres,
          seasonNumber: season.seasonNumber,
        });
      }
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }

    const updated = db.updateTvSeasonArtwork(seasonId, kind === 'banner' ? 'banner' : 'poster', targetPath);
    db.logActivity('scrape', 'Update Season Artwork', `Saved ${kind} for "${show.title}" ${season.name}`, 'success');
    res.json({ season: updated });
  });

  router.post('/shows/:id/episode-order', (req, res) => {
    const showId = Number(req.params.id);
    const show = db.getTvShow(showId);
    if (!show) return res.status(404).json({ error: 'TV Show not found' });

    const {
      mode = 'display',
      items = [],
    } = (req.body ?? {}) as {
      mode?: 'display' | 'canonical' | 'reset';
      items?: Array<{ episodeId: number; targetSeason: number; targetEpisode: number }>;
    };

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No episode order items provided' });
    }

    let updatedCount = 0;
    for (const item of items) {
      const ep = db.getTvEpisode(Number(item.episodeId));
      if (!ep || ep.showId !== showId) continue;

      const patch =
        mode === 'reset'
          ? {
              seasonNumber: ep.parsedInfo.seasonNumber ?? ep.seasonNumber,
              episodeNumber: ep.parsedInfo.episodeNumber ?? ep.episodeNumber,
              displaySeason: null,
              displayEpisode: null,
            }
          : mode === 'canonical'
            ? {
                seasonNumber: Math.max(0, Math.round(Number(item.targetSeason))),
                episodeNumber: Math.max(0, Math.round(Number(item.targetEpisode))),
                displaySeason: null,
                displayEpisode: null,
              }
            : {
                displaySeason: Math.max(0, Math.round(Number(item.targetSeason))),
                displayEpisode: Math.max(0, Math.round(Number(item.targetEpisode))),
              };

      const nextEp = db.updateTvEpisode(ep.id, patch);
      if (!nextEp) continue;

      if (mode === 'canonical' && nextEp.seasonNumber !== ep.seasonNumber) {
        const seasons = db.listSeasonsForShow(showId);
        if (!seasons.some((s) => s.seasonNumber === nextEp.seasonNumber)) {
          db.upsertTvSeason({
            showId,
            seasonNumber: nextEp.seasonNumber,
            name: nextEp.seasonNumber === 0 ? 'Specials' : `Season ${nextEp.seasonNumber}`,
            overview: '',
            folderPath: null,
            nfoPath: null,
            hasNfo: false,
            posterPath: null,
            bannerPath: null,
          });
        }
      }

      const base = path.basename(nextEp.filePath, path.extname(nextEp.filePath));
      const nfoPath = nextEp.nfoPath ?? path.join(nextEp.folderPath, `${base}.nfo`);
      const xml = serializeEpisodeNfo(nextEp);
      fs.mkdirSync(path.dirname(nfoPath), { recursive: true });
      fs.writeFileSync(nfoPath, xml, 'utf-8');
      const rep = validateKodiNfoXml(xml);
      db.updateTvEpisode(nextEp.id, {
        nfoPath,
        hasNfo: true,
        nfoValid: rep.valid,
        nfoWarnings: rep.warnings,
      });
      updatedCount++;
    }

    db.logActivity(
      'nfo',
      'Update Episode Order',
      `Updated ${updatedCount} episode NFO file(s) for "${show.title}" (${mode} mode)`,
      'success'
    );

    res.json({
      updatedCount,
      show: db.getTvShow(showId),
      seasons: db.listSeasonsForShow(showId),
      episodes: db.listEpisodesForShow(showId),
    });
  });

  router.patch('/episodes/:id', (req, res) => {
    const epId = Number(req.params.id);
    const { writeNfo = true, ...patch } = req.body ?? {};
    const updated = db.updateTvEpisode(epId, patch);
    if (!updated) return res.status(404).json({ error: 'Episode not found' });
    if (writeNfo) {
      const base = path.basename(updated.filePath, path.extname(updated.filePath));
      const nfoPath = updated.nfoPath ?? path.join(updated.folderPath, `${base}.nfo`);
      const xml = serializeEpisodeNfo(updated);
      fs.writeFileSync(nfoPath, xml, 'utf-8');
      const rep = validateKodiNfoXml(xml);
      db.updateTvEpisode(epId, { nfoPath, hasNfo: true, nfoValid: rep.valid, nfoWarnings: rep.warnings });
    }
    res.json({ episode: db.getTvEpisode(epId) });
  });

  router.post('/episodes/:id/artwork', async (req, res) => {
    const epId = Number(req.params.id);
    const { url, dataBase64 } = (req.body ?? {}) as { url?: string; dataBase64?: string };
    const ep = db.getTvEpisode(epId);
    if (!ep) return res.status(404).json({ error: 'Episode not found' });
    const show = db.getTvShow(ep.showId);

    const base = path.basename(ep.filePath, path.extname(ep.filePath));
    const targetPath = path.join(ep.folderPath, `${base}-thumb.jpg`);
    try {
      if (dataBase64) {
        saveUploadedArtworkToDisk(targetPath, dataBase64);
      } else {
        await saveArtworkToDisk(targetPath, url, {
          kind: 'thumb',
          title: ep.title,
          subtitle: show?.title ?? ep.showTitle,
          episodeCode: `S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}`,
          genres: show?.genres ?? [],
          rating: ep.ratings[0]?.value ?? null,
        });
      }
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }

    const updated = db.updateTvEpisode(epId, { thumbPath: targetPath });
    db.logActivity(
      'scrape',
      'Update Episode Thumb',
      `Saved thumbnail for ${ep.showTitle || 'Series'} S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}`,
      'success'
    );
    res.json({ episode: updated });
  });

  router.delete('/episodes/:id', (req, res) => {
    const epId = Number(req.params.id);
    const ep = db.getTvEpisode(epId);
    if (!ep) return res.status(404).json({ error: 'Episode not found' });

    const deleteFiles = req.query.deleteFiles === 'true' || req.body?.deleteFiles === true;
    const removedPaths: string[] = [];

    if (deleteFiles) {
      const show = db.getTvShow(ep.showId);
      const source = show ? db.getSource(show.sourceId) : null;
      const sourceRoot = source ? path.resolve(source.path) : path.resolve(ep.folderPath);
      const isSafe = (p: string | null | undefined) => {
        if (!p) return false;
        const r = path.resolve(p);
        return r.startsWith(sourceRoot + path.sep) || r === path.resolve(ep.filePath);
      };
      const candidates = [ep.filePath, ep.nfoPath, ep.thumbPath, ...ep.subtitles.map((s) => s.filePath)];
      for (const p of candidates) {
        if (p && isSafe(p) && fs.existsSync(p)) {
          try {
            fs.unlinkSync(p);
            removedPaths.push(p);
          } catch {
            // ignore unlink errors
          }
        }
      }
    }

    db.deleteTvEpisode(epId);
    db.logActivity(
      'scan',
      deleteFiles ? 'Delete Episode & Files' : 'Remove Episode from Library',
      `${deleteFiles ? 'Deleted files and removed' : 'Removed'} S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')} (${ep.title})`,
      deleteFiles ? 'warning' : 'info'
    );
    res.json({ ok: true, deletedFiles: deleteFiles, removedPaths });
  });

  router.post('/actors/thumb', async (req, res) => {
    const { mediaType, mediaId, actorName, url, dataBase64 } = (req.body ?? {}) as {
      mediaType: 'movie' | 'tvshow' | 'episode';
      mediaId: number;
      actorName: string;
      url?: string;
      dataBase64?: string;
    };
    if (!actorName?.trim() || !mediaId || !mediaType) {
      return res.status(400).json({ error: 'mediaType, mediaId, and actorName are required' });
    }

    let folderPath = '';
    if (mediaType === 'movie') {
      const m = db.getMovie(Number(mediaId));
      if (!m) return res.status(404).json({ error: 'Movie not found' });
      folderPath = m.folderPath;
    } else if (mediaType === 'tvshow') {
      const s = db.getTvShow(Number(mediaId));
      if (!s) return res.status(404).json({ error: 'TV Show not found' });
      folderPath = s.folderPath;
    } else {
      const ep = db.getTvEpisode(Number(mediaId));
      if (!ep) return res.status(404).json({ error: 'Episode not found' });
      const s = db.getTvShow(ep.showId);
      folderPath = s?.folderPath ?? ep.folderPath;
    }

    try {
      const thumbPath = await saveActorThumbToDisk(folderPath, actorName, { url, dataBase64 });
      res.json({ thumbPath });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.post('/episodes/batch', (req, res) => {
    const { action, episodeIds = [] } = req.body as { action: 'markWatched' | 'markUnwatched' | 'writeNfo'; episodeIds: number[] };
    let affected = 0;
    for (const id of episodeIds) {
      const ep = db.getTvEpisode(id);
      if (!ep) continue;
      if (action === 'markWatched') {
        db.updateTvEpisode(id, { watched: true, playCount: Math.max(1, ep.playCount), lastPlayed: new Date().toISOString().slice(0, 19).replace('T', ' ') });
      } else if (action === 'markUnwatched') {
        db.updateTvEpisode(id, { watched: false, playCount: 0, lastPlayed: null });
      }
      const latest = db.getTvEpisode(id)!;
      const base = path.basename(latest.filePath, path.extname(latest.filePath));
      const nfoPath = latest.nfoPath ?? path.join(latest.folderPath, `${base}.nfo`);
      const xml = serializeEpisodeNfo(latest);
      fs.writeFileSync(nfoPath, xml, 'utf-8');
      const rep = validateKodiNfoXml(xml);
      db.updateTvEpisode(id, { nfoPath, hasNfo: true, nfoValid: rep.valid, nfoWarnings: rep.warnings });
      affected++;
    }
    res.json({ affected });
  });

  // ---- Audit & Exports ----
  router.get('/audit', (_req, res) => {
    res.json(buildAuditReport(db));
  });

  router.get('/export/json', (_req, res) => {
    res.setHeader('Content-Disposition', 'attachment; filename="kodivault-library.json"');
    res.json(kodi.exportLibraryJson());
  });

  router.get('/export/csv', (_req, res) => {
    const movies = db.listMovies();
    const header = ['Title', 'Year', 'IMDb ID', 'TMDb ID', 'IMDb Rating', 'Resolution', 'Codec', 'Has NFO', 'Subtitles', 'Watched', 'Path'];
    const rows = movies.map((m) => {
      const imdb = m.ratings.find((r) => r.source === 'imdb')?.value ?? '';
      const resText = m.parsedInfo.resolution || `${m.streamDetails.video[0]?.height ?? ''}p`;
      const codec = m.parsedInfo.videoCodec || m.streamDetails.video[0]?.codec || '';
      const subs = m.subtitles.map((s) => s.language).join('|');
      return [
        m.title,
        m.year ?? '',
        m.uniqueIds.imdb ?? '',
        m.uniqueIds.tmdb ?? '',
        imdb,
        resText,
        codec,
        m.hasNfo ? 'Yes' : 'No',
        subs,
        m.watched ? 'Yes' : 'No',
        m.filePath,
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(',');
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="kodivault-movies.csv"');
    res.send([header.join(','), ...rows].join('\n'));
  });

  router.post('/export/smartplaylist', (req, res) => {
    const xml = kodi.generateSmartPlaylistXml(req.body ?? { name: 'Top Rated 4K Movies', type: 'movies' });
    res.json({ xml });
  });

  router.get('/export/sources-xml', (_req, res) => {
    res.json({ xml: kodi.generateSourcesXml() });
  });

  return router;
}

export function buildAuditReport(db: MediaDatabase): LibraryAuditReport {
  const prefs = db.getSetting('preferences', DEFAULT_PREFERENCES);
  const prefSubLangs = prefs.preferredSubtitleLanguages.length > 0 ? prefs.preferredSubtitleLanguages : ['en'];

  const movies = db.listMovies();
  const shows = db.listTvShows();
  const episodes = db.listAllEpisodes();
  const sets = db.listMovieSets();
  const subs = db.listAllSubtitles();

  const unscrapedMovies = movies.filter((m) => !m.scraped).map((m) => ({ id: m.id, title: m.title, filePath: m.filePath }));
  const unscrapedShows = shows.filter((s) => !s.scraped).map((s) => ({ id: s.id, title: s.title, folderPath: s.folderPath }));
  const missingMovieNfo = movies.filter((m) => !m.hasNfo).map((m) => ({ id: m.id, title: m.title, filePath: m.filePath }));
  const missingEpisodeNfo = episodes
    .filter((e) => !e.hasNfo)
    .map((e) => ({
      id: e.id,
      showId: e.showId,
      showTitle: e.showTitle || 'Series',
      code: `S${String(e.seasonNumber).padStart(2, '0')}E${String(e.episodeNumber).padStart(2, '0')}`,
      title: e.title,
    }));

  const missingArtwork: LibraryAuditReport['issues']['missingArtwork'] = [];
  for (const m of movies) {
    const missing = (['poster', 'fanart', 'clearlogo'] as ArtworkKind[]).filter((k) => !m.artwork[k]);
    if (missing.length > 0) missingArtwork.push({ mediaType: 'movie', id: m.id, title: m.title, missing });
  }
  for (const s of shows) {
    const missing = (['poster', 'fanart', 'banner'] as ArtworkKind[]).filter((k) => !s.artwork[k]);
    if (missing.length > 0) missingArtwork.push({ mediaType: 'tvshow', id: s.id, title: s.title, missing });
  }

  const missingSubtitles: LibraryAuditReport['issues']['missingSubtitles'] = [];
  for (const m of movies) {
    const have = new Set(m.subtitles.map((s) => s.language));
    const missingLanguages = prefSubLangs.filter((l) => !have.has(l));
    if (missingLanguages.length > 0) missingSubtitles.push({ mediaType: 'movie', id: m.id, title: m.title, missingLanguages });
  }
  for (const e of episodes) {
    const have = new Set(e.subtitles.map((s) => s.language));
    const missingLanguages = prefSubLangs.filter((l) => !have.has(l));
    if (missingLanguages.length > 0) {
      missingSubtitles.push({
        mediaType: 'episode',
        id: e.id,
        showId: e.showId,
        title: `${e.showTitle || 'Series'} S${String(e.seasonNumber).padStart(2, '0')}E${String(e.episodeNumber).padStart(2, '0')}`,
        missingLanguages,
      });
    }
  }

  // Duplicate Movies (by IMDb ID or normalized title + year, keeping distinct tagged editions separate)
  const movieGroups = new Map<string, { reason: string; items: MovieRecord[] }>();
  for (const m of movies) {
    const editionSuffix = m.parsedInfo.edition?.trim()
      ? `::edition:${m.parsedInfo.edition.trim().toLowerCase()}`
      : '';
    const baseKey = m.uniqueIds.imdb
      ? `imdb:${m.uniqueIds.imdb}`
      : `title:${m.title.toLowerCase().trim()}::${m.year ?? ''}`;
    const key = `${baseKey}${editionSuffix}`;
    const reason = m.uniqueIds.imdb ? `Same IMDb ID (${m.uniqueIds.imdb})` : 'Same Title & Year';
    const g = movieGroups.get(key) ?? { reason, items: [] };
    g.items.push(m);
    movieGroups.set(key, g);
  }
  const duplicateMovies = [...movieGroups.entries()]
    .filter(([, g]) => g.items.length > 1)
    .map(([key, g]) => ({
      key,
      reason: g.reason,
      items: g.items.map((m) => ({
        id: m.id,
        title: m.title,
        year: m.year,
        filePath: m.filePath,
        resolution: m.parsedInfo.resolution ?? `${m.streamDetails.video[0]?.height ?? ''}p`,
      })),
    }));

  // Duplicate Episodes
  const epGroups = new Map<string, typeof episodes>();
  for (const e of episodes) {
    const key = `${e.showId}:S${e.seasonNumber}E${e.episodeNumber}`;
    const list = epGroups.get(key) ?? [];
    list.push(e);
    epGroups.set(key, list);
  }
  const duplicateEpisodes = [...epGroups.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => ({
      key,
      showTitle: list[0].showTitle || 'Series',
      season: list[0].seasonNumber,
      episode: list[0].episodeNumber,
      items: list.map((e) => ({ id: e.id, title: e.title, filePath: e.filePath })),
    }));

  const invalidNfoFiles: LibraryAuditReport['issues']['invalidNfoFiles'] = [
    ...movies.filter((m) => m.hasNfo && (!m.nfoValid || m.nfoWarnings.length > 0)).map((m) => ({
      mediaType: 'movie' as const,
      id: m.id,
      title: m.title,
      warnings: m.nfoWarnings.length > 0 ? m.nfoWarnings : ['Invalid NFO XML'],
    })),
    ...shows.filter((s) => s.hasNfo && (!s.nfoValid || s.nfoWarnings.length > 0)).map((s) => ({
      mediaType: 'tvshow' as const,
      id: s.id,
      title: s.title,
      warnings: s.nfoWarnings.length > 0 ? s.nfoWarnings : ['Invalid tvshow.nfo XML'],
    })),
    ...episodes.filter((e) => e.hasNfo && (!e.nfoValid || e.nfoWarnings.length > 0)).map((e) => ({
      mediaType: 'episode' as const,
      id: e.id,
      showId: e.showId,
      title: `${e.showTitle || 'Series'} S${String(e.seasonNumber).padStart(2, '0')}E${String(e.episodeNumber).padStart(2, '0')} — ${e.title}`,
      warnings: e.nfoWarnings.length > 0 ? e.nfoWarnings : ['Invalid episode NFO XML'],
    })),
  ];

  const lowResolutionItems: LibraryAuditReport['issues']['lowResolutionItems'] = [];
  for (const m of movies) {
    const h = m.streamDetails.video[0]?.height ?? 1080;
    if (h < 1080) {
      lowResolutionItems.push({
        mediaType: 'movie',
        id: m.id,
        title: m.title,
        resolution: m.parsedInfo.resolution || `${h}p`,
        filePath: m.filePath,
      });
    }
  }

  const missingEpisodes: MissingEpisodeRecord[] = [];
  for (const show of shows) {
    if (!show.episodeGuide?.length) continue;
    const showSeasons = db.listSeasonsForShow(show.id);
    const showEpisodes = episodes.filter((e) => e.showId === show.id);
    missingEpisodes.push(
      ...computeMissingEpisodesFromGuide(show.id, show.title, show.episodeGuide, showEpisodes, showSeasons)
    );
  }

  // Compute health score (0-100)
  const totalItems = Math.max(1, movies.length + shows.length + episodes.length);
  const checks = [
    unscrapedMovies.length + unscrapedShows.length,
    missingMovieNfo.length + missingEpisodeNfo.length,
    missingArtwork.length,
    Math.round(missingSubtitles.length * 0.5),
  ];
  const penalty = checks.reduce((acc, c) => acc + c, 0);
  const healthScore = Math.max(12, Math.min(100, Math.round(100 - (penalty / (totalItems * 2.5)) * 100)));

  return {
    summary: {
      totalMovies: movies.length,
      totalShows: shows.length,
      totalEpisodes: episodes.length,
      totalSets: sets.length,
      totalSubtitles: subs.length,
      healthScore,
    },
    issues: {
      unscrapedMovies,
      unscrapedShows,
      missingMovieNfo,
      missingEpisodeNfo,
      missingArtwork,
      missingSubtitles,
      duplicateMovies,
      duplicateEpisodes,
      invalidNfoFiles,
      lowResolutionItems,
      missingEpisodes,
    },
  };
}
