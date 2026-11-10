import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SCRAPER_PROVIDERS, MediaDatabase } from '../src/server/db/database.js';
import { ScraperEngine } from '../src/server/scrapers/scraperEngine.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ScraperEngine keyless & demo mode scraping', () => {
  it('scrapes keyless providers (TVmaze, Jikan, iTunes, Wikidata) even without API keys and enriches demo catalog bundles', async () => {
    const calledUrls: string[] = [];
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      calledUrls.push(url);

      if (url.startsWith('https://api.tvmaze.com/search/shows')) {
        return jsonResponse([
          {
            score: 0.9,
            show: {
              id: 44933,
              name: 'Severance',
              premiered: '2022-02-18',
              summary: '<p>Live TVmaze Severance summary.</p>',
              externals: { imdb: 'tt11280740', thetvdb: 371980 },
            },
          },
        ]);
      }
      if (url.startsWith('https://api.tvmaze.com/shows/44933')) {
        return jsonResponse({
          id: 44933,
          name: 'Severance',
          premiered: '2022-02-18',
          summary: '<p>Live TVmaze Severance summary.</p>',
          averageRuntime: 50,
          status: 'Running',
          genres: ['Drama', 'Sci-Fi'],
          rating: { average: 8.6 },
          externals: { imdb: 'tt11280740', thetvdb: 371980 },
          webChannel: { name: 'Apple TV+' },
          _embedded: { episodes: [], cast: [], images: [] },
        });
      }
      if (url.startsWith('https://api.jikan.moe/v4/anime?')) {
        return jsonResponse({
          data: [
            {
              mal_id: 199,
              title: 'Sen to Chihiro no Kamikakushi',
              title_english: 'Spirited Away',
              title_japanese: '千と千尋の神隠し',
              year: 2001,
              synopsis: 'Chihiro enters a magical world.',
              images: { jpg: { large_image_url: 'https://cdn.example/spirited.jpg' } },
            },
          ],
        });
      }
      if (url.startsWith('https://api.jikan.moe/v4/anime/199/full')) {
        return jsonResponse({
          data: {
            mal_id: 199,
            title: 'Sen to Chihiro no Kamikakushi',
            title_english: 'Spirited Away',
            title_japanese: '千と千尋の神隠し',
            year: 2001,
            aired: { from: '2001-07-20T00:00:00+00:00' },
            duration: '2 hr 5 min',
            rating: 'PG',
            score: 8.77,
            scored_by: 1200000,
            synopsis: 'Chihiro wanders into a spirit realm.',
            genres: [{ name: 'Adventure' }, { name: 'Fantasy' }],
            themes: [],
            studios: [{ name: 'Studio Ghibli' }],
            images: { jpg: { large_image_url: 'https://cdn.example/spirited.jpg' } },
          },
        });
      }
      if (url.startsWith('https://itunes.apple.com/search')) {
        const isMovie = url.includes('media=movie');
        return jsonResponse({
          results: isMovie
            ? [
                {
                  trackId: 9001,
                  trackName: 'Spirited Away',
                  artistName: 'Hayao Miyazaki',
                  releaseDate: '2001-07-20T07:00:00Z',
                  primaryGenreName: 'Anime',
                  longDescription: 'iTunes plot for Spirited Away.',
                  contentAdvisoryRating: 'PG',
                  trackTimeMillis: 125 * 60000,
                  artworkUrl100: 'https://is1.mzstatic.com/100x100bb.jpg',
                },
              ]
            : [
                {
                  collectionId: 8001,
                  collectionName: 'Severance, Season 1',
                  artistName: 'Apple TV+',
                  releaseDate: '2022-02-18T08:00:00Z',
                  primaryGenreName: 'Drama',
                  longDescription: 'iTunes Severance description.',
                  artworkUrl100: 'https://is1.mzstatic.com/100x100bb.jpg',
                },
              ],
        });
      }
      if (url.startsWith('https://itunes.apple.com/lookup')) {
        const isTv = url.includes('entity=tvEpisode');
        return jsonResponse({
          results: isTv
            ? [
                {
                  collectionId: 8001,
                  collectionName: 'Severance, Season 1',
                  artistName: 'Apple TV+',
                  releaseDate: '2022-02-18T08:00:00Z',
                  primaryGenreName: 'Drama',
                  longDescription: 'iTunes Severance description.',
                  artworkUrl100: 'https://is1.mzstatic.com/100x100bb.jpg',
                },
              ]
            : [
                {
                  trackId: 9001,
                  trackName: 'Spirited Away',
                  artistName: 'Hayao Miyazaki',
                  releaseDate: '2001-07-20T07:00:00Z',
                  primaryGenreName: 'Anime',
                  longDescription: 'iTunes plot for Spirited Away.',
                  contentAdvisoryRating: 'PG',
                  trackTimeMillis: 125 * 60000,
                  artworkUrl100: 'https://is1.mzstatic.com/100x100bb.jpg',
                },
              ],
        });
      }
      if (url.startsWith('https://en.wikipedia.org/w/api.php')) {
        const isSearch = url.includes('generator=search');
        const isSeverance = url.includes('Severance');
        return jsonResponse({
          query: {
            pages: {
              '12345': {
                pageid: 12345,
                title: isSeverance ? 'Severance (TV series)' : 'Spirited Away',
                extract: isSeverance ? 'Wikipedia Severance summary.' : 'Wikipedia Spirited Away summary.',
                pageprops: { wikibase_item: isSeverance ? 'Q999' : 'Q155653' },
                thumbnail: { source: isSearch ? 'https://upload.wikimedia.org/thumb.jpg' : 'https://upload.wikimedia.org/thumb.jpg' },
              },
            },
          },
        });
      }
      if (url.startsWith('https://www.wikidata.org/w/api.php')) {
        const isQ999 = url.includes('Q999');
        return jsonResponse({
          entities: {
            [isQ999 ? 'Q999' : 'Q155653']: {
              claims: {
                P345: [{ mainsnak: { datavalue: { value: isQ999 ? 'tt11280740' : 'tt0245429' } } }],
              },
            },
          },
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    }) as typeof fetch;

    const db = new MediaDatabase(':memory:');
    // Ensure ALL API keys are blank (default demo mode)
    const providers = DEFAULT_SCRAPER_PROVIDERS.map((p) => ({ ...p, apiKey: '' }));
    db.setSetting('scraper_providers', providers);
    const engine = new ScraperEngine(db);

    // 1. Search TV shows with NO API keys input -> keyless providers + catalog all return results
    const tvResults = await engine.search({ query: 'Severance', mediaKind: 'tvshow', year: 2022 });
    const resultProviders = new Set(tvResults.map((r) => r.provider));
    expect(resultProviders.has('tvmaze')).toBe(true);
    expect(resultProviders.has('itunes')).toBe(true);
    expect(resultProviders.has('wikidata')).toBe(true);
    expect(resultProviders.has('kodi-catalog')).toBe(true);

    // Keyed providers without API keys must NOT be called
    expect(calledUrls.some((u) => u.includes('themoviedb.org') || u.includes('omdbapi.com') || u.includes('thetvdb.com'))).toBe(
      false
    );

    // 2. Demo mode bundle (catalog:severance) STILL scrapes keyless live providers (TVmaze, iTunes, Wikidata)
    const demoBundle = await engine.fetchBundle({
      externalId: 'catalog:severance',
      provider: 'kodi-catalog',
      mediaKind: 'tvshow',
    });
    expect(demoBundle).toBeTruthy();
    expect(demoBundle!.sourcesUsed).toContain('kodi-catalog');
    expect(demoBundle!.sourcesUsed).toContain('tvmaze');
    expect(demoBundle!.sourcesUsed).toContain('itunes');
    expect(demoBundle!.sourcesUsed).toContain('wikidata');
    expect(demoBundle!.dataOrigin).toBe('hybrid');
    expect(demoBundle!.ratings.some((r) => r.source === 'tvmaze')).toBe(true);

    // 3. Keyless Jikan bundle resolves properly & enriches with iTunes/Wikidata/Demo Catalog
    const jikanBundle = await engine.fetchBundle({
      externalId: '199',
      provider: 'jikan',
      mediaKind: 'movie',
    });
    expect(jikanBundle).toBeTruthy();
    expect(jikanBundle!.title).toBe('Spirited Away');
    expect(jikanBundle!.sourcesUsed).toContain('jikan');
    expect(jikanBundle!.sourcesUsed).toContain('itunes');
    expect(jikanBundle!.sourcesUsed).toContain('wikidata');
    expect(jikanBundle!.sourcesUsed).toContain('kodi-catalog');
    expect(jikanBundle!.ratings.some((r) => r.source === 'mal')).toBe(true);
    expect(jikanBundle!.uniqueIds.imdb).toBe('tt0245429');

    db.close();
  });

  it('respects enabled=false on keyless scrapers while scraping enabled ones regardless of apiKey field', async () => {
    const calledUrls: string[] = [];
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      calledUrls.push(url);
      return jsonResponse({ data: [], results: [], query: { pages: {} } });
    }) as typeof fetch;

    const db = new MediaDatabase(':memory:');
    const providers = DEFAULT_SCRAPER_PROVIDERS.map((p) => {
      if (p.id === 'tvmaze') return { ...p, enabled: true, apiKey: '' };
      if (p.id === 'jikan') return { ...p, enabled: false, apiKey: 'ignored-key' };
      if (p.id === 'itunes') return { ...p, enabled: true, apiKey: 'even-if-set' };
      return p;
    });
    db.setSetting('scraper_providers', providers);
    const engine = new ScraperEngine(db);

    await engine.search({ query: 'Test Show', mediaKind: 'tvshow' });

    expect(calledUrls.some((u) => u.includes('api.tvmaze.com'))).toBe(true);
    expect(calledUrls.some((u) => u.includes('itunes.apple.com'))).toBe(true);
    expect(calledUrls.some((u) => u.includes('api.jikan.moe'))).toBe(false);

    db.close();
  });
});
