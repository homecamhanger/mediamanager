import { Router } from 'express';
import type {
  ArtworkKind,
  ScrapedMetadataBundle,
  ScraperFieldMapping,
  ScraperProviderConfig,
  ScraperProviderId,
} from '../../shared/types.js';
import { DEFAULT_FIELD_MAPPING, DEFAULT_SCRAPER_PROVIDERS, MediaDatabase } from '../db/database.js';
import { ScraperEngine } from '../scrapers/scraperEngine.js';

export function createScrapersRouter(db: MediaDatabase): Router {
  const router = Router();
  const scraper = new ScraperEngine(db);

  router.get('/config', (_req, res) => {
    res.json({
      providers: scraper.getProviders(),
      fieldMapping: scraper.getFieldMapping(),
    });
  });

  router.put('/config', (req, res) => {
    const { providers, fieldMapping } = req.body as {
      providers?: ScraperProviderConfig[];
      fieldMapping?: ScraperFieldMapping;
    };
    if (providers) db.setSetting('scraper_providers', providers);
    if (fieldMapping) db.setSetting('scraper_field_mapping', fieldMapping);
    db.logActivity('scrape', 'Update Scraper Config', 'Saved scraper provider settings & field priority profile', 'info');
    res.json({
      providers: db.getSetting('scraper_providers', DEFAULT_SCRAPER_PROVIDERS),
      fieldMapping: db.getSetting('scraper_field_mapping', DEFAULT_FIELD_MAPPING),
    });
  });

  router.post('/search', async (req, res) => {
    const { query, mediaKind = 'movie', year = null, providerIds } = req.body as {
      query: string;
      mediaKind?: 'movie' | 'tvshow';
      year?: number | null;
      providerIds?: ScraperProviderId[];
    };
    const results = await scraper.search({ query, mediaKind, year, providerIds });
    res.json({ results });
  });

  router.post('/bundle', async (req, res) => {
    const { externalId, provider, mediaKind } = req.body as {
      externalId: string;
      provider: ScraperProviderId;
      mediaKind: 'movie' | 'tvshow';
    };
    const bundle = await scraper.fetchBundle({ externalId, provider, mediaKind });
    if (!bundle) return res.status(404).json({ error: 'Scraper metadata bundle not found' });
    res.json({ bundle });
  });

  router.post('/apply/movie/:id', async (req, res) => {
    const movieId = Number(req.params.id);
    const { bundle, selectedArtwork } = req.body as {
      bundle: ScrapedMetadataBundle;
      selectedArtwork?: Partial<Record<ArtworkKind, string>>;
    };
    const updated = await scraper.applyToMovie(movieId, bundle, selectedArtwork);
    if (!updated) return res.status(404).json({ error: 'Movie not found' });
    res.json({ movie: updated });
  });

  router.post('/apply/show/:id', async (req, res) => {
    const showId = Number(req.params.id);
    const { bundle } = req.body as { bundle: ScrapedMetadataBundle };
    const updated = await scraper.applyToTvShow(showId, bundle);
    if (!updated) return res.status(404).json({ error: 'TV Show not found' });
    res.json({ show: updated });
  });

  router.post('/batch', async (req, res) => {
    const { movieIds, showIds, onlyUnscraped = false } = (req.body ?? {}) as {
      movieIds?: number[];
      showIds?: number[];
      onlyUnscraped?: boolean;
    };

    const scopedMoviesOnly = Array.isArray(movieIds) && showIds === undefined;
    const scopedShowsOnly = Array.isArray(showIds) && movieIds === undefined;

    const targetMovies = scopedShowsOnly
      ? []
      : Array.isArray(movieIds)
        ? movieIds
        : db
            .listMovies()
            .filter((m) => (onlyUnscraped ? !m.scraped : true))
            .map((m) => m.id);

    const targetShows = scopedMoviesOnly
      ? []
      : Array.isArray(showIds)
        ? showIds
        : db
            .listTvShows()
            .filter((s) => (onlyUnscraped ? !s.scraped : true))
            .map((s) => s.id);

    let scrapedMovies = 0;
    let unmatchedMovies = 0;
    for (const id of targetMovies) {
      const r = await scraper.autoScrapeMovie(id);
      if (r.matched) scrapedMovies++;
      else unmatchedMovies++;
    }

    let scrapedShows = 0;
    let unmatchedShows = 0;
    for (const id of targetShows) {
      const r = await scraper.autoScrapeShow(id);
      if (r.matched) scrapedShows++;
      else unmatchedShows++;
    }

    res.json({ scrapedMovies, unmatchedMovies, scrapedShows, unmatchedShows });
  });

  return router;
}
