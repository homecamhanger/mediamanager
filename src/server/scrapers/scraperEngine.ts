import fs from 'node:fs';
import path from 'node:path';
import type {
  AppPreferences,
  ArtworkCandidate,
  ArtworkKind,
  EpisodeScrapePreview,
  MovieRecord,
  RatingEntry,
  ScrapedEpisodePart,
  ScrapedMetadataBundle,
  ScraperFieldMapping,
  ScraperProviderConfig,
  ScraperProviderId,
  ScraperSearchResult,
  TvEpisodeRecord,
  TvEpisodeSubEntry,
  TvShowRecord,
  UniqueIds,
} from '../../shared/types.js';
import {
  DEFAULT_FIELD_MAPPING,
  DEFAULT_PREFERENCES,
  DEFAULT_SCRAPER_PROVIDERS,
  MediaDatabase,
} from '../db/database.js';
import { saveArtworkToDisk } from './artworkRenderer.js';
import {
  buildCatalogArtworkCandidates,
  CATALOG_MOVIES,
  CATALOG_SHOWS,
  findCatalogMovies,
  findCatalogShows,
} from './catalogData.js';
import { fetchTmdbDetailsLive, fetchTmdbEpisodeLive, searchTmdbLive } from './providers/tmdb.js';
import { fetchOmdbDetailsLive, fetchOmdbEnrichmentLive, searchOmdbLive } from './providers/omdb.js';
import {
  fetchFanartLive,
  fetchItunesDetailsLive,
  fetchJikanDetailsLive,
  fetchTraktRatingsLive,
  fetchTvdbDetailsLive,
  fetchTvmazeDetailsLive,
  fetchTvmazeEpisodeLive,
  fetchWikidataDetailsLive,
  searchItunesLive,
  searchJikanLive,
  searchTvdbLive,
  searchTvmazeLive,
  searchWikidataLive,
} from './providers/otherProviders.js';
import { serializeEpisodeNfo, serializeMovieNfo, serializeSeasonNfo, serializeTvShowNfo, validateKodiNfoXml } from '../nfo/kodiNfo.js';

export class ScraperEngine {
  constructor(private db: MediaDatabase) {}

  getProviders(): ScraperProviderConfig[] {
    const saved = this.db.getSetting<ScraperProviderConfig[]>('scraper_providers', DEFAULT_SCRAPER_PROVIDERS);
    const savedIds = new Set(saved.map((p) => p.id));
    const missing = DEFAULT_SCRAPER_PROVIDERS.filter((p) => !savedIds.has(p.id));
    return missing.length > 0 ? [...saved, ...missing] : saved;
  }

  getFieldMapping(): ScraperFieldMapping {
    return this.db.getSetting<ScraperFieldMapping>('scraper_field_mapping', DEFAULT_FIELD_MAPPING);
  }

  getPreferences(): AppPreferences {
    return this.db.getSetting<AppPreferences>('preferences', DEFAULT_PREFERENCES);
  }

  async search(params: {
    query: string;
    mediaKind: 'movie' | 'tvshow';
    year?: number | null;
    providerIds?: ScraperProviderId[];
  }): Promise<ScraperSearchResult[]> {
    const allProviders = this.getProviders();
    const providers = allProviders.filter(
      (p) =>
        p.enabled &&
        p.supports.includes(params.mediaKind) &&
        (!params.providerIds || params.providerIds.length === 0 || params.providerIds.includes(p.id))
    );

    const results: ScraperSearchResult[] = [];

    // 1. Query enabled providers concurrently:
    //    - Keyless scrapers (!p.requiresKey) ALWAYS scrape regardless of whether an API key is input (including in demo mode).
    //    - Key-requiring scrapers (p.requiresKey) run live when an API key is configured.
    const livePromises = providers.map(async (p): Promise<ScraperSearchResult[]> => {
      const hasKey = Boolean(p.apiKey && p.apiKey.trim());
      if (p.requiresKey && !hasKey) return [];

      if (p.id === 'tmdb') return searchTmdbLive(params.query, params.mediaKind, params.year ?? null, p);
      if (p.id === 'omdb') return searchOmdbLive(params.query, params.mediaKind, params.year ?? null, p);
      if (p.id === 'tvdb') return searchTvdbLive(params.query, params.mediaKind, p);
      if (p.id === 'tvmaze' && params.mediaKind === 'tvshow') return searchTvmazeLive(params.query);
      if (p.id === 'jikan') return searchJikanLive(params.query, params.mediaKind);
      if (p.id === 'itunes') return searchItunesLive(params.query, params.mediaKind, params.year ?? null);
      if (p.id === 'wikidata') return searchWikidataLive(params.query, params.mediaKind, params.year ?? null);
      return [];
    });

    const settled = await Promise.allSettled(livePromises);
    for (const s of settled) {
      if (s.status === 'fulfilled' && s.value.length > 0) {
        results.push(...s.value);
      }
    }

    // 2. Built-in Kodi multi-source catalog (active when kodi-catalog enabled or demo fallback allowed on enabled providers)
    const kodiCatalogRequested = providers.some((p) => p.id === 'kodi-catalog');
    const demoFallbackAllowed =
      (!params.providerIds || params.providerIds.length === 0) && providers.some((p) => p.useDemoFallback);
    if (kodiCatalogRequested || demoFallbackAllowed) {
      if (params.mediaKind === 'movie') {
        const matches = findCatalogMovies(params.query, params.year);
        for (const m of matches) {
          const defaultRating = m.entry.ratings.find((r) => r.isDefault)?.value ?? m.entry.ratings[0]?.value ?? null;
          const art = buildCatalogArtworkCandidates(
            m.entry.title,
            m.entry.year,
            m.entry.genres,
            defaultRating,
            m.entry.accentColor,
            m.entry.secondaryColor
          );
          results.push({
            externalId: `catalog:${m.entry.key}`,
            provider: 'kodi-catalog',
            mediaKind: 'movie',
            title: m.entry.title,
            originalTitle: m.entry.originalTitle,
            year: m.entry.year,
            overview: m.entry.plot,
            posterUrl: art.find((a) => a.kind === 'poster')?.url,
            confidence: m.score,
            uniqueIds: m.entry.uniqueIds,
            dataOrigin: 'builtin-catalog',
          });
        }
      } else {
        const matches = findCatalogShows(params.query, params.year);
        for (const m of matches) {
          const defaultRating = m.entry.ratings.find((r) => r.isDefault)?.value ?? m.entry.ratings[0]?.value ?? null;
          const art = buildCatalogArtworkCandidates(
            m.entry.title,
            m.entry.year,
            m.entry.genres,
            defaultRating,
            m.entry.accentColor,
            m.entry.secondaryColor
          );
          results.push({
            externalId: `catalog:${m.entry.key}`,
            provider: 'kodi-catalog',
            mediaKind: 'tvshow',
            title: m.entry.title,
            originalTitle: m.entry.originalTitle,
            year: m.entry.year,
            overview: m.entry.plot,
            posterUrl: art.find((a) => a.kind === 'poster')?.url,
            confidence: m.score,
            uniqueIds: m.entry.uniqueIds,
            dataOrigin: 'builtin-catalog',
          });
        }
      }
    }

    // Deduplicate within each provider while preserving matches from all responding providers
    const seen = new Map<string, ScraperSearchResult>();
    for (const r of results) {
      const dedupKey = `${r.provider}::${normalizeTitle(r.title)}::${r.year ?? ''}`;
      const existing = seen.get(dedupKey);
      if (!existing || r.confidence > existing.confidence) {
        seen.set(dedupKey, r);
      }
    }

    return [...seen.values()].sort(
      (a, b) =>
        b.confidence - a.confidence ||
        (a.dataOrigin === b.dataOrigin ? 0 : a.dataOrigin === 'live-api' ? -1 : 1)
    );
  }

  async fetchBundle(params: {
    externalId: string;
    provider: ScraperProviderId;
    mediaKind: 'movie' | 'tvshow';
  }): Promise<ScrapedMetadataBundle | null> {
    const providers = this.getProviders();
    const byId = new Map(providers.map((p) => [p.id, p]));
    const mapping = this.getFieldMapping();

    let bundle: ScrapedMetadataBundle | null = null;
    let primaryCatalogKey: string | null = null;

    if (params.externalId.startsWith('catalog:') || params.provider === 'kodi-catalog') {
      const key = params.externalId.startsWith('catalog:')
        ? params.externalId.slice('catalog:'.length)
        : params.externalId;
      primaryCatalogKey = key;
      bundle = this.buildCatalogBundle(key, params.mediaKind, byId, mapping);
    } else if (params.provider === 'tmdb') {
      const cfg = byId.get('tmdb');
      if (cfg) bundle = await fetchTmdbDetailsLive(params.externalId, params.mediaKind, cfg);
    } else if (params.provider === 'omdb') {
      const cfg = byId.get('omdb');
      if (cfg) bundle = await fetchOmdbDetailsLive(params.externalId, params.mediaKind, cfg);
    } else if (params.provider === 'tvdb') {
      const cfg = byId.get('tvdb');
      if (cfg) bundle = await fetchTvdbDetailsLive(params.externalId, params.mediaKind, cfg);
    } else if (params.provider === 'tvmaze' && params.mediaKind === 'tvshow') {
      bundle = await fetchTvmazeDetailsLive(params.externalId);
    } else if (params.provider === 'jikan') {
      bundle = await fetchJikanDetailsLive(params.externalId, params.mediaKind);
    } else if (params.provider === 'itunes') {
      bundle = await fetchItunesDetailsLive(params.externalId, params.mediaKind);
    } else if (params.provider === 'wikidata') {
      bundle = await fetchWikidataDetailsLive(params.externalId, params.mediaKind);
    }

    if (!bundle) return null;

    // 1. Keyless live scraper enrichment — ALWAYS runs for enabled !requiresKey providers (even in demo mode & without API keys!)
    const keylessEnrichTasks: Array<Promise<{ provider: ScraperProviderId; extra: ScrapedMetadataBundle | null }>> = [];

    const tvmazeCfg = byId.get('tvmaze');
    if (
      tvmazeCfg?.enabled &&
      (!tvmazeCfg.requiresKey || Boolean(tvmazeCfg.apiKey)) &&
      params.mediaKind === 'tvshow' &&
      bundle.provider !== 'tvmaze'
    ) {
      keylessEnrichTasks.push(
        (async () => {
          if (bundle!.uniqueIds.tvmaze) {
            return { provider: 'tvmaze' as const, extra: await fetchTvmazeDetailsLive(bundle!.uniqueIds.tvmaze) };
          }
          const hits = await searchTvmazeLive(bundle!.title);
          const match = hits.find(
            (h) =>
              (bundle!.uniqueIds.imdb && h.uniqueIds.imdb === bundle!.uniqueIds.imdb) ||
              (bundle!.uniqueIds.tvdb && h.uniqueIds.tvdb === bundle!.uniqueIds.tvdb) ||
              isConfidentMatch(bundle!.title, bundle!.year, h.title, h.year)
          );
          if (!match) return { provider: 'tvmaze' as const, extra: null };
          return { provider: 'tvmaze' as const, extra: await fetchTvmazeDetailsLive(match.externalId) };
        })()
      );
    }

    const jikanCfg = byId.get('jikan');
    if (
      jikanCfg?.enabled &&
      (!jikanCfg.requiresKey || Boolean(jikanCfg.apiKey)) &&
      bundle.provider !== 'jikan'
    ) {
      keylessEnrichTasks.push(
        (async () => {
          if (bundle!.uniqueIds.mal) {
            return { provider: 'jikan' as const, extra: await fetchJikanDetailsLive(bundle!.uniqueIds.mal, params.mediaKind) };
          }
          const isAnimeHint =
            bundle!.tags.some((t) => t.toLowerCase() === 'anime') ||
            bundle!.genres.some((g) => g.toLowerCase() === 'anime') ||
            bundle!.country.toLowerCase() === 'japan';
          const hits = await searchJikanLive(bundle!.title, params.mediaKind);
          const match = hits.find((h) =>
            isConfidentMatch(bundle!.title, bundle!.year, h.title, h.year, h.originalTitle, isAnimeHint)
          );
          if (!match) return { provider: 'jikan' as const, extra: null };
          return { provider: 'jikan' as const, extra: await fetchJikanDetailsLive(match.externalId, params.mediaKind) };
        })()
      );
    }

    const itunesCfg = byId.get('itunes');
    if (
      itunesCfg?.enabled &&
      (!itunesCfg.requiresKey || Boolean(itunesCfg.apiKey)) &&
      bundle.provider !== 'itunes'
    ) {
      keylessEnrichTasks.push(
        (async () => {
          if (bundle!.uniqueIds.itunes) {
            return { provider: 'itunes' as const, extra: await fetchItunesDetailsLive(bundle!.uniqueIds.itunes, params.mediaKind) };
          }
          const hits = await searchItunesLive(bundle!.title, params.mediaKind, bundle!.year);
          const match = hits.find((h) => isConfidentMatch(bundle!.title, bundle!.year, h.title, h.year));
          if (!match) return { provider: 'itunes' as const, extra: null };
          return { provider: 'itunes' as const, extra: await fetchItunesDetailsLive(match.externalId, params.mediaKind) };
        })()
      );
    }

    const wikidataCfg = byId.get('wikidata');
    if (
      wikidataCfg?.enabled &&
      (!wikidataCfg.requiresKey || Boolean(wikidataCfg.apiKey)) &&
      bundle.provider !== 'wikidata'
    ) {
      keylessEnrichTasks.push(
        (async () => {
          const hits = await searchWikidataLive(bundle!.title, params.mediaKind, bundle!.year);
          const match = hits.find((h) => isConfidentMatch(bundle!.title, bundle!.year, h.title, h.year));
          if (!match) return { provider: 'wikidata' as const, extra: null };
          return { provider: 'wikidata' as const, extra: await fetchWikidataDetailsLive(match.externalId, params.mediaKind) };
        })()
      );
    }

    const keylessSettled = await Promise.allSettled(keylessEnrichTasks);
    for (const s of keylessSettled) {
      if (s.status === 'fulfilled' && s.value.extra) {
        bundle = mergeBundles(bundle, s.value.extra, s.value.provider, mapping);
      }
    }

    // 2. Demo / Built-in Kodi catalog enrichment when primary came from a live provider and demo fallback is active
    const demoFallbackActive =
      byId.get('kodi-catalog')?.enabled || providers.some((p) => p.enabled && p.useDemoFallback);
    if (!primaryCatalogKey && demoFallbackActive) {
      const catBundle = this.findMatchingCatalogBundle(bundle, params.mediaKind, byId, mapping);
      if (catBundle) {
        bundle = mergeBundles(bundle, catBundle, 'kodi-catalog', mapping);
        bundle.dataOrigin = 'hybrid';
      }
    }

    // 3. Keyed multi-source enrichment (OMDb for IMDb/RT/Metacritic, Fanart.tv for clearlogo/disc, Trakt for community score)
    const omdbCfg = byId.get('omdb');
    if (omdbCfg?.enabled && omdbCfg.apiKey && bundle.provider !== 'omdb') {
      const omdb = await fetchOmdbEnrichmentLive(bundle.uniqueIds.imdb, bundle.title, bundle.year, omdbCfg);
      if (omdb) {
        if (!bundle.sourcesUsed.includes('omdb')) bundle.sourcesUsed.push('omdb');
        if (omdb.imdbId && !bundle.uniqueIds.imdb) bundle.uniqueIds.imdb = omdb.imdbId;
        for (const r of omdb.ratings) {
          if (!bundle.ratings.some((x) => x.source === r.source)) bundle.ratings.push(r);
        }
        if (!bundle.mpaa && omdb.mpaa) bundle.mpaa = omdb.mpaa;
        if (omdb.plot && (!bundle.plot || mapping.plot.indexOf('omdb') < mapping.plot.indexOf(bundle.provider))) {
          bundle.plot = omdb.plot;
        }
      }
    }

    const fanartCfg = byId.get('fanarttv');
    const fanartId = params.mediaKind === 'movie' ? bundle.uniqueIds.tmdb || bundle.uniqueIds.imdb : bundle.uniqueIds.tvdb;
    if (fanartCfg?.enabled && fanartCfg.apiKey && fanartId) {
      const extraArt = await fetchFanartLive(params.mediaKind, fanartId, fanartCfg);
      if (extraArt.length > 0) {
        if (!bundle.sourcesUsed.includes('fanarttv')) bundle.sourcesUsed.push('fanarttv');
        bundle.artwork.push(...extraArt);
      }
    }

    const traktCfg = byId.get('trakt');
    const traktLookup = bundle.uniqueIds.imdb || bundle.uniqueIds.tmdb;
    if (traktCfg?.enabled && traktCfg.apiKey && traktLookup) {
      const tr = await fetchTraktRatingsLive(traktLookup, params.mediaKind, traktCfg);
      if (tr) {
        if (!bundle.sourcesUsed.includes('trakt')) bundle.sourcesUsed.push('trakt');
        if (!bundle.ratings.some((x) => x.source === 'trakt')) {
          bundle.ratings.push({ source: 'trakt', value: tr.rating, max: 10, votes: tr.votes });
        }
        if (tr.traktId) bundle.uniqueIds.trakt = tr.traktId;
      }
    }

    return bundle;
  }

  private buildCatalogBundle(
    key: string,
    mediaKind: 'movie' | 'tvshow',
    byId: Map<ScraperProviderId, ScraperProviderConfig>,
    mapping: ScraperFieldMapping
  ): ScrapedMetadataBundle | null {
    if (mediaKind === 'movie') {
      const entry = CATALOG_MOVIES.find((m) => m.key === key);
      if (!entry) return null;
      const activeRatings = filterRatingsByEnabledProviders(entry.ratings, byId, mapping.ratings);
      const defaultRating = activeRatings.find((r) => r.isDefault)?.value ?? activeRatings[0]?.value ?? null;
      const art = buildCatalogArtworkCandidates(
        entry.title,
        entry.year,
        entry.genres,
        defaultRating,
        entry.accentColor,
        entry.secondaryColor
      );
      const candidateSources: ScraperProviderId[] = ['tmdb', 'omdb', 'fanarttv', 'trakt', 'kodi-catalog'];
      const sourcesUsed = candidateSources.filter((id) => {
        const cfg = byId.get(id);
        return cfg?.enabled && (!cfg.requiresKey || Boolean(cfg.apiKey) || cfg.useDemoFallback);
      });

      return {
        provider: 'kodi-catalog',
        sourcesUsed: sourcesUsed.length > 0 ? sourcesUsed : ['kodi-catalog'],
        dataOrigin: 'builtin-catalog',
        title: entry.title,
        originalTitle: entry.originalTitle,
        sortTitle: entry.sortTitle,
        year: entry.year,
        premiered: entry.premiered,
        tagline: entry.tagline,
        plot: entry.plot,
        outline: entry.outline,
        runtimeMinutes: entry.runtimeMinutes,
        mpaa: entry.mpaa,
        country: entry.country,
        studios: entry.studios,
        genres: entry.genres,
        tags: entry.tags,
        directors: entry.directors,
        writers: entry.writers,
        actors: entry.actors,
        trailerUrl: entry.trailerUrl,
        setName: entry.setName,
        setOverview: entry.setOverview,
        tmdbCollectionId: entry.tmdbCollectionId,
        uniqueIds: { ...entry.uniqueIds },
        ratings: activeRatings.length > 0 ? [...activeRatings] : [...entry.ratings],
        artwork: art,
      };
    }

    const entry = CATALOG_SHOWS.find((s) => s.key === key);
    if (!entry) return null;
    const activeRatings = filterRatingsByEnabledProviders(entry.ratings, byId, mapping.ratings);
    const defaultRating = activeRatings.find((r) => r.isDefault)?.value ?? activeRatings[0]?.value ?? null;
    const art = buildCatalogArtworkCandidates(
      entry.title,
      entry.year,
      entry.genres,
      defaultRating,
      entry.accentColor,
      entry.secondaryColor
    );
    const candidateSources: ScraperProviderId[] = ['tvdb', 'tmdb', 'omdb', 'fanarttv', 'kodi-catalog'];
    const sourcesUsed = candidateSources.filter((id) => {
      const cfg = byId.get(id);
      return cfg?.enabled && (!cfg.requiresKey || Boolean(cfg.apiKey) || cfg.useDemoFallback);
    });

    return {
      provider: 'kodi-catalog',
      sourcesUsed: sourcesUsed.length > 0 ? sourcesUsed : ['kodi-catalog'],
      dataOrigin: 'builtin-catalog',
      title: entry.title,
      originalTitle: entry.originalTitle,
      sortTitle: entry.sortTitle,
      year: entry.year,
      premiered: entry.premiered,
      tagline: '',
      plot: entry.plot,
      outline: entry.plot.slice(0, 180),
      runtimeMinutes: entry.episodes[0]?.runtimeMinutes ?? 45,
      mpaa: entry.mpaa,
      country: 'United States',
      status: entry.status,
      studios: [entry.studio],
      genres: entry.genres,
      tags: entry.tags,
      directors: [],
      writers: [],
      actors: entry.actors,
      trailerUrl: '',
      uniqueIds: { ...entry.uniqueIds },
      ratings: activeRatings.length > 0 ? [...activeRatings] : [...entry.ratings],
      artwork: art,
      episodes: entry.episodes.map((ep) => {
        const epQs = new URLSearchParams({
          title: ep.title,
          subtitle: entry.title,
          episodeCode: `S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}`,
          genres: entry.genres.slice(0, 2).join(','),
          rating: ep.ratings[0]?.value ? String(ep.ratings[0].value) : '',
          accent: entry.accentColor,
          secondary: entry.secondaryColor,
        });
        return {
          ...ep,
          uniqueIds: { tvdb: `${entry.uniqueIds.tvdb ?? entry.key}-s${ep.seasonNumber}e${ep.episodeNumber}` },
          thumbUrl: `/api/artwork/render?kind=thumb&${epQs.toString()}`,
        };
      }),
    };
  }

  private findMatchingCatalogBundle(
    bundle: ScrapedMetadataBundle,
    mediaKind: 'movie' | 'tvshow',
    byId: Map<ScraperProviderId, ScraperProviderConfig>,
    mapping: ScraperFieldMapping
  ): ScrapedMetadataBundle | null {
    if (mediaKind === 'movie') {
      const entry = CATALOG_MOVIES.find(
        (m) =>
          (bundle.uniqueIds.imdb && m.uniqueIds.imdb === bundle.uniqueIds.imdb) ||
          (bundle.uniqueIds.tmdb && m.uniqueIds.tmdb === bundle.uniqueIds.tmdb) ||
          isConfidentMatch(bundle.title, bundle.year, m.title, m.year, m.originalTitle)
      );
      return entry ? this.buildCatalogBundle(entry.key, 'movie', byId, mapping) : null;
    }

    const entry = CATALOG_SHOWS.find(
      (s) =>
        (bundle.uniqueIds.imdb && s.uniqueIds.imdb === bundle.uniqueIds.imdb) ||
        (bundle.uniqueIds.tvdb && s.uniqueIds.tvdb === bundle.uniqueIds.tvdb) ||
        (bundle.uniqueIds.tvmaze && s.uniqueIds.tvmaze === bundle.uniqueIds.tvmaze) ||
        isConfidentMatch(bundle.title, bundle.year, s.title, s.year, s.originalTitle)
    );
    return entry ? this.buildCatalogBundle(entry.key, 'tvshow', byId, mapping) : null;
  }

  async applyToMovie(
    movieId: number,
    bundle: ScrapedMetadataBundle,
    selectedArtworkUrls?: Partial<Record<ArtworkKind, string>>
  ): Promise<MovieRecord | null> {
    const movie = this.db.getMovie(movieId);
    if (!movie) return null;
    const source = this.db.getSource(movie.sourceId);
    const prefs = this.getPreferences();

    let setId: number | null = movie.setId;
    if (bundle.setName) {
      setId = this.db.upsertMovieSet(bundle.setName, bundle.setOverview ?? '', bundle.tmdbCollectionId);
    }

    // Download/render requested artwork types to disk in Kodi-compliant paths
    const artwork = { ...movie.artwork };
    const artworkNaming = source?.artworkNaming ?? prefs.defaultArtworkNaming;
    const videoBase = path.basename(movie.filePath, path.extname(movie.filePath));
    const defaultRating = bundle.ratings.find((r) => r.isDefault)?.value ?? bundle.ratings[0]?.value ?? null;

    const kindsToSave = prefs.downloadArtworkKinds;
    for (const kind of kindsToSave) {
      const chosenUrl = selectedArtworkUrls?.[kind] ?? bundle.artwork.find((a) => a.kind === kind)?.url;
      const ext = kind === 'clearlogo' || kind === 'clearart' || kind === 'disc' ? '.png' : '.jpg';
      const fileName =
        artworkNaming === 'filename' ? `${videoBase}-${kind}${ext}` : `${kind}${ext}`;
      const targetPath = path.join(movie.folderPath, fileName);

      if (chosenUrl || !artwork[kind]) {
        await saveArtworkToDisk(targetPath, chosenUrl, {
          kind,
          title: bundle.title,
          year: bundle.year,
          tagline: bundle.tagline,
          genres: bundle.genres,
          rating: defaultRating,
        });
        artwork[kind] = targetPath;
      }
    }

    // Group candidates by kind
    const artworkCandidates: Partial<Record<ArtworkKind, ArtworkCandidate[]>> = {};
    for (const c of bundle.artwork) {
      const list = artworkCandidates[c.kind] ?? [];
      list.push(c);
      artworkCandidates[c.kind] = list;
    }

    const updated = this.db.updateMovie(movieId, {
      scraped: true,
      scrapedSource: bundle.sourcesUsed.join(', '),
      title: bundle.title,
      originalTitle: bundle.originalTitle,
      sortTitle: bundle.sortTitle,
      year: bundle.year,
      premiered: bundle.premiered,
      tagline: bundle.tagline,
      plot: bundle.plot,
      outline: bundle.outline,
      runtimeMinutes: bundle.runtimeMinutes,
      mpaa: bundle.mpaa,
      country: bundle.country,
      studios: bundle.studios,
      genres: bundle.genres,
      tags: bundle.tags,
      directors: bundle.directors,
      writers: bundle.writers,
      actors: bundle.actors,
      trailerUrl: bundle.trailerUrl,
      setId,
      uniqueIds: { ...movie.uniqueIds, ...bundle.uniqueIds },
      ratings: bundle.ratings,
      artwork,
      artworkCandidates,
    });

    if (updated && prefs.autoWriteNfoOnScrape) {
      await this.writeMovieNfo(updated.id);
    }

    this.db.logActivity(
      'scrape',
      'Scrape Movie',
      `Scraped "${bundle.title}" (${bundle.year ?? ''}) from [${bundle.sourcesUsed.join(', ')}]`,
      'success'
    );

    return this.db.getMovie(movieId);
  }

  async applyToTvShow(showId: number, bundle: ScrapedMetadataBundle): Promise<TvShowRecord | null> {
    const show = this.db.getTvShow(showId);
    if (!show) return null;
    const prefs = this.getPreferences();
    const defaultRating = bundle.ratings.find((r) => r.isDefault)?.value ?? bundle.ratings[0]?.value ?? null;

    const artwork = { ...show.artwork };
    const showKinds: ArtworkKind[] = ['poster', 'fanart', 'banner', 'clearlogo', 'clearart', 'landscape'];
    for (const kind of showKinds) {
      if (!prefs.downloadArtworkKinds.includes(kind) && kind !== 'poster' && kind !== 'fanart') continue;
      const cand = bundle.artwork.find((a) => a.kind === kind);
      const ext = kind === 'clearlogo' || kind === 'clearart' ? '.png' : '.jpg';
      const targetPath = path.join(show.folderPath, `${kind}${ext}`);
      await saveArtworkToDisk(targetPath, cand?.url, {
        kind,
        title: bundle.title,
        year: bundle.year,
        genres: bundle.genres,
        rating: defaultRating,
      });
      artwork[kind] = targetPath;
    }

    const episodeGuide = (bundle.episodes ?? []).map((ep) => ({
      seasonNumber: ep.seasonNumber,
      episodeNumber: ep.episodeNumber,
      title: ep.title,
      aired: ep.aired ?? null,
      plot: ep.plot ?? '',
      runtimeMinutes: ep.runtimeMinutes ?? null,
      thumbUrl: ep.thumbUrl,
    }));

    const artworkCandidates: Partial<Record<ArtworkKind, ArtworkCandidate[]>> = {};
    for (const c of bundle.artwork) {
      const list = artworkCandidates[c.kind] ?? [];
      list.push(c);
      artworkCandidates[c.kind] = list;
    }

    const updatedShow = this.db.updateTvShow(showId, {
      scraped: true,
      scrapedSource: bundle.sourcesUsed.join(', '),
      title: bundle.title,
      originalTitle: bundle.originalTitle,
      sortTitle: bundle.sortTitle,
      year: bundle.year,
      premiered: bundle.premiered,
      status: bundle.status || 'Ended',
      plot: bundle.plot,
      mpaa: bundle.mpaa,
      studio: bundle.studios[0] ?? '',
      genres: bundle.genres,
      tags: bundle.tags,
      actors: bundle.actors,
      episodeGuide,
      uniqueIds: { ...show.uniqueIds, ...bundle.uniqueIds },
      ratings: bundle.ratings,
      artwork,
      artworkCandidates,
    });

    // Update seasons & episodes from episode guide
    const seasons = this.db.listSeasonsForShow(showId);
    for (const s of seasons) {
      const seasonPosterFile =
        s.seasonNumber === 0 ? 'season-specials-poster.jpg' : `season${String(s.seasonNumber).padStart(2, '0')}-poster.jpg`;
      const seasonPosterPath = path.join(show.folderPath, seasonPosterFile);
      await saveArtworkToDisk(seasonPosterPath, null, {
        kind: 'poster',
        title: bundle.title,
        subtitle: s.name,
        year: bundle.year,
        genres: bundle.genres,
        seasonNumber: s.seasonNumber,
      });
      const seasonNfoPath = s.folderPath ? path.join(s.folderPath, 'season.nfo') : null;
      this.db.upsertTvSeason({
        ...s,
        posterPath: seasonPosterPath,
        nfoPath: seasonNfoPath ?? s.nfoPath,
      });
      if (prefs.autoWriteNfoOnScrape && seasonNfoPath) {
        fs.writeFileSync(seasonNfoPath, serializeSeasonNfo(s), 'utf-8');
        this.db.upsertTvSeason({ ...s, posterPath: seasonPosterPath, nfoPath: seasonNfoPath, hasNfo: true });
      }
    }

    const episodes = this.db.listEpisodesForShow(showId);
    for (const ep of episodes) {
      const match = bundle.episodes?.find(
        (bep) => bep.seasonNumber === ep.seasonNumber && bep.episodeNumber === ep.episodeNumber
      );
      const base = path.basename(ep.filePath, path.extname(ep.filePath));
      const thumbPath = path.join(ep.folderPath, `${base}-thumb.jpg`);
      await saveArtworkToDisk(thumbPath, match?.thumbUrl, {
        kind: 'thumb',
        title: match?.title ?? ep.title,
        subtitle: bundle.title,
        episodeCode: `S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}`,
        genres: bundle.genres,
        rating: match?.ratings?.[0]?.value ?? null,
      });

      const existingParts = ep.multiEpisodeParts ?? [];
      const multiEpisodeParts: TvEpisodeSubEntry[] = [...existingParts];
      if (ep.multiEpisodeEnd != null && ep.multiEpisodeEnd > ep.episodeNumber) {
        const existingByKey = new Map(
          existingParts.map((p) => [`${p.seasonNumber}:${p.episodeNumber}`, p])
        );
        const rebuilt: TvEpisodeSubEntry[] = [];
        for (let num = ep.episodeNumber + 1; num <= ep.multiEpisodeEnd; num++) {
          const prev = existingByKey.get(`${ep.seasonNumber}:${num}`);
          const subMatch = bundle.episodes?.find(
            (bep) => bep.seasonNumber === ep.seasonNumber && bep.episodeNumber === num
          );
          rebuilt.push({
            seasonNumber: ep.seasonNumber,
            episodeNumber: num,
            displaySeason: prev?.displaySeason ?? null,
            displayEpisode: prev?.displayEpisode ?? null,
            title: subMatch?.title ?? prev?.title ?? `Episode ${num}`,
            aired: subMatch?.aired ?? prev?.aired ?? null,
            plot: subMatch?.plot ?? prev?.plot ?? '',
            runtimeMinutes: subMatch?.runtimeMinutes ?? prev?.runtimeMinutes ?? ep.runtimeMinutes,
            directors: subMatch?.directors?.length ? subMatch.directors : prev?.directors ?? [],
            writers: subMatch?.writers?.length ? subMatch.writers : prev?.writers ?? [],
            actors: subMatch?.actors?.length ? subMatch.actors : prev?.actors ?? [],
            uniqueIds: subMatch?.uniqueIds ? { ...(prev?.uniqueIds ?? {}), ...subMatch.uniqueIds } : prev?.uniqueIds ?? {},
            ratings: subMatch?.ratings?.length ? subMatch.ratings : prev?.ratings ?? [],
            userRating: prev?.userRating ?? null,
            playCount: prev?.playCount ?? 0,
            watched: prev?.watched ?? false,
            lastPlayed: prev?.lastPlayed ?? null,
          });
        }
        for (const prev of existingParts) {
          if (
            prev.seasonNumber !== ep.seasonNumber ||
            prev.episodeNumber <= ep.episodeNumber ||
            prev.episodeNumber > ep.multiEpisodeEnd
          ) {
            rebuilt.push(prev);
          }
        }
        multiEpisodeParts.splice(0, multiEpisodeParts.length, ...rebuilt);
      }

      const updatedEp = this.db.updateTvEpisode(ep.id, {
        scraped: true,
        showTitle: bundle.title,
        title: match?.title ?? ep.title,
        aired: match?.aired ?? ep.aired,
        plot: match?.plot ?? ep.plot,
        runtimeMinutes: match?.runtimeMinutes ?? ep.runtimeMinutes,
        directors: match?.directors ?? ep.directors,
        writers: match?.writers ?? ep.writers,
        actors: match?.actors?.length ? match.actors : ep.actors,
        ratings: match?.ratings?.length ? match.ratings : ep.ratings,
        uniqueIds: match?.uniqueIds ?? ep.uniqueIds,
        multiEpisodeParts,
        thumbPath,
      });

      if (updatedEp && prefs.autoWriteNfoOnScrape) {
        const epNfoPath = path.join(updatedEp.folderPath, `${base}.nfo`);
        const xml = serializeEpisodeNfo(updatedEp);
        fs.writeFileSync(epNfoPath, xml, 'utf-8');
        const report = validateKodiNfoXml(xml);
        this.db.updateTvEpisode(updatedEp.id, {
          nfoPath: epNfoPath,
          hasNfo: true,
          nfoValid: report.valid,
          nfoWarnings: report.warnings,
        });
      }
    }

    if (updatedShow && prefs.autoWriteNfoOnScrape) {
      const showNfoPath = path.join(updatedShow.folderPath, 'tvshow.nfo');
      const xml = serializeTvShowNfo(updatedShow, this.db.listSeasonsForShow(showId));
      fs.writeFileSync(showNfoPath, xml, 'utf-8');
      const report = validateKodiNfoXml(xml);
      this.db.updateTvShow(showId, {
        nfoPath: showNfoPath,
        hasNfo: true,
        nfoValid: report.valid,
        nfoWarnings: report.warnings,
      });
    }

    this.db.logActivity(
      'scrape',
      'Scrape TV Show',
      `Scraped "${bundle.title}" (${episodes.length} episodes) from [${bundle.sourcesUsed.join(', ')}]`,
      'success'
    );

    return this.db.getTvShow(showId);
  }

  async writeMovieNfo(movieId: number): Promise<MovieRecord | null> {
    const movie = this.db.getMovie(movieId);
    if (!movie) return null;
    const source = this.db.getSource(movie.sourceId);
    const prefs = this.getPreferences();
    const nfoNaming = source?.nfoNaming ?? prefs.defaultNfoNaming;

    const base = path.basename(movie.filePath, path.extname(movie.filePath));
    const nfoPath =
      movie.nfoPath && fs.existsSync(movie.nfoPath)
        ? movie.nfoPath
        : path.join(movie.folderPath, nfoNaming === 'filename.nfo' ? `${base}.nfo` : 'movie.nfo');

    const xml = serializeMovieNfo(movie);
    fs.mkdirSync(path.dirname(nfoPath), { recursive: true });
    fs.writeFileSync(nfoPath, xml, 'utf-8');
    const report = validateKodiNfoXml(xml);

    return this.db.updateMovie(movieId, {
      nfoPath,
      hasNfo: true,
      nfoValid: report.valid,
      nfoWarnings: report.warnings,
    });
  }

  async autoScrapeMovie(movieId: number): Promise<{ movie: MovieRecord | null; matched: boolean }> {
    const movie = this.db.getMovie(movieId);
    if (!movie) return { movie: null, matched: false };
    const query = movie.parsedInfo.cleanTitle || movie.title;
    const results = await this.search({ query, mediaKind: 'movie', year: movie.year ?? movie.parsedInfo.year });
    if (results.length === 0) return { movie, matched: false };
    const best = results[0];
    const bundle = await this.fetchBundle({
      externalId: best.externalId,
      provider: best.provider,
      mediaKind: 'movie',
    });
    if (!bundle) return { movie, matched: false };
    const updated = await this.applyToMovie(movieId, bundle);
    return { movie: updated, matched: true };
  }

  async autoScrapeShow(showId: number): Promise<{ show: TvShowRecord | null; matched: boolean }> {
    const show = this.db.getTvShow(showId);
    if (!show) return { show: null, matched: false };
    const results = await this.search({ query: show.title, mediaKind: 'tvshow', year: show.year });
    if (results.length === 0) return { show, matched: false };
    const best = results[0];
    const bundle = await this.fetchBundle({
      externalId: best.externalId,
      provider: best.provider,
      mediaKind: 'tvshow',
    });
    if (!bundle) return { show, matched: false };
    const updated = await this.applyToTvShow(showId, bundle);
    return { show: updated, matched: true };
  }

  private async resolveShowBundleForEpisode(
    show: TvShowRecord,
    opts?: { provider?: ScraperProviderId; externalId?: string }
  ): Promise<{
    showIds: UniqueIds;
    showTitle: string;
    genres: string[];
    bundle: ScrapedMetadataBundle | null;
    matchedProvider: ScraperProviderId;
  }> {
    const providers = this.getProviders();
    const byId = new Map(providers.map((p) => [p.id, p]));
    const mapping = this.getFieldMapping();

    let bundle: ScrapedMetadataBundle | null = null;
    let matchedProvider: ScraperProviderId | null = null;

    if (opts?.externalId && opts?.provider) {
      bundle = await this.fetchBundle({
        externalId: opts.externalId,
        provider: opts.provider,
        mediaKind: 'tvshow',
      });
      if (bundle) matchedProvider = opts.provider;
    }

    if (!bundle) {
      // Check built-in catalog first by uniqueIds or title if demo fallback / kodi-catalog enabled
      const demoFallbackActive =
        byId.get('kodi-catalog')?.enabled || providers.some((p) => p.enabled && p.useDemoFallback);
      if (demoFallbackActive) {
        for (const [key, item] of Object.entries(CATALOG_SHOWS)) {
          const sameId =
            (show.uniqueIds.tmdb && item.uniqueIds.tmdb === show.uniqueIds.tmdb) ||
            (show.uniqueIds.tvdb && item.uniqueIds.tvdb === show.uniqueIds.tvdb) ||
            (show.uniqueIds.imdb && item.uniqueIds.imdb === show.uniqueIds.imdb);
          if (sameId || isConfidentMatch(show.title, show.year, item.title, item.year, item.originalTitle)) {
            bundle = this.buildCatalogBundle(key, 'tvshow', byId, mapping);
            if (bundle) {
              matchedProvider = 'kodi-catalog';
              break;
            }
          }
        }
      }
    }

    if (!bundle && show.uniqueIds.tmdb && byId.get('tmdb')?.enabled && byId.get('tmdb')?.apiKey) {
      bundle = await this.fetchBundle({ externalId: show.uniqueIds.tmdb, provider: 'tmdb', mediaKind: 'tvshow' });
      if (bundle) matchedProvider = 'tmdb';
    }
    if (!bundle && show.uniqueIds.tvmaze && byId.get('tvmaze')?.enabled) {
      bundle = await this.fetchBundle({ externalId: show.uniqueIds.tvmaze, provider: 'tvmaze', mediaKind: 'tvshow' });
      if (bundle) matchedProvider = 'tvmaze';
    }
    if (!bundle && show.uniqueIds.tvdb && byId.get('tvdb')?.enabled && byId.get('tvdb')?.apiKey) {
      bundle = await this.fetchBundle({ externalId: show.uniqueIds.tvdb, provider: 'tvdb', mediaKind: 'tvshow' });
      if (bundle) matchedProvider = 'tvdb';
    }
    if (!bundle) {
      const results = await this.search({ query: show.title, mediaKind: 'tvshow', year: show.year });
      if (results.length > 0) {
        const best = results[0];
        bundle = await this.fetchBundle({
          externalId: best.externalId,
          provider: best.provider,
          mediaKind: 'tvshow',
        });
        if (bundle) matchedProvider = best.provider;
      }
    }

    const showIds: UniqueIds = { ...show.uniqueIds, ...(bundle?.uniqueIds ?? {}) };
    return {
      showIds,
      showTitle: bundle?.title ?? show.title,
      genres: bundle?.genres ?? show.genres,
      bundle,
      matchedProvider: matchedProvider || bundle?.sourcesUsed[0] || 'kodi-catalog',
    };
  }

  async scrapeEpisodePreview(
    episodeId: number,
    opts?: {
      provider?: ScraperProviderId;
      externalId?: string;
      seasonNumber?: number;
      episodeNumber?: number;
      multiEpisodeEnd?: number | null;
    }
  ): Promise<EpisodeScrapePreview | null> {
    const ep = this.db.getTvEpisode(episodeId);
    if (!ep) return null;
    const show = this.db.getTvShow(ep.showId);
    if (!show) return null;

    const targetSeason = opts?.seasonNumber ?? ep.seasonNumber;
    const targetEpisode = opts?.episodeNumber ?? ep.episodeNumber;
    const targetMultiEnd =
      opts?.multiEpisodeEnd !== undefined
        ? opts.multiEpisodeEnd != null && opts.multiEpisodeEnd > targetEpisode
          ? opts.multiEpisodeEnd
          : null
        : ep.multiEpisodeEnd != null && ep.multiEpisodeEnd > targetEpisode
          ? ep.multiEpisodeEnd
          : null;

    const { showIds, showTitle, bundle, matchedProvider } = await this.resolveShowBundleForEpisode(show, opts);
    const providers = this.getProviders();
    const byId = new Map(providers.map((p) => [p.id, p]));
    const tmdbCfg = byId.get('tmdb');
    const tvmazeCfg = byId.get('tvmaze');

    const epNums: number[] = [];
    const endNum = targetMultiEnd && targetMultiEnd > targetEpisode ? targetMultiEnd : targetEpisode;
    for (let n = targetEpisode; n <= endNum; n++) {
      epNums.push(n);
    }

    const parts: ScrapedEpisodePart[] = [];
    const sourcesUsedSet = new Set<ScraperProviderId>(bundle?.sourcesUsed ?? []);
    let sawLive = bundle?.dataOrigin === 'live-api' || bundle?.dataOrigin === 'hybrid';
    let sawCatalog = bundle?.dataOrigin === 'builtin-catalog' || bundle?.dataOrigin === 'hybrid';

    for (const num of epNums) {
      const bundleEp = bundle?.episodes?.find(
        (bep) => bep.seasonNumber === targetSeason && bep.episodeNumber === num
      );

      let tmdbEp: ScrapedEpisodePart | null = null;
      if (tmdbCfg?.enabled && tmdbCfg.apiKey && showIds.tmdb) {
        tmdbEp = await fetchTmdbEpisodeLive(showIds.tmdb, targetSeason, num, tmdbCfg);
        if (tmdbEp) sawLive = true;
      }

      let tvmazeEp: ScrapedEpisodePart | null = null;
      if (tvmazeCfg?.enabled && showIds.tvmaze && !tmdbEp) {
        tvmazeEp = await fetchTvmazeEpisodeLive(showIds.tvmaze, targetSeason, num);
        if (tvmazeEp) sawLive = true;
      }

      const mergedSources = new Set<ScraperProviderId>([
        ...(bundleEp ? [matchedProvider] : []),
        ...(tmdbEp?.sourcesUsed ?? []),
        ...(tvmazeEp?.sourcesUsed ?? []),
      ]);
      for (const s of mergedSources) sourcesUsedSet.add(s);

      const mergedRatings: RatingEntry[] = [];
      for (const r of [...(tmdbEp?.ratings ?? []), ...(bundleEp?.ratings ?? []), ...(tvmazeEp?.ratings ?? [])]) {
        if (!mergedRatings.some((x) => x.source === r.source)) mergedRatings.push(r);
      }

      const mergedUniqueIds: UniqueIds = {
        ...(bundleEp?.uniqueIds ?? {}),
        ...(tvmazeEp?.uniqueIds ?? {}),
        ...(tmdbEp?.uniqueIds ?? {}),
      };

      const title =
        tmdbEp?.title ||
        bundleEp?.title ||
        tvmazeEp?.title ||
        (num === ep.episodeNumber ? ep.title : `Episode ${num}`);
      const plot = tmdbEp?.plot || bundleEp?.plot || tvmazeEp?.plot || (num === ep.episodeNumber ? ep.plot : '');
      const aired = tmdbEp?.aired ?? bundleEp?.aired ?? tvmazeEp?.aired ?? (num === ep.episodeNumber ? ep.aired : null);
      const runtimeMinutes =
        tmdbEp?.runtimeMinutes ??
        bundleEp?.runtimeMinutes ??
        tvmazeEp?.runtimeMinutes ??
        ep.runtimeMinutes;
      const directors = tmdbEp?.directors?.length
        ? tmdbEp.directors
        : bundleEp?.directors?.length
          ? bundleEp.directors
          : num === ep.episodeNumber
            ? ep.directors
            : [];
      const writers = tmdbEp?.writers?.length
        ? tmdbEp.writers
        : bundleEp?.writers?.length
          ? bundleEp.writers
          : num === ep.episodeNumber
            ? ep.writers
            : [];
      const actors = tmdbEp?.actors?.length
        ? tmdbEp.actors
        : bundleEp?.actors?.length
          ? bundleEp.actors
          : tvmazeEp?.actors?.length
            ? tvmazeEp.actors
            : [];
      const thumbUrl = tmdbEp?.thumbUrl || bundleEp?.thumbUrl || tvmazeEp?.thumbUrl;

      parts.push({
        seasonNumber: targetSeason,
        episodeNumber: num,
        title,
        aired,
        plot,
        runtimeMinutes,
        directors,
        writers,
        actors,
        ratings: mergedRatings,
        uniqueIds: mergedUniqueIds,
        thumbUrl,
        sourcesUsed: [...mergedSources],
      });
    }

    const matched = parts.some(
      (p) => Boolean(p.plot) || Object.keys(p.uniqueIds).length > 0 || p.sourcesUsed.length > 0
    );
    const dataOrigin: EpisodeScrapePreview['dataOrigin'] =
      sawLive && sawCatalog ? 'hybrid' : sawLive ? 'live-api' : 'builtin-catalog';

    return {
      episodeId: ep.id,
      showId: show.id,
      showTitle,
      showUniqueIds: showIds,
      seasonNumber: targetSeason,
      episodeNumber: targetEpisode,
      multiEpisodeEnd: targetMultiEnd,
      matched,
      sourcesUsed: [...sourcesUsedSet],
      dataOrigin,
      parts,
    };
  }

  async applyEpisodeScrape(
    episodeId: number,
    payload: {
      parts: ScrapedEpisodePart[];
      showUniqueIds?: UniqueIds;
      seasonNumber?: number;
      episodeNumber?: number;
      multiEpisodeEnd?: number | null;
      writeNfo?: boolean;
    }
  ): Promise<TvEpisodeRecord | null> {
    const ep = this.db.getTvEpisode(episodeId);
    if (!ep) return null;
    const show = this.db.getTvShow(ep.showId);
    if (!show) return null;

    const prefs = this.getPreferences();
    const parts = payload.parts ?? [];
    const primary = parts[0];
    if (!primary) return ep;

    const seasonNumber = payload.seasonNumber ?? primary.seasonNumber ?? ep.seasonNumber;
    const episodeNumber = payload.episodeNumber ?? primary.episodeNumber ?? ep.episodeNumber;
    const explicitEnd =
      payload.multiEpisodeEnd !== undefined
        ? payload.multiEpisodeEnd
        : parts.length > 1
          ? Math.max(...parts.map((p) => p.episodeNumber))
          : ep.multiEpisodeEnd;
    const multiEpisodeEnd = explicitEnd != null && explicitEnd > episodeNumber ? explicitEnd : null;

    const base = path.basename(ep.filePath, path.extname(ep.filePath));
    const thumbPath = path.join(ep.folderPath, `${base}-thumb.jpg`);
    await saveArtworkToDisk(thumbPath, primary.thumbUrl, {
      kind: 'thumb',
      title: primary.title || ep.title,
      subtitle: show.title,
      episodeCode: `S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`,
      genres: show.genres,
      rating: primary.ratings?.[0]?.value ?? null,
    });

    const existingSubByKey = new Map(
      (ep.multiEpisodeParts ?? []).map((p) => [`${p.seasonNumber}:${p.episodeNumber}`, p])
    );
    const multiEpisodeParts: TvEpisodeSubEntry[] = parts.slice(1).map((part) => {
      const prev = existingSubByKey.get(`${part.seasonNumber}:${part.episodeNumber}`);
      return {
        seasonNumber: part.seasonNumber,
        episodeNumber: part.episodeNumber,
        displaySeason: prev?.displaySeason ?? null,
        displayEpisode: prev?.displayEpisode ?? null,
        title: part.title || `Episode ${part.episodeNumber}`,
        aired: part.aired ?? null,
        plot: part.plot || '',
        runtimeMinutes: part.runtimeMinutes ?? ep.runtimeMinutes,
        directors: part.directors ?? [],
        writers: part.writers ?? [],
        actors: part.actors ?? [],
        uniqueIds: { ...(prev?.uniqueIds ?? {}), ...(part.uniqueIds ?? {}) },
        ratings: part.ratings?.length ? part.ratings : prev?.ratings ?? [],
        userRating: prev?.userRating ?? null,
        playCount: prev?.playCount ?? 0,
        watched: prev?.watched ?? false,
        lastPlayed: prev?.lastPlayed ?? null,
      };
    });

    const updated = this.db.updateTvEpisode(ep.id, {
      scraped: true,
      showTitle: show.title,
      seasonNumber,
      episodeNumber,
      multiEpisodeEnd,
      multiEpisodeParts,
      title: primary.title || ep.title,
      aired: primary.aired ?? ep.aired,
      plot: primary.plot || ep.plot,
      runtimeMinutes: primary.runtimeMinutes ?? ep.runtimeMinutes,
      directors: primary.directors?.length ? primary.directors : ep.directors,
      writers: primary.writers?.length ? primary.writers : ep.writers,
      actors: primary.actors?.length ? primary.actors : ep.actors,
      ratings: primary.ratings?.length ? primary.ratings : ep.ratings,
      uniqueIds: { ...ep.uniqueIds, ...(primary.uniqueIds ?? {}) },
      thumbPath,
    });

    if (payload.showUniqueIds && Object.keys(payload.showUniqueIds).length > 0) {
      const mergedShowIds: UniqueIds = { ...show.uniqueIds };
      let changed = false;
      for (const [k, v] of Object.entries(payload.showUniqueIds)) {
        if (v && !mergedShowIds[k]) {
          mergedShowIds[k] = v;
          changed = true;
        }
      }
      if (changed) {
        this.db.updateTvShow(show.id, { uniqueIds: mergedShowIds });
      }
    }

    const shouldWriteNfo = payload.writeNfo ?? prefs.autoWriteNfoOnScrape;
    if (updated && shouldWriteNfo) {
      const epNfoPath = ep.nfoPath ?? path.join(ep.folderPath, `${base}.nfo`);
      const xml = serializeEpisodeNfo(updated);
      fs.writeFileSync(epNfoPath, xml, 'utf-8');
      const report = validateKodiNfoXml(xml);
      this.db.updateTvEpisode(updated.id, {
        nfoPath: epNfoPath,
        hasNfo: true,
        nfoValid: report.valid,
        nfoWarnings: report.warnings,
      });
    }

    const codeLabel =
      multiEpisodeEnd != null && multiEpisodeEnd > episodeNumber
        ? `S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}-E${String(multiEpisodeEnd).padStart(2, '0')}`
        : `S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`;
    this.db.logActivity(
      'scrape',
      'Scrape Episode',
      `Scraped ${show.title} ${codeLabel} (${parts.length} part${parts.length === 1 ? '' : 's'})`,
      'success'
    );

    return this.db.getTvEpisode(ep.id);
  }

  async scrapeEpisode(
    episodeId: number,
    opts?: {
      provider?: ScraperProviderId;
      externalId?: string;
      seasonNumber?: number;
      episodeNumber?: number;
      multiEpisodeEnd?: number | null;
      writeNfo?: boolean;
    }
  ): Promise<{ episode: TvEpisodeRecord | null; preview: EpisodeScrapePreview | null }> {
    const preview = await this.scrapeEpisodePreview(episodeId, opts);
    if (!preview) return { episode: null, preview: null };
    if (!preview.matched) {
      return { episode: this.db.getTvEpisode(episodeId), preview };
    }
    const episode = await this.applyEpisodeScrape(episodeId, {
      parts: preview.parts,
      showUniqueIds: preview.showUniqueIds,
      seasonNumber: preview.seasonNumber,
      episodeNumber: preview.episodeNumber,
      multiEpisodeEnd: preview.multiEpisodeEnd,
      writeNfo: opts?.writeNfo,
    });
    return { episode, preview };
  }

  async getArtworkCandidates(params: {
    mediaType: 'movie' | 'tvshow' | 'season' | 'episode';
    mediaId: number;
    kind: ArtworkKind;
    refresh?: boolean;
  }): Promise<ArtworkCandidate[]> {
    const dedupe = (items: ArtworkCandidate[]) => {
      const seen = new Set<string>();
      const out: ArtworkCandidate[] = [];
      for (const item of items) {
        if (!item.url || seen.has(item.url)) continue;
        seen.add(item.url);
        out.push(item);
      }
      return out;
    };

    const buildRenderFallbacks = (
      title: string,
      year: number | null,
      genres: string[],
      kind: ArtworkKind,
      opts?: { subtitle?: string; episodeCode?: string }
    ): ArtworkCandidate[] => {
      const qs = new URLSearchParams({
        kind,
        title,
        year: year ? String(year) : '',
        genres: genres.slice(0, 3).join(','),
      });
      if (opts?.subtitle) qs.set('subtitle', opts.subtitle);
      if (opts?.episodeCode) qs.set('episodeCode', opts.episodeCode);
      return [
        {
          kind,
          url: `/api/artwork/render?${qs.toString()}`,
          provider: 'kodi-catalog',
          label: 'Generated Artwork (Primary)',
        },
        {
          kind,
          url: `/api/artwork/render?${qs.toString()}&variant=alt`,
          provider: 'fanarttv',
          label: 'Generated Artwork (Alternate)',
        },
      ];
    };

    if (params.mediaType === 'movie') {
      const movie = this.db.getMovie(params.mediaId);
      if (!movie) return [];
      let byKind = movie.artworkCandidates?.[params.kind] ?? [];
      if (params.refresh || byKind.length === 0) {
        const query = movie.parsedInfo.cleanTitle || movie.title;
        const results = await this.search({ query, mediaKind: 'movie', year: movie.year ?? movie.parsedInfo.year });
        if (results.length > 0) {
          const bundle = await this.fetchBundle({
            externalId: results[0].externalId,
            provider: results[0].provider,
            mediaKind: 'movie',
          });
          if (bundle) {
            const grouped: Partial<Record<ArtworkKind, ArtworkCandidate[]>> = { ...(movie.artworkCandidates ?? {}) };
            for (const c of bundle.artwork) {
              const arr = grouped[c.kind] ?? [];
              if (!arr.some((x) => x.url === c.url)) arr.push(c);
              grouped[c.kind] = arr;
            }
            this.db.updateMovie(movie.id, { artworkCandidates: grouped });
            byKind = grouped[params.kind] ?? [];
          }
        }
      }
      const fallbacks = buildRenderFallbacks(movie.title, movie.year, movie.genres, params.kind);
      return dedupe([...byKind, ...fallbacks]);
    }

    if (params.mediaType === 'tvshow') {
      const show = this.db.getTvShow(params.mediaId);
      if (!show) return [];
      let byKind = show.artworkCandidates?.[params.kind] ?? [];
      if (params.refresh || byKind.length === 0) {
        const results = await this.search({ query: show.title, mediaKind: 'tvshow', year: show.year });
        if (results.length > 0) {
          const bundle = await this.fetchBundle({
            externalId: results[0].externalId,
            provider: results[0].provider,
            mediaKind: 'tvshow',
          });
          if (bundle) {
            const grouped: Partial<Record<ArtworkKind, ArtworkCandidate[]>> = { ...(show.artworkCandidates ?? {}) };
            for (const c of bundle.artwork) {
              const arr = grouped[c.kind] ?? [];
              if (!arr.some((x) => x.url === c.url)) arr.push(c);
              grouped[c.kind] = arr;
            }
            this.db.updateTvShow(show.id, { artworkCandidates: grouped });
            byKind = grouped[params.kind] ?? [];
          }
        }
      }
      const fallbacks = buildRenderFallbacks(show.title, show.year, show.genres, params.kind);
      return dedupe([...byKind, ...fallbacks]);
    }

    if (params.mediaType === 'season') {
      const season = this.db.getTvSeasonById(params.mediaId);
      if (!season) return [];
      const show = this.db.getTvShow(season.showId);
      if (!show) return [];
      const showCandidates = await this.getArtworkCandidates({
        mediaType: 'tvshow',
        mediaId: show.id,
        kind: params.kind === 'banner' ? 'banner' : 'poster',
        refresh: params.refresh,
      });
      const seasonFallbacks = buildRenderFallbacks(show.title, show.year, show.genres, params.kind, {
        subtitle: season.name,
      });
      return dedupe([...seasonFallbacks, ...showCandidates]);
    }

    // episode
    const ep = this.db.getTvEpisode(params.mediaId);
    if (!ep) return [];
    const show = this.db.getTvShow(ep.showId);
    const list: ArtworkCandidate[] = [];
    const guideEntry = show?.episodeGuide?.find(
      (g) => g.seasonNumber === ep.seasonNumber && g.episodeNumber === ep.episodeNumber
    );
    if (guideEntry?.thumbUrl) {
      list.push({
        kind: 'thumb',
        url: guideEntry.thumbUrl,
        provider: 'tvdb',
        label: `Episode Guide Still (${ep.title})`,
      });
    }
    const epCode = `S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}`;
    list.push(
      ...buildRenderFallbacks(ep.title, show?.year ?? null, show?.genres ?? [], 'thumb', {
        subtitle: show?.title ?? ep.showTitle,
        episodeCode: epCode,
      })
    );
    if (show) {
      const fanarts = await this.getArtworkCandidates({
        mediaType: 'tvshow',
        mediaId: show.id,
        kind: 'fanart',
        refresh: params.refresh,
      });
      list.push(...fanarts.map((c) => ({ ...c, kind: 'thumb' as ArtworkKind })));
    }
    return dedupe(list);
  }
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isConfidentMatch(
  targetTitle: string,
  targetYear: number | null,
  candTitle: string,
  candYear: number | null,
  candOriginalTitle?: string,
  allowSubstringIfYearExact = false
): boolean {
  const normTarget = normalizeTitle(targetTitle);
  const normCand = normalizeTitle(candTitle);
  const normOrig = candOriginalTitle ? normalizeTitle(candOriginalTitle) : '';
  if (!normTarget || (!normCand && !normOrig)) return false;

  const yearOk = targetYear === null || candYear === null || Math.abs(targetYear - candYear) <= 1;
  if (!yearOk) return false;

  if (normTarget === normCand || (normOrig && normTarget === normOrig)) return true;
  if (allowSubstringIfYearExact && targetYear !== null && candYear === targetYear) {
    return normCand.includes(normTarget) || normTarget.includes(normCand);
  }
  return false;
}

function providerRank(order: ScraperProviderId[], id: ScraperProviderId): number {
  const idx = order.indexOf(id);
  return idx === -1 ? 999 : idx;
}

function mergeBundles(
  primary: ScrapedMetadataBundle,
  secondary: ScrapedMetadataBundle,
  secondaryProvider: ScraperProviderId,
  mapping: ScraperFieldMapping
): ScrapedMetadataBundle {
  const sourcesUsed = [...new Set([...primary.sourcesUsed, secondaryProvider, ...secondary.sourcesUsed])];

  const uniqueIds = { ...primary.uniqueIds };
  for (const [k, v] of Object.entries(secondary.uniqueIds)) {
    if (v && !uniqueIds[k]) uniqueIds[k] = v;
  }

  const ratings = [...primary.ratings];
  for (const r of secondary.ratings) {
    if (!ratings.some((x) => x.source === r.source)) {
      ratings.push(r);
    }
  }

  const existingUrls = new Set(primary.artwork.map((a) => a.url));
  const mergedArtwork = [...primary.artwork];
  for (const a of secondary.artwork) {
    if (a.url && !existingUrls.has(a.url)) {
      existingUrls.add(a.url);
      mergedArtwork.push(a);
    }
  }
  mergedArtwork.sort(
    (a, b) => providerRank(mapping.artwork, a.provider) - providerRank(mapping.artwork, b.provider)
  );

  const preferSecondary = (field: keyof ScraperFieldMapping) =>
    providerRank(mapping[field], secondaryProvider) < providerRank(mapping[field], primary.provider);

  const title =
    !primary.title || (secondary.title && preferSecondary('title')) ? secondary.title : primary.title;
  const originalTitle = primary.originalTitle || secondary.originalTitle;
  const plot =
    !primary.plot || (secondary.plot && preferSecondary('plot') && secondary.plot.length >= 40)
      ? secondary.plot
      : primary.plot;
  const mpaa = !primary.mpaa || (secondary.mpaa && preferSecondary('certification')) ? secondary.mpaa : primary.mpaa;
  const actors =
    primary.actors.length === 0 || (secondary.actors.length > 0 && preferSecondary('cast'))
      ? secondary.actors
      : primary.actors;

  let episodes = primary.episodes;
  if ((!episodes || episodes.length === 0) && secondary.episodes?.length) {
    episodes = secondary.episodes;
  } else if (episodes && secondary.episodes?.length) {
    const preferSecEps = preferSecondary('episodeGuide');
    const byKey = new Map(secondary.episodes.map((e) => [`${e.seasonNumber}:${e.episodeNumber}`, e]));
    episodes = episodes.map((ep) => {
      const m = byKey.get(`${ep.seasonNumber}:${ep.episodeNumber}`);
      if (!m) return ep;
      return {
        ...ep,
        title: (preferSecEps && m.title) || ep.title || m.title,
        aired: (preferSecEps && m.aired) || ep.aired || m.aired,
        plot: (preferSecEps && m.plot) || ep.plot || m.plot,
        runtimeMinutes: ep.runtimeMinutes || m.runtimeMinutes,
        thumbUrl: (preferSecEps && m.thumbUrl) || ep.thumbUrl || m.thumbUrl,
        actors: ep.actors?.length ? ep.actors : m.actors,
        ratings: ep.ratings.length > 0 ? ep.ratings : m.ratings,
        uniqueIds: { ...m.uniqueIds, ...ep.uniqueIds },
      };
    });
    const existingKeys = new Set(episodes.map((e) => `${e.seasonNumber}:${e.episodeNumber}`));
    for (const m of secondary.episodes) {
      if (!existingKeys.has(`${m.seasonNumber}:${m.episodeNumber}`)) {
        episodes.push(m);
      }
    }
  }

  return {
    ...primary,
    sourcesUsed,
    dataOrigin:
      primary.dataOrigin !== secondary.dataOrigin ? 'hybrid' : primary.dataOrigin,
    title,
    originalTitle,
    sortTitle: primary.sortTitle || secondary.sortTitle || title,
    year: primary.year ?? secondary.year,
    premiered: primary.premiered ?? secondary.premiered,
    tagline: primary.tagline || secondary.tagline,
    plot,
    outline: primary.outline || secondary.outline || plot.slice(0, 180),
    runtimeMinutes: primary.runtimeMinutes ?? secondary.runtimeMinutes,
    mpaa,
    country: primary.country || secondary.country,
    status: primary.status ?? secondary.status,
    studios: [...new Set([...primary.studios, ...secondary.studios])],
    genres:
      primary.genres.length === 0 || (secondary.genres.length > 0 && preferSecondary('genres'))
        ? [...new Set([...secondary.genres, ...primary.genres])]
        : [...new Set([...primary.genres, ...secondary.genres])],
    tags: [...new Set([...primary.tags, ...secondary.tags])],
    directors: [...new Set([...primary.directors, ...secondary.directors])],
    writers: [...new Set([...primary.writers, ...secondary.writers])],
    actors,
    trailerUrl: primary.trailerUrl || secondary.trailerUrl,
    setName: primary.setName ?? secondary.setName,
    setOverview: primary.setOverview ?? secondary.setOverview,
    tmdbCollectionId: primary.tmdbCollectionId ?? secondary.tmdbCollectionId,
    uniqueIds,
    ratings,
    artwork: mergedArtwork,
    episodes,
  };
}

function filterRatingsByEnabledProviders(
  ratings: RatingEntry[],
  byId: Map<ScraperProviderId, ScraperProviderConfig>,
  _ratingOrder: ScraperProviderId[]
): RatingEntry[] {
  return ratings.filter((r) => {
    if (r.source === 'imdb' || r.source === 'rottentomatoes' || r.source === 'metacritic') {
      return byId.get('omdb')?.enabled || byId.get('kodi-catalog')?.enabled;
    }
    if (r.source === 'tmdb') return byId.get('tmdb')?.enabled || byId.get('kodi-catalog')?.enabled;
    if (r.source === 'trakt') return byId.get('trakt')?.enabled || byId.get('kodi-catalog')?.enabled;
    if (r.source === 'mal') return byId.get('jikan')?.enabled || byId.get('kodi-catalog')?.enabled;
    return true;
  });
}
