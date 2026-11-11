import type {
  ArtworkCandidate,
  ScrapedEpisodePart,
  ScrapedMetadataBundle,
  ScraperProviderConfig,
  ScraperSearchResult,
} from '../../../shared/types.js';
import { fetchJsonWithTimeout } from './httpHelper.js';

export async function searchTmdbLive(
  query: string,
  mediaKind: 'movie' | 'tvshow',
  year: number | null,
  cfg: ScraperProviderConfig
): Promise<ScraperSearchResult[]> {
  if (!cfg.apiKey) return [];
  const endpoint = mediaKind === 'movie' ? 'search/movie' : 'search/tv';
  const params = new URLSearchParams({
    query,
    language: cfg.language || 'en-US',
    include_adult: 'false',
  });
  if (year) {
    params.set(mediaKind === 'movie' ? 'year' : 'first_air_date_year', String(year));
  }

  const headers: Record<string, string> = {};
  if (cfg.apiKey.startsWith('eyJ')) {
    headers.Authorization = `Bearer ${cfg.apiKey}`;
  } else {
    params.set('api_key', cfg.apiKey);
  }

  const data = await fetchJsonWithTimeout<{ results?: Array<Record<string, unknown>> }>(
    `https://api.themoviedb.org/3/${endpoint}?${params.toString()}`,
    { headers }
  );
  if (!data?.results) return [];

  return data.results.slice(0, 8).map((r, idx) => {
    const title = String(r.title ?? r.name ?? '');
    const date = String(r.release_date ?? r.first_air_date ?? '');
    const parsedYear = date ? Number(date.slice(0, 4)) : null;
    return {
      externalId: String(r.id),
      provider: 'tmdb',
      mediaKind,
      title,
      originalTitle: String(r.original_title ?? r.original_name ?? title),
      year: parsedYear && !Number.isNaN(parsedYear) ? parsedYear : null,
      overview: String(r.overview ?? ''),
      posterUrl: r.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : undefined,
      confidence: Math.max(0.5, 0.96 - idx * 0.06),
      uniqueIds: { tmdb: String(r.id) },
      dataOrigin: 'live-api',
    };
  });
}

export async function fetchTmdbDetailsLive(
  externalId: string,
  mediaKind: 'movie' | 'tvshow',
  cfg: ScraperProviderConfig
): Promise<ScrapedMetadataBundle | null> {
  if (!cfg.apiKey) return null;
  const params = new URLSearchParams({
    language: cfg.language || 'en-US',
    append_to_response: 'credits,external_ids,images,videos,release_dates,content_ratings',
    include_image_language: 'en,null',
  });
  const headers: Record<string, string> = {};
  if (cfg.apiKey.startsWith('eyJ')) {
    headers.Authorization = `Bearer ${cfg.apiKey}`;
  } else {
    params.set('api_key', cfg.apiKey);
  }

  const pathPart = mediaKind === 'movie' ? `movie/${externalId}` : `tv/${externalId}`;
  const d = await fetchJsonWithTimeout<Record<string, unknown>>(
    `https://api.themoviedb.org/3/${pathPart}?${params.toString()}`,
    { headers }
  );
  if (!d || !d.id) return null;

  const title = String(d.title ?? d.name ?? '');
  const originalTitle = String(d.original_title ?? d.original_name ?? title);
  const premiered = String(d.release_date ?? d.first_air_date ?? '') || null;
  const year = premiered ? Number(premiered.slice(0, 4)) : null;

  const credits = (d.credits as Record<string, unknown> | undefined) ?? {};
  const castRaw = (credits.cast as Array<Record<string, unknown>> | undefined) ?? [];
  const crewRaw = (credits.crew as Array<Record<string, unknown>> | undefined) ?? [];

  const extIds = (d.external_ids as Record<string, unknown> | undefined) ?? {};
  const uniqueIds = {
    tmdb: String(d.id),
    imdb: extIds.imdb_id ? String(extIds.imdb_id) : undefined,
    tvdb: extIds.tvdb_id ? String(extIds.tvdb_id) : undefined,
  };

  const images = (d.images as Record<string, Array<Record<string, unknown>>> | undefined) ?? {};
  const artwork: ArtworkCandidate[] = [];
  for (const p of (images.posters ?? []).slice(0, 6)) {
    artwork.push({
      kind: 'poster',
      url: `https://image.tmdb.org/t/p/original${p.file_path}`,
      provider: 'tmdb',
      language: p.iso_639_1 ? String(p.iso_639_1) : undefined,
      width: Number(p.width ?? 0) || undefined,
      height: Number(p.height ?? 0) || undefined,
    });
  }
  for (const b of (images.backdrops ?? []).slice(0, 6)) {
    artwork.push({
      kind: 'fanart',
      url: `https://image.tmdb.org/t/p/original${b.file_path}`,
      provider: 'tmdb',
      width: Number(b.width ?? 0) || undefined,
      height: Number(b.height ?? 0) || undefined,
    });
  }
  for (const l of (images.logos ?? []).slice(0, 4)) {
    artwork.push({
      kind: 'clearlogo',
      url: `https://image.tmdb.org/t/p/original${l.file_path}`,
      provider: 'tmdb',
      width: Number(l.width ?? 0) || undefined,
      height: Number(l.height ?? 0) || undefined,
    });
  }

  const col = d.belongs_to_collection as Record<string, unknown> | undefined;
  const genres = ((d.genres as Array<Record<string, unknown>> | undefined) ?? []).map((g) => String(g.name));
  const studios = ((d.production_companies as Array<Record<string, unknown>> | undefined) ?? []).map((s) => String(s.name));
  const videos = ((d.videos as { results?: Array<Record<string, unknown>> } | undefined)?.results ?? []);
  const trailer = videos.find((v) => v.site === 'YouTube' && v.type === 'Trailer') ?? videos[0];

  const mpaa = extractTmdbCert(d, mediaKind);

  return {
    provider: 'tmdb',
    sourcesUsed: ['tmdb'],
    dataOrigin: 'live-api',
    title,
    originalTitle,
    sortTitle: title,
    year,
    premiered,
    tagline: String(d.tagline ?? ''),
    plot: String(d.overview ?? ''),
    outline: String(d.overview ?? '').slice(0, 180),
    runtimeMinutes: Number(d.runtime ?? (Array.isArray(d.episode_run_time) ? d.episode_run_time[0] : 0)) || null,
    mpaa,
    country: ((d.production_countries as Array<{ name: string }> | undefined) ?? []).map((c) => c.name).join(', '),
    status: d.status ? String(d.status) : undefined,
    studios,
    genres,
    tags: [],
    directors: crewRaw.filter((c) => c.job === 'Director').map((c) => String(c.name)),
    writers: crewRaw.filter((c) => c.department === 'Writing').map((c) => String(c.name)).slice(0, 4),
    actors: castRaw.slice(0, 15).map((a, idx) => ({
      name: String(a.name),
      role: String(a.character ?? ''),
      order: idx,
      thumb: a.profile_path ? `https://image.tmdb.org/t/p/w185${a.profile_path}` : undefined,
    })),
    trailerUrl: trailer?.key ? `https://www.youtube.com/watch?v=${trailer.key}` : '',
    setName: col?.name ? String(col.name) : undefined,
    tmdbCollectionId: col?.id ? String(col.id) : undefined,
    uniqueIds,
    ratings: d.vote_average
      ? [{ source: 'tmdb', value: Number(Number(d.vote_average).toFixed(1)), max: 10, votes: Number(d.vote_count ?? 0) }]
      : [],
    artwork,
  };
}

function extractTmdbCert(d: Record<string, unknown>, mediaKind: 'movie' | 'tvshow'): string {
  if (mediaKind === 'movie') {
    const rel = ((d.release_dates as { results?: Array<{ iso_3166_1: string; release_dates: Array<{ certification: string }> }> })?.results ?? []);
    const us = rel.find((r) => r.iso_3166_1 === 'US')?.release_dates.find((x) => x.certification);
    return us?.certification ? `Rated ${us.certification}` : '';
  }
  const cr = ((d.content_ratings as { results?: Array<{ iso_3166_1: string; rating: string }> })?.results ?? []);
  return cr.find((r) => r.iso_3166_1 === 'US')?.rating ?? '';
}

export async function fetchTmdbEpisodeLive(
  tmdbShowId: string,
  seasonNumber: number,
  episodeNumber: number,
  cfg: ScraperProviderConfig
): Promise<ScrapedEpisodePart | null> {
  if (!cfg.apiKey || !tmdbShowId) return null;
  const params = new URLSearchParams({
    language: cfg.language || 'en-US',
    append_to_response: 'credits,external_ids',
  });
  const headers: Record<string, string> = {};
  if (cfg.apiKey.startsWith('eyJ')) {
    headers.Authorization = `Bearer ${cfg.apiKey}`;
  } else {
    params.set('api_key', cfg.apiKey);
  }

  const d = await fetchJsonWithTimeout<Record<string, unknown>>(
    `https://api.themoviedb.org/3/tv/${encodeURIComponent(tmdbShowId)}/season/${seasonNumber}/episode/${episodeNumber}?${params.toString()}`,
    { headers }
  );
  if (!d || !d.id) return null;

  const credits = (d.credits as Record<string, unknown> | undefined) ?? {};
  const crewRaw = ((d.crew as Array<Record<string, unknown>> | undefined) ?? (credits.crew as Array<Record<string, unknown>> | undefined) ?? []);
  const guestsRaw = (
    (d.guest_stars as Array<Record<string, unknown>> | undefined) ??
    (credits.guest_stars as Array<Record<string, unknown>> | undefined) ??
    []
  );
  const castRaw = (credits.cast as Array<Record<string, unknown>> | undefined) ?? [];
  const extIds = (d.external_ids as Record<string, unknown> | undefined) ?? {};

  const seenActors = new Set<string>();
  const actors = [...guestsRaw, ...castRaw]
    .filter((a) => {
      const name = String(a.name ?? '').trim();
      if (!name || seenActors.has(name.toLowerCase())) return false;
      seenActors.add(name.toLowerCase());
      return true;
    })
    .slice(0, 12)
    .map((a, idx) => ({
      name: String(a.name),
      role: String(a.character ?? ''),
      order: idx,
      thumb: a.profile_path ? `https://image.tmdb.org/t/p/w185${a.profile_path}` : undefined,
    }));

  return {
    seasonNumber: Number(d.season_number ?? seasonNumber),
    episodeNumber: Number(d.episode_number ?? episodeNumber),
    title: String(d.name ?? `Episode ${episodeNumber}`),
    aired: d.air_date ? String(d.air_date) : null,
    plot: String(d.overview ?? ''),
    runtimeMinutes: d.runtime ? Number(d.runtime) : null,
    directors: [...new Set(crewRaw.filter((c) => c.job === 'Director').map((c) => String(c.name)))],
    writers: [...new Set(crewRaw.filter((c) => c.department === 'Writing').map((c) => String(c.name)).slice(0, 4))],
    actors,
    ratings: d.vote_average
      ? [{ source: 'tmdb', value: Number(Number(d.vote_average).toFixed(1)), max: 10, votes: Number(d.vote_count ?? 0) }]
      : [],
    uniqueIds: {
      tmdb: String(d.id),
      imdb: extIds.imdb_id ? String(extIds.imdb_id) : undefined,
      tvdb: extIds.tvdb_id ? String(extIds.tvdb_id) : undefined,
    },
    thumbUrl: d.still_path ? `https://image.tmdb.org/t/p/original${d.still_path}` : undefined,
    sourcesUsed: ['tmdb'],
  };
}
