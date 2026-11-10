import { Router } from 'express';
import type { SubtitleSearchResult } from '../../shared/types.js';
import { DEFAULT_PREFERENCES, DEFAULT_SUBTITLE_CONFIG, MediaDatabase, SubtitleConfig } from '../db/database.js';
import { SubtitleEngine } from '../subtitles/subtitleEngine.js';

export function createSubtitlesRouter(db: MediaDatabase): Router {
  const router = Router();
  const engine = new SubtitleEngine(db);

  router.get('/', (_req, res) => {
    const subs = db.listAllSubtitles();
    const moviesById = new Map(db.listMovies().map((m) => [m.id, m]));
    const episodesById = new Map(db.listAllEpisodes().map((e) => [e.id, e]));
    const showsById = new Map(db.listTvShows().map((s) => [s.id, s]));

    const enriched = subs.map((s) => {
      if (s.mediaType === 'movie') {
        const m = moviesById.get(s.mediaId);
        return { ...s, mediaTitle: m ? `${m.title}${m.year ? ` (${m.year})` : ''}` : 'Unknown Movie' };
      }
      const ep = episodesById.get(s.mediaId);
      const show = ep ? showsById.get(ep.showId) : null;
      return {
        ...s,
        mediaTitle: ep
          ? `${show?.title || ep.showTitle || 'Series'} S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')} - ${ep.title}`
          : 'Unknown Episode',
      };
    });
    res.json({ subtitles: enriched });
  });

  router.get('/config', (_req, res) => {
    res.json(engine.getConfig());
  });

  router.put('/config', (req, res) => {
    const next = { ...DEFAULT_SUBTITLE_CONFIG, ...(req.body as Partial<SubtitleConfig>) };
    db.setSetting('subtitle_config', next);
    res.json(next);
  });

  router.post('/search', async (req, res) => {
    const { mediaType, mediaId, languages = ['en'], query, forcedOnly = false } = req.body as {
      mediaType: 'movie' | 'episode';
      mediaId: number;
      languages?: string[];
      query?: string;
      forcedOnly?: boolean;
    };
    const results = await engine.searchSubtitles({ mediaType, mediaId, languages, query, forcedOnly });
    res.json({ results });
  });

  router.post('/download', async (req, res) => {
    const { mediaType, mediaId, candidate } = req.body as {
      mediaType: 'movie' | 'episode';
      mediaId: number;
      candidate: SubtitleSearchResult;
    };
    try {
      const saved = await engine.downloadSubtitle({ mediaType, mediaId, candidate });
      res.json({ subtitle: saved });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.post('/upload', (req, res) => {
    try {
      const { mediaType, mediaId, fileName, contentText, contentBase64, language, forced, sdh } = req.body as {
        mediaType: 'movie' | 'episode';
        mediaId: number;
        fileName: string;
        contentText?: string;
        contentBase64?: string;
        language?: string;
        forced?: boolean;
        sdh?: boolean;
      };
      if (!mediaType || !mediaId || !fileName) {
        return res.status(400).json({ error: 'mediaType, mediaId, and fileName are required' });
      }
      const saved = engine.uploadSubtitle({
        mediaType,
        mediaId: Number(mediaId),
        fileName,
        contentText,
        contentBase64,
        language,
        forced,
        sdh,
      });
      res.json({ subtitle: saved });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.post('/batch-missing', async (req, res) => {
    const prefs = db.getSetting('preferences', DEFAULT_PREFERENCES);
    const {
      languages = prefs.preferredSubtitleLanguages,
      movieIds,
      episodeIds,
    } = (req.body ?? {}) as { languages?: string[]; movieIds?: number[]; episodeIds?: number[] };

    let downloaded = 0;

    const movies = movieIds ? db.listMovies().filter((m) => movieIds.includes(m.id)) : db.listMovies();
    for (const m of movies) {
      for (const lang of languages) {
        if (m.subtitles.some((s) => s.language === lang && !s.forced)) continue;
        const found = await engine.searchSubtitles({ mediaType: 'movie', mediaId: m.id, languages: [lang] });
        const best = found.find((f) => !f.forced) ?? found[0];
        if (best) {
          await engine.downloadSubtitle({ mediaType: 'movie', mediaId: m.id, candidate: best });
          downloaded++;
        }
      }
    }

    const episodes = episodeIds ? db.listAllEpisodes().filter((e) => episodeIds.includes(e.id)) : db.listAllEpisodes();
    for (const ep of episodes) {
      for (const lang of languages) {
        if (ep.subtitles.some((s) => s.language === lang && !s.forced)) continue;
        const found = await engine.searchSubtitles({ mediaType: 'episode', mediaId: ep.id, languages: [lang] });
        const best = found.find((f) => !f.forced) ?? found[0];
        if (best) {
          await engine.downloadSubtitle({ mediaType: 'episode', mediaId: ep.id, candidate: best });
          downloaded++;
        }
      }
    }

    res.json({ downloaded });
  });

  router.get('/:id/preview', (req, res) => {
    try {
      res.json(engine.readSubtitlePreview(Number(req.params.id)));
    } catch (err) {
      res.status(404).json({ error: (err as Error).message });
    }
  });

  router.post('/:id/transform', (req, res) => {
    try {
      const updated = engine.transformSubtitle(Number(req.params.id), req.body ?? {});
      res.json({ subtitle: updated });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.delete('/:id', (req, res) => {
    engine.deleteSubtitleFile(Number(req.params.id));
    res.json({ ok: true });
  });

  return router;
}
