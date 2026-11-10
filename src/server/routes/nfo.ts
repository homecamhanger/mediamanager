import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_PREFERENCES, MediaDatabase } from '../db/database.js';
import {
  parseEpisodeNfoXml,
  parseMovieNfoXml,
  parseTvShowNfoXml,
  serializeEpisodeNfo,
  serializeMovieNfo,
  serializeSeasonNfo,
  serializeTvShowNfo,
  validateKodiNfoXml,
} from '../nfo/kodiNfo.js';
import { ScraperEngine } from '../scrapers/scraperEngine.js';

export function createNfoRouter(db: MediaDatabase): Router {
  const router = Router();
  const scraper = new ScraperEngine(db);

  router.get('/list', (_req, res) => {
    const movies = db.listMovies().map((m) => ({
      mediaType: 'movie' as const,
      mediaId: m.id,
      title: `${m.title}${m.year ? ` (${m.year})` : ''}`,
      nfoPath: m.nfoPath,
      hasNfo: m.hasNfo,
      nfoValid: m.nfoValid,
      warnings: m.nfoWarnings,
    }));
    const shows = db.listTvShows().map((s) => ({
      mediaType: 'tvshow' as const,
      mediaId: s.id,
      title: `${s.title}${s.year ? ` (${s.year})` : ''}`,
      nfoPath: s.nfoPath,
      hasNfo: s.hasNfo,
      nfoValid: s.nfoValid,
      warnings: s.nfoWarnings,
    }));
    const episodes = db.listAllEpisodes().map((e) => ({
      mediaType: 'episode' as const,
      mediaId: e.id,
      title: `${e.showTitle || 'Series'} S${String(e.seasonNumber).padStart(2, '0')}E${String(e.episodeNumber).padStart(2, '0')} - ${e.title}`,
      nfoPath: e.nfoPath,
      hasNfo: e.hasNfo,
      nfoValid: e.nfoValid,
      warnings: e.nfoWarnings,
    }));
    res.json({ items: [...movies, ...shows, ...episodes] });
  });

  router.get('/read', (req, res) => {
    const mediaType = String(req.query.mediaType ?? 'movie');
    const mediaId = Number(req.query.mediaId);
    if (!mediaId) return res.status(400).json({ error: 'Invalid mediaId' });

    let nfoPath: string | null = null;
    let xml = '';
    let existsOnDisk = false;

    if (mediaType === 'movie') {
      const m = db.getMovie(mediaId);
      if (!m) return res.status(404).json({ error: 'Movie not found' });
      const prefs = db.getSetting('preferences', DEFAULT_PREFERENCES);
      const src = db.getSource(m.sourceId);
      const naming = src?.nfoNaming ?? prefs.defaultNfoNaming;
      const base = path.basename(m.filePath, path.extname(m.filePath));
      nfoPath = m.nfoPath ?? path.join(m.folderPath, naming === 'filename.nfo' ? `${base}.nfo` : 'movie.nfo');
      if (m.nfoPath && fs.existsSync(m.nfoPath)) {
        xml = fs.readFileSync(m.nfoPath, 'utf-8');
        existsOnDisk = true;
      } else {
        xml = serializeMovieNfo(m);
      }
    } else if (mediaType === 'tvshow') {
      const s = db.getTvShow(mediaId);
      if (!s) return res.status(404).json({ error: 'TV Show not found' });
      nfoPath = s.nfoPath ?? path.join(s.folderPath, 'tvshow.nfo');
      if (fs.existsSync(nfoPath)) {
        xml = fs.readFileSync(nfoPath, 'utf-8');
        existsOnDisk = true;
      } else {
        xml = serializeTvShowNfo(s, db.listSeasonsForShow(s.id));
      }
    } else if (mediaType === 'episode') {
      const ep = db.getTvEpisode(mediaId);
      if (!ep) return res.status(404).json({ error: 'Episode not found' });
      const base = path.basename(ep.filePath, path.extname(ep.filePath));
      nfoPath = ep.nfoPath ?? path.join(ep.folderPath, `${base}.nfo`);
      if (fs.existsSync(nfoPath)) {
        xml = fs.readFileSync(nfoPath, 'utf-8');
        existsOnDisk = true;
      } else {
        xml = serializeEpisodeNfo(ep);
      }
    } else {
      return res.status(400).json({ error: 'Unsupported mediaType' });
    }

    const report = validateKodiNfoXml(xml);
    res.json({ nfoPath, existsOnDisk, xml, validation: report });
  });

  router.post('/validate', (req, res) => {
    const xml = String(req.body?.xml ?? '');
    res.json(validateKodiNfoXml(xml));
  });

  router.put('/save', (req, res) => {
    const { mediaType, mediaId, xml } = req.body as { mediaType: 'movie' | 'tvshow' | 'episode'; mediaId: number; xml: string };
    const report = validateKodiNfoXml(xml);
    if (!report.valid) {
      return res.status(400).json({ error: 'Invalid NFO XML', validation: report });
    }

    if (mediaType === 'movie') {
      const m = db.getMovie(mediaId);
      if (!m) return res.status(404).json({ error: 'Movie not found' });
      const base = path.basename(m.filePath, path.extname(m.filePath));
      const src = db.getSource(m.sourceId);
      const prefs = db.getSetting('preferences', DEFAULT_PREFERENCES);
      const nfoPath = m.nfoPath ?? path.join(m.folderPath, (src?.nfoNaming ?? prefs.defaultNfoNaming) === 'filename.nfo' ? `${base}.nfo` : 'movie.nfo');
      fs.mkdirSync(path.dirname(nfoPath), { recursive: true });
      fs.writeFileSync(nfoPath, xml, 'utf-8');
      const parsed = parseMovieNfoXml(xml);
      const updated = db.updateMovie(mediaId, {
        nfoPath,
        hasNfo: true,
        nfoValid: report.valid,
        nfoWarnings: report.warnings,
        ...(parsed
          ? {
              title: parsed.title ?? m.title,
              originalTitle: parsed.originalTitle ?? m.originalTitle,
              sortTitle: parsed.sortTitle ?? m.sortTitle,
              year: parsed.year ?? m.year,
              premiered: parsed.premiered ?? m.premiered,
              tagline: parsed.tagline ?? m.tagline,
              plot: parsed.plot ?? m.plot,
              outline: parsed.outline ?? m.outline,
              runtimeMinutes: parsed.runtimeMinutes ?? m.runtimeMinutes,
              mpaa: parsed.mpaa ?? m.mpaa,
              country: parsed.country ?? m.country,
              studios: parsed.studios ?? m.studios,
              genres: parsed.genres ?? m.genres,
              tags: parsed.tags ?? m.tags,
              directors: parsed.directors ?? m.directors,
              writers: parsed.writers ?? m.writers,
              actors: parsed.actors?.length ? parsed.actors : m.actors,
              trailerUrl: parsed.trailerUrl ?? m.trailerUrl,
              setName: parsed.setName ?? undefined,
              setOverview: parsed.setOverview ?? undefined,
              uniqueIds: parsed.uniqueIds ?? m.uniqueIds,
              ratings: parsed.ratings?.length ? parsed.ratings : m.ratings,
              userRating: parsed.userRating ?? m.userRating,
              playCount: parsed.playCount ?? m.playCount,
              watched: parsed.watched ?? m.watched,
            }
          : {}),
      });
      db.logActivity('nfo', 'Save Movie NFO', `Saved ${path.basename(nfoPath)} for "${m.title}"`, 'success');
      return res.json({ movie: updated, nfoPath, validation: report });
    }

    if (mediaType === 'tvshow') {
      const s = db.getTvShow(mediaId);
      if (!s) return res.status(404).json({ error: 'TV Show not found' });
      const nfoPath = s.nfoPath ?? path.join(s.folderPath, 'tvshow.nfo');
      fs.writeFileSync(nfoPath, xml, 'utf-8');
      const parsed = parseTvShowNfoXml(xml);
      const updated = db.updateTvShow(mediaId, {
        nfoPath,
        hasNfo: true,
        nfoValid: report.valid,
        nfoWarnings: report.warnings,
        ...(parsed
          ? {
              title: parsed.title ?? s.title,
              originalTitle: parsed.originalTitle ?? s.originalTitle,
              sortTitle: parsed.sortTitle ?? s.sortTitle,
              year: parsed.year ?? s.year,
              premiered: parsed.premiered ?? s.premiered,
              status: parsed.status ?? s.status,
              plot: parsed.plot ?? s.plot,
              mpaa: parsed.mpaa ?? s.mpaa,
              studio: parsed.studio ?? s.studio,
              genres: parsed.genres ?? s.genres,
              tags: parsed.tags ?? s.tags,
              actors: parsed.actors?.length ? parsed.actors : s.actors,
              uniqueIds: parsed.uniqueIds ?? s.uniqueIds,
              ratings: parsed.ratings?.length ? parsed.ratings : s.ratings,
              userRating: parsed.userRating ?? s.userRating,
            }
          : {}),
      });
      db.logActivity('nfo', 'Save Show NFO', `Saved tvshow.nfo for "${s.title}"`, 'success');
      return res.json({ show: updated, nfoPath, validation: report });
    }

    if (mediaType === 'episode') {
      const ep = db.getTvEpisode(mediaId);
      if (!ep) return res.status(404).json({ error: 'Episode not found' });
      const base = path.basename(ep.filePath, path.extname(ep.filePath));
      const nfoPath = ep.nfoPath ?? path.join(ep.folderPath, `${base}.nfo`);
      fs.writeFileSync(nfoPath, xml, 'utf-8');
      const parsed = parseEpisodeNfoXml(xml)[0];
      const updated = db.updateTvEpisode(mediaId, {
        nfoPath,
        hasNfo: true,
        nfoValid: report.valid,
        nfoWarnings: report.warnings,
        ...(parsed
          ? {
              title: parsed.title ?? ep.title,
              seasonNumber: parsed.seasonNumber ?? ep.seasonNumber,
              episodeNumber: parsed.episodeNumber ?? ep.episodeNumber,
              displaySeason: parsed.displaySeason ?? null,
              displayEpisode: parsed.displayEpisode ?? null,
              plot: parsed.plot ?? ep.plot,
              aired: parsed.aired ?? ep.aired,
              runtimeMinutes: parsed.runtimeMinutes ?? ep.runtimeMinutes,
              directors: parsed.directors ?? ep.directors,
              writers: parsed.writers ?? ep.writers,
              ratings: parsed.ratings?.length ? parsed.ratings : ep.ratings,
              uniqueIds: parsed.uniqueIds ?? ep.uniqueIds,
              userRating: parsed.userRating ?? ep.userRating,
              playCount: parsed.playCount ?? ep.playCount,
              watched: parsed.watched ?? ep.watched,
            }
          : {}),
      });
      db.logActivity('nfo', 'Save Episode NFO', `Saved ${path.basename(nfoPath)}`, 'success');
      return res.json({ episode: updated, nfoPath, validation: report });
    }

    return res.status(400).json({ error: 'Unsupported mediaType' });
  });

  router.post('/regenerate', async (req, res) => {
    const { scope = 'all', movieIds = [], showIds = [], episodeIds = [] } = req.body ?? {};
    let written = 0;

    if (scope === 'all' || movieIds.length > 0) {
      const targets = scope === 'all' ? db.listMovies().map((m) => m.id) : (movieIds as number[]);
      for (const id of targets) {
        const u = await scraper.writeMovieNfo(id);
        if (u) written++;
      }
    }

    if (scope === 'all' || showIds.length > 0) {
      const targets = scope === 'all' ? db.listTvShows() : (showIds as number[]).map((id) => db.getTvShow(id)).filter(Boolean);
      for (const show of targets) {
        if (!show) continue;
        const seasons = db.listSeasonsForShow(show.id);
        const xml = serializeTvShowNfo(show, seasons);
        const showNfoPath = path.join(show.folderPath, 'tvshow.nfo');
        fs.writeFileSync(showNfoPath, xml, 'utf-8');
        const rep = validateKodiNfoXml(xml);
        db.updateTvShow(show.id, { nfoPath: showNfoPath, hasNfo: true, nfoValid: rep.valid, nfoWarnings: rep.warnings });
        written++;

        for (const s of seasons) {
          if (s.folderPath) {
            const snPath = path.join(s.folderPath, 'season.nfo');
            fs.writeFileSync(snPath, serializeSeasonNfo(s), 'utf-8');
            db.upsertTvSeason({ ...s, nfoPath: snPath, hasNfo: true });
            written++;
          }
        }
        for (const ep of db.listEpisodesForShow(show.id)) {
          const base = path.basename(ep.filePath, path.extname(ep.filePath));
          const epNfo = path.join(ep.folderPath, `${base}.nfo`);
          const epXml = serializeEpisodeNfo(ep);
          fs.writeFileSync(epNfo, epXml, 'utf-8');
          const epRep = validateKodiNfoXml(epXml);
          db.updateTvEpisode(ep.id, { nfoPath: epNfo, hasNfo: true, nfoValid: epRep.valid, nfoWarnings: epRep.warnings });
          written++;
        }
      }
    }

    if (episodeIds.length > 0) {
      for (const eid of episodeIds as number[]) {
        const ep = db.getTvEpisode(eid);
        if (!ep) continue;
        const base = path.basename(ep.filePath, path.extname(ep.filePath));
        const epNfo = path.join(ep.folderPath, `${base}.nfo`);
        const epXml = serializeEpisodeNfo(ep);
        fs.writeFileSync(epNfo, epXml, 'utf-8');
        const epRep = validateKodiNfoXml(epXml);
        db.updateTvEpisode(ep.id, { nfoPath: epNfo, hasNfo: true, nfoValid: epRep.valid, nfoWarnings: epRep.warnings });
        written++;
      }
    }

    db.logActivity('nfo', 'Regenerate NFOs', `Generated/updated ${written} Kodi NFO files`, 'success');
    res.json({ written });
  });

  return router;
}
