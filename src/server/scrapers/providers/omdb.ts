import type { RatingEntry, ScrapedMetadataBundle, ScraperProviderConfig, ScraperSearchResult } from '../../../shared/types.js';
import { fetchJsonWithTimeout } from './httpHelper.js';

export async function searchOmdbLive(
  query: string,
  mediaKind: 'movie' | 'tvshow',
  year: number | null,
  cfg: ScraperProviderConfig
): Promise<ScraperSearchResult[]> {
  if (!cfg.apiKey) return [];
  const params = new URLSearchParams({
    apikey: cfg.apiKey,
    s: query,
    type: mediaKind === 'movie' ? 'movie' : 'series',
  });
  if (year) params.set('y', String(year));
  const data = await fetchJsonWithTimeout<{ Search?: Array<Record<string, string>>; Response?: string }>(
    `https://www.omdbapi.com/?${params.toString()}`
  );
  if (data?.Response !== 'True' || !data.Search) return [];
  return data.Search.slice(0, 6).map((r, i) => ({
    externalId: r.imdbID,
    provider: 'omdb',
    mediaKind,
    title: r.Title,
    year: r.Year ? Number(r.Year.slice(0, 4)) : null,
    overview: `${r.Type} (${r.Year}) — IMDb ${r.imdbID}`,
    posterUrl: r.Poster && r.Poster !== 'N/A' ? r.Poster : undefined,
    confidence: Math.max(0.5, 0.92 - i * 0.06),
    uniqueIds: { imdb: r.imdbID },
    dataOrigin: 'live-api',
  }));
}

export async function fetchOmdbEnrichmentLive(
  imdbId: string | undefined,
  title: string,
  year: number | null,
  cfg: ScraperProviderConfig
): Promise<{
  ratings: RatingEntry[];
  mpaa?: string;
  plot?: string;
  genres?: string[];
  imdbId?: string;
} | null> {
  if (!cfg.apiKey) return null;
  const params = new URLSearchParams({ apikey: cfg.apiKey, plot: 'full' });
  if (imdbId) params.set('i', imdbId);
  else {
    params.set('t', title);
    if (year) params.set('y', String(year));
  }
  const d = await fetchJsonWithTimeout<Record<string, unknown>>(`https://www.omdbapi.com/?${params.toString()}`);
  if (!d || d.Response !== 'True') return null;

  const ratings: RatingEntry[] = [];
  if (d.imdbRating && d.imdbRating !== 'N/A') {
    const votes = d.imdbVotes ? Number(String(d.imdbVotes).replace(/,/g, '')) : undefined;
    ratings.push({ source: 'imdb', value: Number(d.imdbRating), max: 10, votes, isDefault: true });
  }
  const omdbRatings = (d.Ratings as Array<{ Source: string; Value: string }> | undefined) ?? [];
  for (const r of omdbRatings) {
    if (r.Source === 'Rotten Tomatoes' && r.Value.endsWith('%')) {
      ratings.push({ source: 'rottentomatoes', value: Number(r.Value.replace('%', '')), max: 100 });
    } else if (r.Source === 'Metacritic' && r.Value.includes('/100')) {
      ratings.push({ source: 'metacritic', value: Number(r.Value.split('/')[0]), max: 100 });
    }
  }

  return {
    ratings,
    mpaa: d.Rated && d.Rated !== 'N/A' ? `Rated ${d.Rated}` : undefined,
    plot: d.Plot && d.Plot !== 'N/A' ? String(d.Plot) : undefined,
    genres: d.Genre && d.Genre !== 'N/A' ? String(d.Genre).split(',').map((g) => g.trim()) : undefined,
    imdbId: d.imdbID ? String(d.imdbID) : undefined,
  };
}

export async function fetchOmdbDetailsLive(
  imdbId: string,
  mediaKind: 'movie' | 'tvshow',
  cfg: ScraperProviderConfig
): Promise<ScrapedMetadataBundle | null> {
  if (!cfg.apiKey || !imdbId) return null;
  const params = new URLSearchParams({ apikey: cfg.apiKey, i: imdbId, plot: 'full' });
  const d = await fetchJsonWithTimeout<Record<string, unknown>>(`https://www.omdbapi.com/?${params.toString()}`);
  if (!d || d.Response !== 'True') return null;

  const ratings: RatingEntry[] = [];
  if (d.imdbRating && d.imdbRating !== 'N/A') {
    const votes = d.imdbVotes ? Number(String(d.imdbVotes).replace(/,/g, '')) : undefined;
    ratings.push({ source: 'imdb', value: Number(d.imdbRating), max: 10, votes, isDefault: true });
  }
  const omdbRatings = (d.Ratings as Array<{ Source: string; Value: string }> | undefined) ?? [];
  for (const r of omdbRatings) {
    if (r.Source === 'Rotten Tomatoes' && r.Value.endsWith('%')) {
      ratings.push({ source: 'rottentomatoes', value: Number(r.Value.replace('%', '')), max: 100 });
    } else if (r.Source === 'Metacritic' && r.Value.includes('/100')) {
      ratings.push({ source: 'metacritic', value: Number(r.Value.split('/')[0]), max: 100 });
    }
  }

  const splitNames = (val: unknown) =>
    val && val !== 'N/A'
      ? String(val)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  const title = String(d.Title ?? '');
  const yearMatch = String(d.Year ?? '').match(/\d{4}/);
  const year = yearMatch ? Number(yearMatch[0]) : null;
  const runtimeMatch = String(d.Runtime ?? '').match(/\d+/);
  const runtimeMinutes = runtimeMatch ? Number(runtimeMatch[0]) : null;
  const plot = d.Plot && d.Plot !== 'N/A' ? String(d.Plot) : '';
  const poster = d.Poster && d.Poster !== 'N/A' ? String(d.Poster) : undefined;

  let premiered: string | null = null;
  if (d.Released && d.Released !== 'N/A') {
    const parsed = new Date(String(d.Released));
    if (!Number.isNaN(parsed.getTime())) {
      premiered = parsed.toISOString().slice(0, 10);
    }
  }

  return {
    provider: 'omdb',
    sourcesUsed: ['omdb'],
    dataOrigin: 'live-api',
    title,
    originalTitle: title,
    sortTitle: title,
    year,
    premiered,
    tagline: '',
    plot,
    outline: plot.slice(0, 180),
    runtimeMinutes,
    mpaa: d.Rated && d.Rated !== 'N/A' ? `Rated ${d.Rated}` : '',
    country: d.Country && d.Country !== 'N/A' ? String(d.Country) : '',
    status: mediaKind === 'tvshow' ? 'Ended' : undefined,
    studios: [],
    genres: splitNames(d.Genre),
    tags: [],
    directors: splitNames(d.Director),
    writers: splitNames(d.Writer),
    actors: splitNames(d.Actors).map((name, idx) => ({ name, role: '', order: idx })),
    trailerUrl: '',
    uniqueIds: { imdb: d.imdbID ? String(d.imdbID) : imdbId },
    ratings,
    artwork: poster ? [{ kind: 'poster', url: poster, provider: 'omdb' }] : [],
  };
}

