import type {
  ArtworkCandidate,
  ScrapedEpisodePart,
  ScrapedMetadataBundle,
  ScraperProviderConfig,
  ScraperSearchResult,
} from '../../../shared/types.js';
import { fetchJsonWithTimeout } from './httpHelper.js';

export async function searchTvmazeLive(query: string): Promise<ScraperSearchResult[]> {
  const data = await fetchJsonWithTimeout<Array<{ score: number; show: Record<string, unknown> }>>(
    `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`
  );
  if (!Array.isArray(data)) return [];
  return data.slice(0, 6).map((item) => {
    const s = item.show;
    const premiered = s.premiered ? String(s.premiered) : '';
    const image = s.image as { medium?: string; original?: string } | undefined;
    const externals = s.externals as { imdb?: string; thetvdb?: number } | undefined;
    return {
      externalId: String(s.id),
      provider: 'tvmaze',
      mediaKind: 'tvshow',
      title: String(s.name ?? ''),
      year: premiered ? Number(premiered.slice(0, 4)) : null,
      overview: String(s.summary ?? '').replace(/<[^>]+>/g, ''),
      posterUrl: image?.medium ?? image?.original,
      confidence: Math.min(0.95, Math.max(0.55, (item.score ?? 0.7) / 1.1)),
      uniqueIds: {
        tvmaze: String(s.id),
        imdb: externals?.imdb ?? undefined,
        tvdb: externals?.thetvdb ? String(externals.thetvdb) : undefined,
      },
      dataOrigin: 'live-api',
    };
  });
}

export async function fetchTvmazeDetailsLive(showId: string): Promise<ScrapedMetadataBundle | null> {
  const show = await fetchJsonWithTimeout<Record<string, unknown>>(
    `https://api.tvmaze.com/shows/${encodeURIComponent(showId)}?embed[]=episodes&embed[]=cast&embed[]=images`
  );
  if (!show || !show.id) return null;

  const embedded = (show._embedded as Record<string, unknown> | undefined) ?? {};
  const epsRaw = (embedded.episodes as Array<Record<string, unknown>> | undefined) ?? [];
  const castRaw = (embedded.cast as Array<{ person?: Record<string, unknown>; character?: Record<string, unknown> }> | undefined) ?? [];
  const imagesRaw = (embedded.images as Array<{ type?: string; resolutions?: { original?: { url?: string; width?: number; height?: number } } }> | undefined) ?? [];
  const externals = (show.externals as { imdb?: string; thetvdb?: number } | undefined) ?? {};
  const ratingObj = (show.rating as { average?: number } | undefined) ?? {};
  const image = (show.image as { original?: string } | undefined) ?? {};

  const artwork: ArtworkCandidate[] = [];
  if (image.original) {
    artwork.push({ kind: 'poster', url: image.original, provider: 'tvmaze' });
  }
  for (const img of imagesRaw.slice(0, 12)) {
    const url = img.resolutions?.original?.url;
    if (!url) continue;
    const width = img.resolutions?.original?.width;
    const height = img.resolutions?.original?.height;
    if (img.type === 'poster' && url !== image.original) {
      artwork.push({ kind: 'poster', url, provider: 'tvmaze', width, height });
    } else if (img.type === 'background') {
      artwork.push({ kind: 'fanart', url, provider: 'tvmaze', width, height });
    } else if (img.type === 'banner') {
      artwork.push({ kind: 'banner', url, provider: 'tvmaze', width, height });
    }
  }

  return {
    provider: 'tvmaze',
    sourcesUsed: ['tvmaze'],
    dataOrigin: 'live-api',
    title: String(show.name ?? ''),
    originalTitle: String(show.name ?? ''),
    sortTitle: String(show.name ?? ''),
    year: show.premiered ? Number(String(show.premiered).slice(0, 4)) : null,
    premiered: show.premiered ? String(show.premiered) : null,
    tagline: '',
    plot: String(show.summary ?? '').replace(/<[^>]+>/g, ''),
    outline: String(show.summary ?? '').replace(/<[^>]+>/g, '').slice(0, 180),
    runtimeMinutes: Number(show.averageRuntime ?? show.runtime ?? 45) || 45,
    mpaa: '',
    country: String(((show.network as { country?: { name?: string } } | undefined)?.country?.name) ?? ''),
    status: String(show.status ?? 'Ended'),
    studios: [(show.network as { name?: string } | undefined)?.name ?? (show.webChannel as { name?: string } | undefined)?.name ?? ''].filter(Boolean),
    genres: (show.genres as string[] | undefined) ?? [],
    tags: [],
    directors: [],
    writers: [],
    actors: castRaw.slice(0, 12).map((c, idx) => ({
      name: String(c.person?.name ?? ''),
      role: String(c.character?.name ?? ''),
      order: idx,
      thumb: (c.person?.image as { medium?: string } | undefined)?.medium,
    })),
    trailerUrl: '',
    uniqueIds: {
      tvmaze: String(show.id),
      imdb: externals.imdb ?? undefined,
      tvdb: externals.thetvdb ? String(externals.thetvdb) : undefined,
    },
    ratings: ratingObj.average ? [{ source: 'tvmaze', value: ratingObj.average, max: 10 }] : [],
    artwork,
    episodes: epsRaw.map((e) => ({
      seasonNumber: Number(e.season ?? 1),
      episodeNumber: Number(e.number ?? 1),
      title: String(e.name ?? ''),
      aired: e.airdate ? String(e.airdate) : null,
      plot: String(e.summary ?? '').replace(/<[^>]+>/g, ''),
      runtimeMinutes: Number(e.runtime ?? 45) || 45,
      directors: [],
      writers: [],
      ratings: (e.rating as { average?: number } | undefined)?.average
        ? [{ source: 'tvmaze', value: Number((e.rating as { average: number }).average), max: 10 }]
        : [],
      uniqueIds: { tvmaze: String(e.id) },
      thumbUrl: (e.image as { original?: string } | undefined)?.original,
    })),
  };
}

export async function fetchTvmazeEpisodeLive(
  tvmazeShowId: string,
  seasonNumber: number,
  episodeNumber: number
): Promise<ScrapedEpisodePart | null> {
  if (!tvmazeShowId) return null;
  const e = await fetchJsonWithTimeout<Record<string, unknown>>(
    `https://api.tvmaze.com/shows/${encodeURIComponent(tvmazeShowId)}/episodebynumber?season=${seasonNumber}&number=${episodeNumber}`
  );
  if (!e || !e.id) return null;

  const guests = await fetchJsonWithTimeout<
    Array<{ person?: { name?: string; image?: { medium?: string } }; character?: { name?: string } }>
  >(`https://api.tvmaze.com/episodes/${encodeURIComponent(String(e.id))}/guestcast`);

  const ratingObj = e.rating as { average?: number } | undefined;
  return {
    seasonNumber: Number(e.season ?? seasonNumber),
    episodeNumber: Number(e.number ?? episodeNumber),
    title: String(e.name ?? `Episode ${episodeNumber}`),
    aired: e.airdate ? String(e.airdate) : null,
    plot: String(e.summary ?? '').replace(/<[^>]+>/g, ''),
    runtimeMinutes: e.runtime ? Number(e.runtime) : null,
    directors: [],
    writers: [],
    actors: Array.isArray(guests)
      ? guests
          .filter((g) => g.person?.name)
          .slice(0, 12)
          .map((g, idx) => ({
            name: String(g.person!.name),
            role: String(g.character?.name ?? ''),
            order: idx,
            thumb: g.person?.image?.medium,
          }))
      : [],
    ratings: ratingObj?.average ? [{ source: 'tvmaze', value: Number(ratingObj.average), max: 10 }] : [],
    uniqueIds: { tvmaze: String(e.id) },
    thumbUrl: (e.image as { original?: string } | undefined)?.original,
    sourcesUsed: ['tvmaze'],
  };
}

async function loginTvdbToken(cfg: ScraperProviderConfig): Promise<string | null> {
  if (!cfg.apiKey) return null;
  const loginRes = await fetchJsonWithTimeout<{ data?: { token?: string } }>('https://api4.thetvdb.com/v4/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apikey: cfg.apiKey, ...(cfg.secondaryKey ? { pin: cfg.secondaryKey } : {}) }),
  });
  return loginRes?.data?.token ?? null;
}

export async function searchTvdbLive(
  query: string,
  mediaKind: 'movie' | 'tvshow',
  cfg: ScraperProviderConfig
): Promise<ScraperSearchResult[]> {
  const token = await loginTvdbToken(cfg);
  if (!token) return [];

  const type = mediaKind === 'movie' ? 'movie' : 'series';
  const searchRes = await fetchJsonWithTimeout<{ data?: Array<Record<string, unknown>> }>(
    `https://api4.thetvdb.com/v4/search?query=${encodeURIComponent(query)}&type=${type}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!searchRes?.data) return [];
  return searchRes.data.slice(0, 6).map((item, i) => ({
    externalId: String(item.tvdb_id ?? item.id ?? ''),
    provider: 'tvdb',
    mediaKind,
    title: String(item.name ?? ''),
    year: item.year ? Number(item.year) : null,
    overview: String(item.overview ?? ''),
    posterUrl: item.image_url ? String(item.image_url) : undefined,
    confidence: Math.max(0.5, 0.94 - i * 0.06),
    uniqueIds: { tvdb: String(item.tvdb_id ?? '') },
    dataOrigin: 'live-api',
  }));
}

export async function fetchTvdbDetailsLive(
  tvdbId: string,
  mediaKind: 'movie' | 'tvshow',
  cfg: ScraperProviderConfig
): Promise<ScrapedMetadataBundle | null> {
  const token = await loginTvdbToken(cfg);
  if (!token || !tvdbId) return null;
  const cleanId = tvdbId.replace(/^(series|movie)-/i, '');
  const endpoint = mediaKind === 'movie' ? `movies/${cleanId}/extended` : `series/${cleanId}/extended`;
  const res = await fetchJsonWithTimeout<{ data?: Record<string, unknown> }>(
    `https://api4.thetvdb.com/v4/${endpoint}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const d = res?.data;
  if (!d) return null;

  const title = String(d.name ?? '');
  const premiered = d.firstAired ? String(d.firstAired) : null;
  const year = premiered ? Number(premiered.slice(0, 4)) : d.year ? Number(d.year) : null;
  const overview = String(d.overview ?? '');
  const genres = ((d.genres as Array<{ name?: string }> | undefined) ?? []).map((g) => String(g.name ?? '')).filter(Boolean);
  const characters = ((d.characters as Array<Record<string, unknown>> | undefined) ?? []).slice(0, 15);
  const remoteIds = (d.remoteIds as Array<{ id?: string; sourceName?: string }> | undefined) ?? [];
  const imdbRemote = remoteIds.find((r) => String(r.sourceName ?? '').toLowerCase().includes('imdb'));
  const tmdbRemote = remoteIds.find((r) => String(r.sourceName ?? '').toLowerCase().includes('themoviedb'));

  const artwork: ArtworkCandidate[] = [];
  if (d.image) artwork.push({ kind: 'poster', url: String(d.image), provider: 'tvdb' });
  const artworks = (d.artworks as Array<{ type?: number; image?: string; width?: number; height?: number }> | undefined) ?? [];
  for (const a of artworks.slice(0, 12)) {
    if (!a.image) continue;
    if (a.type === 2 || a.type === 7) artwork.push({ kind: 'poster', url: a.image, provider: 'tvdb', width: a.width, height: a.height });
    else if (a.type === 3 || a.type === 15) artwork.push({ kind: 'fanart', url: a.image, provider: 'tvdb', width: a.width, height: a.height });
    else if (a.type === 1 || a.type === 16) artwork.push({ kind: 'banner', url: a.image, provider: 'tvdb', width: a.width, height: a.height });
    else if (a.type === 23 || a.type === 22) artwork.push({ kind: 'clearlogo', url: a.image, provider: 'tvdb', width: a.width, height: a.height });
  }

  let episodes: ScrapedMetadataBundle['episodes'] = undefined;
  if (mediaKind === 'tvshow') {
    const epRes = await fetchJsonWithTimeout<{ data?: { episodes?: Array<Record<string, unknown>> } }>(
      `https://api4.thetvdb.com/v4/series/${cleanId}/episodes/default`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const rawEps = epRes?.data?.episodes ?? [];
    if (rawEps.length > 0) {
      episodes = rawEps.map((e) => ({
        seasonNumber: Number(e.seasonNumber ?? 1),
        episodeNumber: Number(e.number ?? 1),
        title: String(e.name ?? ''),
        aired: e.aired ? String(e.aired) : null,
        plot: String(e.overview ?? ''),
        runtimeMinutes: Number(e.runtime ?? 45) || 45,
        directors: [],
        writers: [],
        ratings: [],
        uniqueIds: { tvdb: String(e.id ?? '') },
        thumbUrl: e.image ? String(e.image) : undefined,
      }));
    }
  }

  return {
    provider: 'tvdb',
    sourcesUsed: ['tvdb'],
    dataOrigin: 'live-api',
    title,
    originalTitle: title,
    sortTitle: title,
    year,
    premiered,
    tagline: '',
    plot: overview,
    outline: overview.slice(0, 180),
    runtimeMinutes: Number(d.averageRuntime ?? d.runtime ?? 45) || null,
    mpaa: '',
    country: d.originalCountry ? String(d.originalCountry) : '',
    status: (d.status as { name?: string } | undefined)?.name ?? undefined,
    studios: [],
    genres,
    tags: [],
    directors: [],
    writers: [],
    actors: characters.map((c, idx) => ({
      name: String(c.personName ?? c.name ?? ''),
      role: String(c.name ?? ''),
      order: idx,
      thumb: c.personImgURL ? String(c.personImgURL) : undefined,
    })),
    trailerUrl: '',
    uniqueIds: {
      tvdb: String(d.id ?? cleanId),
      imdb: imdbRemote?.id,
      tmdb: tmdbRemote?.id,
    },
    ratings: d.score ? [{ source: 'tvdb', value: Number(d.score), max: 10 }] : [],
    artwork,
    episodes,
  };
}

export async function fetchFanartLive(
  mediaKind: 'movie' | 'tvshow',
  id: string,
  cfg: ScraperProviderConfig
): Promise<ArtworkCandidate[]> {
  if (!cfg.apiKey || !id) return [];
  const endpoint = mediaKind === 'movie' ? `movies/${id}` : `tv/${id}`;
  const data = await fetchJsonWithTimeout<Record<string, Array<Record<string, unknown>>>>(
    `https://webservice.fanart.tv/v3/${endpoint}?api_key=${encodeURIComponent(cfg.apiKey)}`
  );
  if (!data) return [];
  const out: ArtworkCandidate[] = [];
  const addList = (arr: Array<Record<string, unknown>> | undefined, kind: ArtworkCandidate['kind']) => {
    for (const item of (arr ?? []).slice(0, 4)) {
      if (item.url) {
        out.push({
          kind,
          url: String(item.url),
          provider: 'fanarttv',
          language: item.lang ? String(item.lang) : undefined,
          score: item.likes ? Number(item.likes) : undefined,
        });
      }
    }
  };
  if (mediaKind === 'movie') {
    addList(data.movieposter, 'poster');
    addList(data.moviebackground, 'fanart');
    addList(data.hdmovielogo, 'clearlogo');
    addList(data.hdmovieclearart, 'clearart');
    addList(data.moviedisc, 'disc');
    addList(data.moviebanner, 'banner');
    addList(data.moviethumb, 'landscape');
  } else {
    addList(data.tvposter, 'poster');
    addList(data.showbackground, 'fanart');
    addList(data.hdtvlogo, 'clearlogo');
    addList(data.hdclearart, 'clearart');
    addList(data.tvbanner, 'banner');
    addList(data.tvthumb, 'landscape');
  }
  return out;
}

export async function searchJikanLive(
  query: string,
  mediaKind: 'movie' | 'tvshow'
): Promise<ScraperSearchResult[]> {
  const typeParam = mediaKind === 'movie' ? '&type=movie' : '';
  const data = await fetchJsonWithTimeout<{ data?: Array<Record<string, unknown>> }>(
    `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=6${typeParam}`
  );
  if (!data?.data) return [];
  return data.data.map((a, idx) => {
    const aired = a.aired as { from?: string } | undefined;
    const year = a.year ? Number(a.year) : aired?.from ? Number(String(aired.from).slice(0, 4)) : null;
    return {
      externalId: String(a.mal_id),
      provider: 'jikan',
      mediaKind,
      title: String(a.title_english ?? a.title ?? ''),
      originalTitle: String(a.title_japanese ?? a.title ?? ''),
      year: year && !Number.isNaN(year) ? year : null,
      overview: String(a.synopsis ?? ''),
      posterUrl: ((a.images as Record<string, { image_url?: string; large_image_url?: string }> | undefined)?.jpg?.large_image_url)
        ?? ((a.images as Record<string, { image_url?: string }> | undefined)?.jpg?.image_url)
        ?? undefined,
      confidence: Math.max(0.45, 0.88 - idx * 0.08),
      uniqueIds: { mal: String(a.mal_id) },
      dataOrigin: 'live-api',
    };
  });
}

function parseJikanDurationMinutes(raw: unknown): number | null {
  if (!raw) return null;
  const s = String(raw);
  const hr = s.match(/(\d+)\s*hr/i);
  const min = s.match(/(\d+)\s*min/i);
  const total = (hr ? Number(hr[1]) * 60 : 0) + (min ? Number(min[1]) : 0);
  return total > 0 ? total : null;
}

export async function fetchJikanDetailsLive(
  malId: string,
  mediaKind: 'movie' | 'tvshow'
): Promise<ScrapedMetadataBundle | null> {
  const res = await fetchJsonWithTimeout<{ data?: Record<string, unknown> }>(
    `https://api.jikan.moe/v4/anime/${encodeURIComponent(malId)}/full`
  );
  const a = res?.data;
  if (!a || !a.mal_id) return null;

  const aired = (a.aired as { from?: string } | undefined) ?? {};
  const premiered = aired.from ? String(aired.from).slice(0, 10) : null;
  const year = a.year ? Number(a.year) : premiered ? Number(premiered.slice(0, 4)) : null;
  const title = String(a.title_english ?? a.title ?? '');
  const originalTitle = String(a.title_japanese ?? a.title ?? title);
  const synopsis = String(a.synopsis ?? '').replace(/\s*\[Written by MAL Rewrite\]\s*/gi, '').trim();

  const genres = [
    ...((a.genres as Array<{ name?: string }> | undefined) ?? []),
    ...((a.themes as Array<{ name?: string }> | undefined) ?? []),
  ]
    .map((g) => String(g.name ?? ''))
    .filter(Boolean);
  const studios = ((a.studios as Array<{ name?: string }> | undefined) ?? []).map((s) => String(s.name ?? '')).filter(Boolean);
  const jpg = (a.images as { jpg?: { large_image_url?: string; image_url?: string } } | undefined)?.jpg;
  const posterUrl = jpg?.large_image_url ?? jpg?.image_url;
  const trailer = (a.trailer as { url?: string } | undefined)?.url ?? '';

  let episodes: ScrapedMetadataBundle['episodes'] = undefined;
  if (mediaKind === 'tvshow') {
    const epRes = await fetchJsonWithTimeout<{ data?: Array<Record<string, unknown>> }>(
      `https://api.jikan.moe/v4/anime/${encodeURIComponent(malId)}/episodes?page=1`
    );
    if (Array.isArray(epRes?.data) && epRes.data.length > 0) {
      episodes = epRes.data.map((e, idx) => ({
        seasonNumber: 1,
        episodeNumber: Number(e.mal_id ?? idx + 1),
        title: String(e.title ?? `Episode ${idx + 1}`),
        aired: e.aired ? String(e.aired).slice(0, 10) : null,
        plot: '',
        runtimeMinutes: parseJikanDurationMinutes(a.duration) ?? 24,
        directors: [],
        writers: [],
        ratings: e.score ? [{ source: 'mal', value: Number(e.score), max: 10 }] : [],
        uniqueIds: { mal: `${malId}-ep-${e.mal_id ?? idx + 1}` },
      }));
    }
  }

  return {
    provider: 'jikan',
    sourcesUsed: ['jikan'],
    dataOrigin: 'live-api',
    title,
    originalTitle,
    sortTitle: title,
    year: year && !Number.isNaN(year) ? year : null,
    premiered,
    tagline: '',
    plot: synopsis,
    outline: synopsis.slice(0, 180),
    runtimeMinutes: parseJikanDurationMinutes(a.duration),
    mpaa: a.rating ? String(a.rating) : '',
    country: 'Japan',
    status: a.airing ? 'Continuing' : 'Ended',
    studios,
    genres: [...new Set(genres)],
    tags: ['anime'],
    directors: [],
    writers: [],
    actors: [],
    trailerUrl: trailer,
    uniqueIds: { mal: String(a.mal_id) },
    ratings: a.score
      ? [{ source: 'mal', value: Number(Number(a.score).toFixed(1)), max: 10, votes: a.scored_by ? Number(a.scored_by) : undefined }]
      : [],
    artwork: posterUrl ? [{ kind: 'poster', url: posterUrl, provider: 'jikan' }] : [],
    episodes,
  };
}

function upgradeItunesArt(url?: string): string | undefined {
  if (!url) return undefined;
  return url.replace(/\/\d+x\d+bb\.(jpg|jpeg|png)$/i, '/600x600bb.$1');
}

export async function searchItunesLive(
  query: string,
  mediaKind: 'movie' | 'tvshow',
  year: number | null
): Promise<ScraperSearchResult[]> {
  const media = mediaKind === 'movie' ? 'movie' : 'tvShow';
  const entity = mediaKind === 'movie' ? 'movie' : 'tvSeason';
  const data = await fetchJsonWithTimeout<{ results?: Array<Record<string, unknown>> }>(
    `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=${media}&entity=${entity}&limit=8`
  );
  if (!Array.isArray(data?.results)) return [];

  const seenShowNames = new Set<string>();
  const out: ScraperSearchResult[] = [];
  for (const r of data.results) {
    const rawName =
      mediaKind === 'movie'
        ? String(r.trackName ?? '')
        : String(r.collectionName ?? r.artistName ?? '').replace(/,\s*Season\s+\d+$/i, '').trim();
    const id = mediaKind === 'movie' ? r.trackId : r.collectionId;
    if (!rawName || !id) continue;

    const dedup = `${rawName.toLowerCase()}::${mediaKind}`;
    if (seenShowNames.has(dedup)) continue;
    seenShowNames.add(dedup);

    const relYear = r.releaseDate ? Number(String(r.releaseDate).slice(0, 4)) : null;
    let conf = Math.max(0.5, 0.85 - out.length * 0.06);
    if (year && relYear === year) conf = Math.min(0.92, conf + 0.08);
    if (rawName.toLowerCase() === query.trim().toLowerCase()) conf = Math.min(0.94, conf + 0.06);

    out.push({
      externalId: String(id),
      provider: 'itunes',
      mediaKind,
      title: rawName,
      year: relYear && !Number.isNaN(relYear) ? relYear : null,
      overview: String(r.longDescription ?? r.shortDescription ?? ''),
      posterUrl: upgradeItunesArt(r.artworkUrl100 ? String(r.artworkUrl100) : undefined),
      confidence: conf,
      uniqueIds: { itunes: String(id) },
      dataOrigin: 'live-api',
    });
  }
  return out;
}

export async function fetchItunesDetailsLive(
  id: string,
  mediaKind: 'movie' | 'tvshow'
): Promise<ScrapedMetadataBundle | null> {
  const entityParam = mediaKind === 'tvshow' ? '&entity=tvEpisode' : '';
  const data = await fetchJsonWithTimeout<{ results?: Array<Record<string, unknown>> }>(
    `https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}${entityParam}`
  );
  const rows = data?.results;
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const primary = rows[0];
  const rawTitle =
    mediaKind === 'movie'
      ? String(primary.trackName ?? '')
      : String(primary.collectionName ?? primary.artistName ?? '').replace(/,\s*Season\s+\d+$/i, '').trim();
  if (!rawTitle) return null;

  const premiered = primary.releaseDate ? String(primary.releaseDate).slice(0, 10) : null;
  const year = premiered ? Number(premiered.slice(0, 4)) : null;
  const plot = String(primary.longDescription ?? primary.shortDescription ?? '');
  const posterUrl = upgradeItunesArt(primary.artworkUrl100 ? String(primary.artworkUrl100) : undefined);
  const runtimeMinutes = primary.trackTimeMillis ? Math.round(Number(primary.trackTimeMillis) / 60000) : null;

  let episodes: ScrapedMetadataBundle['episodes'] = undefined;
  if (mediaKind === 'tvshow' && rows.length > 1) {
    const epRows = rows.slice(1).filter((r) => r.wrapperType === 'track' || r.kind === 'tv-episode');
    if (epRows.length > 0) {
      episodes = epRows.map((ep, idx) => ({
        seasonNumber: Number(ep.discNumber ?? 1) || 1,
        episodeNumber: Number(ep.trackNumber ?? idx + 1) || idx + 1,
        title: String(ep.trackName ?? `Episode ${idx + 1}`),
        aired: ep.releaseDate ? String(ep.releaseDate).slice(0, 10) : null,
        plot: String(ep.longDescription ?? ep.shortDescription ?? ''),
        runtimeMinutes: ep.trackTimeMillis ? Math.round(Number(ep.trackTimeMillis) / 60000) : 45,
        directors: [],
        writers: [],
        ratings: [],
        uniqueIds: { itunes: String(ep.trackId ?? `${id}-${idx}`) },
        thumbUrl: upgradeItunesArt(ep.artworkUrl100 ? String(ep.artworkUrl100) : undefined),
      }));
    }
  }

  return {
    provider: 'itunes',
    sourcesUsed: ['itunes'],
    dataOrigin: 'live-api',
    title: rawTitle,
    originalTitle: rawTitle,
    sortTitle: rawTitle,
    year: year && !Number.isNaN(year) ? year : null,
    premiered,
    tagline: '',
    plot,
    outline: String(primary.shortDescription ?? plot).slice(0, 180),
    runtimeMinutes: runtimeMinutes && runtimeMinutes > 0 ? runtimeMinutes : null,
    mpaa: primary.contentAdvisoryRating ? `Rated ${primary.contentAdvisoryRating}` : '',
    country: primary.country ? String(primary.country) : '',
    studios: mediaKind === 'tvshow' && primary.artistName ? [String(primary.artistName)] : [],
    genres: primary.primaryGenreName ? [String(primary.primaryGenreName)] : [],
    tags: [],
    directors: mediaKind === 'movie' && primary.artistName ? [String(primary.artistName)] : [],
    writers: [],
    actors: [],
    trailerUrl: primary.previewUrl ? String(primary.previewUrl) : '',
    uniqueIds: { itunes: String(id) },
    ratings: [],
    artwork: posterUrl ? [{ kind: 'poster', url: posterUrl, provider: 'itunes' }] : [],
    episodes,
  };
}

export async function searchWikidataLive(
  query: string,
  mediaKind: 'movie' | 'tvshow',
  year: number | null
): Promise<ScraperSearchResult[]> {
  const hint = mediaKind === 'movie' ? 'film' : 'TV series';
  const searchTerm = [query, year ?? '', hint].filter(Boolean).join(' ');
  const data = await fetchJsonWithTimeout<{
    query?: { pages?: Record<string, Record<string, unknown>> };
  }>(
    `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
      searchTerm
    )}&gsrlimit=6&prop=pageprops|extracts|pageimages&exintro=1&explaintext=1&piprop=original|thumbnail&pithumbsize=800&format=json`
  );
  const pages = Object.values(data?.query?.pages ?? {});
  if (pages.length === 0) return [];

  const qLower = query.trim().toLowerCase();
  return pages
    .map((p, idx) => {
      const rawTitle = String(p.title ?? '');
      const cleanTitle = rawTitle.replace(/\s*\([^)]*(film|series|TV|season)[^)]*\)$/i, '').trim();
      const qid = (p.pageprops as { wikibase_item?: string } | undefined)?.wikibase_item;
      const extract = String(p.extract ?? '');
      const yearMatch = rawTitle.match(/\b(19\d{2}|20\d{2})\b/) || extract.match(/\b(19\d{2}|20\d{2})\b/);
      const parsedYear = yearMatch ? Number(yearMatch[1]) : null;
      const thumb =
        ((p.original as { source?: string } | undefined)?.source) ??
        ((p.thumbnail as { source?: string } | undefined)?.source);

      let conf = Math.max(0.45, 0.82 - idx * 0.07);
      if (cleanTitle.toLowerCase() === qLower) conf = Math.min(0.9, conf + 0.08);
      if (year && parsedYear === year) conf = Math.min(0.92, conf + 0.05);

      return {
        externalId: `${String(p.pageid)}:${qid ?? ''}`,
        provider: 'wikidata' as const,
        mediaKind,
        title: cleanTitle,
        year: parsedYear,
        overview: extract,
        posterUrl: thumb,
        confidence: conf,
        uniqueIds: qid ? { wikidata: qid } : {},
        dataOrigin: 'live-api' as const,
      };
    })
    .filter((r) => Boolean(r.title));
}

export async function fetchWikidataDetailsLive(
  externalId: string,
  mediaKind: 'movie' | 'tvshow'
): Promise<ScrapedMetadataBundle | null> {
  const [pageId, qid] = externalId.split(':');
  if (!pageId) return null;

  const wp = await fetchJsonWithTimeout<{
    query?: { pages?: Record<string, Record<string, unknown>> };
  }>(
    `https://en.wikipedia.org/w/api.php?action=query&pageids=${encodeURIComponent(
      pageId
    )}&prop=pageprops|extracts|pageimages&exintro=1&explaintext=1&piprop=original|thumbnail&pithumbsize=800&format=json`
  );
  const page = wp?.query?.pages?.[pageId];
  if (!page) return null;

  const resolvedQid = qid || ((page.pageprops as { wikibase_item?: string } | undefined)?.wikibase_item ?? '');
  const rawTitle = String(page.title ?? '');
  const title = rawTitle.replace(/\s*\([^)]*(film|series|TV|season)[^)]*\)$/i, '').trim();
  const plot = String(page.extract ?? '');
  const posterUrl =
    ((page.original as { source?: string } | undefined)?.source) ??
    ((page.thumbnail as { source?: string } | undefined)?.source);

  const uniqueIds: Record<string, string | undefined> = resolvedQid ? { wikidata: resolvedQid } : {};
  let premiered: string | null = null;
  let year: number | null = null;
  let runtimeMinutes: number | null = null;

  if (resolvedQid) {
    const wd = await fetchJsonWithTimeout<{
      entities?: Record<string, { claims?: Record<string, Array<{ mainsnak?: { datavalue?: { value?: unknown } } }>> }>;
    }>(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(
        resolvedQid
      )}&props=claims&format=json`
    );
    const claims = wd?.entities?.[resolvedQid]?.claims ?? {};
    const firstStr = (prop: string) => {
      const val = claims[prop]?.[0]?.mainsnak?.datavalue?.value;
      return typeof val === 'string' ? val : undefined;
    };
    const imdb = firstStr('P345');
    if (imdb) uniqueIds.imdb = imdb;
    const tmdb = firstStr(mediaKind === 'movie' ? 'P4947' : 'P4983');
    if (tmdb) uniqueIds.tmdb = tmdb;
    const tvdb = firstStr('P4835');
    if (tvdb) uniqueIds.tvdb = tvdb;

    const pubVal = claims.P577?.[0]?.mainsnak?.datavalue?.value as { time?: string } | undefined;
    if (pubVal?.time) {
      const m = pubVal.time.match(/([+-]?\d{4})-(\d{2})-(\d{2})/);
      if (m) {
        const y = Number(m[1]);
        year = y > 1800 ? y : null;
        if (m[2] !== '00' && m[3] !== '00' && year) premiered = `${year}-${m[2]}-${m[3]}`;
      }
    }

    const durVal = claims.P2047?.[0]?.mainsnak?.datavalue?.value as { amount?: string } | undefined;
    if (durVal?.amount) {
      const n = Math.round(Number(durVal.amount));
      if (!Number.isNaN(n) && n > 0 && n < 1000) runtimeMinutes = n;
    }
  }

  if (!year) {
    const ym = rawTitle.match(/\b(19\d{2}|20\d{2})\b/) || plot.match(/\b(19\d{2}|20\d{2})\b/);
    if (ym) year = Number(ym[1]);
  }

  return {
    provider: 'wikidata',
    sourcesUsed: ['wikidata'],
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
    mpaa: '',
    country: '',
    studios: [],
    genres: [],
    tags: [],
    directors: [],
    writers: [],
    actors: [],
    trailerUrl: '',
    uniqueIds,
    ratings: [],
    artwork: posterUrl ? [{ kind: 'poster', url: posterUrl, provider: 'wikidata' }] : [],
  };
}

export async function fetchTraktRatingsLive(
  imdbOrSlug: string,
  mediaKind: 'movie' | 'tvshow',
  cfg: ScraperProviderConfig
): Promise<{ rating: number; votes: number; traktId?: string } | null> {
  if (!cfg.apiKey || !imdbOrSlug) return null;
  const endpoint = mediaKind === 'movie' ? 'movies' : 'shows';
  const data = await fetchJsonWithTimeout<{ rating?: number; votes?: number; ids?: { trakt?: number } }>(
    `https://api.trakt.tv/${endpoint}/${encodeURIComponent(imdbOrSlug)}/ratings`,
    {
      headers: {
        'trakt-api-version': '2',
        'trakt-api-key': cfg.apiKey,
      },
    }
  );
  if (!data || !data.rating) return null;
  return {
    rating: Number(data.rating.toFixed(1)),
    votes: Number(data.votes ?? 0),
    traktId: data.ids?.trakt ? String(data.ids.trakt) : undefined,
  };
}
