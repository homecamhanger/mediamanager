import { XMLParser } from 'fast-xml-parser';
import type {
  ActorEntry,
  MovieRecord,
  NfoValidationReport,
  RatingEntry,
  StreamDetails,
  TvEpisodeRecord,
  TvEpisodeSubEntry,
  TvSeasonRecord,
  TvShowRecord,
  UniqueIds,
} from '../../shared/types.js';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: false,
  trimValues: true,
  isArray: (name) =>
    [
      'rating',
      'uniqueid',
      'genre',
      'tag',
      'director',
      'credits',
      'studio',
      'country',
      'actor',
      'thumb',
      'video',
      'audio',
      'subtitle',
      'episodedetails',
      'namedseason',
    ].includes(name),
});

function asArray<T>(val: T | T[] | undefined | null): T[] {
  if (val === undefined || val === null) return [];
  return Array.isArray(val) ? val : [val];
}

function textOf(node: unknown): string {
  if (node === undefined || node === null) return '';
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') return String(node).trim();
  if (typeof node === 'object' && '#text' in (node as Record<string, unknown>)) {
    return String((node as Record<string, unknown>)['#text'] ?? '').trim();
  }
  return '';
}

function escapeXml(str: string | number | null | undefined): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function parseOptionalInt(val: string, allowNegative = false): number | null {
  if (!val) return null;
  const n = Number(val);
  if (!Number.isInteger(n)) return null;
  if (!allowNegative && n < 0) return null;
  return n;
}

function parseUniqueIds(node: Record<string, unknown>): UniqueIds {
  const ids: UniqueIds = {};
  for (const u of asArray<Record<string, unknown> | string>(node.uniqueid as Record<string, unknown>[])) {
    if (typeof u === 'string') {
      if (u.startsWith('tt')) ids.imdb = u;
    } else if (u && typeof u === 'object') {
      const type = String(u['@_type'] ?? 'imdb').toLowerCase();
      const val = textOf(u);
      if (val) ids[type] = val;
    }
  }
  // Legacy <id> / <imdbid> fallback
  const legacyId = textOf(node.id);
  if (legacyId && !ids.imdb && !ids.tmdb && !ids.tvdb) {
    if (legacyId.startsWith('tt')) ids.imdb = legacyId;
    else ids.tmdb = legacyId;
  }
  const legacyImdb = textOf(node.imdbid);
  if (legacyImdb && !ids.imdb) ids.imdb = legacyImdb;
  const legacyTmdb = textOf(node.tmdbid);
  if (legacyTmdb && !ids.tmdb) ids.tmdb = legacyTmdb;
  const legacyTvdb = textOf(node.tvdbid);
  if (legacyTvdb && !ids.tvdb) ids.tvdb = legacyTvdb;
  return ids;
}

function parseRatings(node: Record<string, unknown>): RatingEntry[] {
  const ratings: RatingEntry[] = [];
  const ratingsBlock = node.ratings as Record<string, unknown> | undefined;
  if (ratingsBlock && typeof ratingsBlock === 'object') {
    for (const r of asArray<Record<string, unknown>>(ratingsBlock.rating as Record<string, unknown>[])) {
      const source = String(r['@_name'] ?? 'imdb').toLowerCase();
      const max = Number(r['@_max'] ?? 10) || 10;
      const isDefault = String(r['@_default'] ?? 'false').toLowerCase() === 'true';
      const value = Number(textOf(r.value));
      const votes = textOf(r.votes) ? Number(textOf(r.votes)) : undefined;
      if (!Number.isNaN(value) && value > 0) {
        ratings.push({ source, value, max, votes: Number.isNaN(votes) ? undefined : votes, isDefault });
      }
    }
  }
  // Legacy <rating> fallback
  if (ratings.length === 0 && node.rating) {
    const legacyArr = asArray<unknown>(node.rating);
    for (const item of legacyArr) {
      const val = Number(textOf(item));
      const votes = textOf(node.votes) ? Number(textOf(node.votes)) : undefined;
      if (!Number.isNaN(val) && val > 0) {
        ratings.push({ source: 'imdb', value: val, max: 10, votes, isDefault: true });
      }
    }
  }
  return ratings;
}

function parseActors(node: Record<string, unknown>): ActorEntry[] {
  const out: ActorEntry[] = [];
  let idx = 0;
  for (const a of asArray<Record<string, unknown>>(node.actor as Record<string, unknown>[])) {
    const name = textOf(a.name);
    if (!name) continue;
    const role = textOf(a.role);
    const order = textOf(a.order) ? Number(textOf(a.order)) : idx;
    const thumb = textOf(a.thumb) || undefined;
    out.push({ name, role, order: Number.isNaN(order) ? idx : order, thumb });
    idx++;
  }
  return out;
}

function parseStreamDetails(node: Record<string, unknown>): StreamDetails | null {
  const fileinfo = node.fileinfo as Record<string, unknown> | undefined;
  if (!fileinfo || typeof fileinfo !== 'object') return null;
  const sd = fileinfo.streamdetails as Record<string, unknown> | undefined;
  if (!sd || typeof sd !== 'object') return null;

  const video = asArray<Record<string, unknown>>(sd.video as Record<string, unknown>[]).map((v) => ({
    codec: textOf(v.codec) || 'H.264',
    width: Number(textOf(v.width)) || 1920,
    height: Number(textOf(v.height)) || 1080,
    aspect: textOf(v.aspect) || '1.78',
    durationSeconds: Number(textOf(v.durationinseconds)) || 0,
    hdrType: textOf(v.hdrtype) || undefined,
  }));

  const audio = asArray<Record<string, unknown>>(sd.audio as Record<string, unknown>[]).map((a) => ({
    codec: textOf(a.codec) || 'AAC',
    language: textOf(a.language) || 'eng',
    channels: Number(textOf(a.channels)) || 2,
  }));

  const subtitle = asArray<Record<string, unknown>>(sd.subtitle as Record<string, unknown>[]).map((s) => ({
    language: textOf(s.language) || 'eng',
  }));

  if (video.length === 0 && audio.length === 0 && subtitle.length === 0) return null;
  return { video, audio, subtitle };
}

export interface ParsedMovieNfo {
  title?: string;
  originalTitle?: string;
  sortTitle?: string;
  year?: number | null;
  premiered?: string | null;
  tagline?: string;
  plot?: string;
  outline?: string;
  runtimeMinutes?: number | null;
  mpaa?: string;
  country?: string;
  studios?: string[];
  genres?: string[];
  tags?: string[];
  directors?: string[];
  writers?: string[];
  actors?: ActorEntry[];
  trailerUrl?: string;
  setName?: string | null;
  setOverview?: string | null;
  uniqueIds?: UniqueIds;
  ratings?: RatingEntry[];
  userRating?: number | null;
  playCount?: number;
  watched?: boolean;
  lastPlayed?: string | null;
  dateAdded?: string | null;
  streamDetails?: StreamDetails | null;
}

export function parseMovieNfoXml(xmlContent: string): ParsedMovieNfo | null {
  try {
    const parsed = parser.parse(xmlContent) as Record<string, unknown>;
    const movie = parsed.movie as Record<string, unknown> | undefined;
    if (!movie || typeof movie !== 'object') return null;

    const setNode = movie.set as Record<string, unknown> | string | undefined;
    let setName: string | null = null;
    let setOverview: string | null = null;
    if (typeof setNode === 'string') {
      setName = setNode.trim() || null;
    } else if (setNode && typeof setNode === 'object') {
      setName = textOf(setNode.name) || null;
      setOverview = textOf(setNode.overview) || null;
    }

    const premiered = textOf(movie.premiered) || textOf(movie.releasedate) || null;
    const yearRaw = textOf(movie.year) || (premiered ? premiered.slice(0, 4) : '');
    const year = yearRaw && /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : null;

    const playCount = Number(textOf(movie.playcount) || '0') || 0;
    const watchedFlag = textOf(movie.watched).toLowerCase() === 'true' || playCount > 0;
    const userRatingRaw = textOf(movie.userrating);
    const userRating = userRatingRaw ? Number(userRatingRaw) : null;
    const runtimeRaw = textOf(movie.runtime);
    const runtimeMinutes = runtimeRaw ? Number(runtimeRaw) : null;

    return {
      title: textOf(movie.title) || undefined,
      originalTitle: textOf(movie.originaltitle),
      sortTitle: textOf(movie.sorttitle),
      year,
      premiered,
      tagline: textOf(movie.tagline),
      plot: textOf(movie.plot),
      outline: textOf(movie.outline),
      runtimeMinutes: runtimeMinutes && !Number.isNaN(runtimeMinutes) ? runtimeMinutes : null,
      mpaa: textOf(movie.mpaa),
      country: asArray(movie.country).map(textOf).filter(Boolean).join(', '),
      studios: asArray(movie.studio).map(textOf).filter(Boolean),
      genres: asArray(movie.genre).map(textOf).filter(Boolean),
      tags: asArray(movie.tag).map(textOf).filter(Boolean),
      directors: asArray(movie.director).map(textOf).filter(Boolean),
      writers: asArray(movie.credits).map(textOf).filter(Boolean),
      actors: parseActors(movie),
      trailerUrl: textOf(movie.trailer),
      setName,
      setOverview,
      uniqueIds: parseUniqueIds(movie),
      ratings: parseRatings(movie),
      userRating: userRating && !Number.isNaN(userRating) ? userRating : null,
      playCount,
      watched: watchedFlag,
      lastPlayed: textOf(movie.lastplayed) || null,
      dateAdded: textOf(movie.dateadded) || null,
      streamDetails: parseStreamDetails(movie),
    };
  } catch {
    return null;
  }
}

export interface ParsedTvShowNfo {
  title?: string;
  originalTitle?: string;
  sortTitle?: string;
  year?: number | null;
  premiered?: string | null;
  status?: string;
  plot?: string;
  mpaa?: string;
  studio?: string;
  genres?: string[];
  tags?: string[];
  actors?: ActorEntry[];
  uniqueIds?: UniqueIds;
  ratings?: RatingEntry[];
  userRating?: number | null;
}

export function parseTvShowNfoXml(xmlContent: string): ParsedTvShowNfo | null {
  try {
    const parsed = parser.parse(xmlContent) as Record<string, unknown>;
    const show = parsed.tvshow as Record<string, unknown> | undefined;
    if (!show || typeof show !== 'object') return null;

    const premiered = textOf(show.premiered) || null;
    const yearRaw = textOf(show.year) || (premiered ? premiered.slice(0, 4) : '');
    const year = yearRaw && /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : null;
    const userRatingRaw = textOf(show.userrating);
    const userRating = userRatingRaw ? Number(userRatingRaw) : null;

    return {
      title: textOf(show.title) || undefined,
      originalTitle: textOf(show.originaltitle),
      sortTitle: textOf(show.sorttitle),
      year,
      premiered,
      status: textOf(show.status) || undefined,
      plot: textOf(show.plot),
      mpaa: textOf(show.mpaa),
      studio: asArray(show.studio).map(textOf).filter(Boolean).join(', '),
      genres: asArray(show.genre).map(textOf).filter(Boolean),
      tags: asArray(show.tag).map(textOf).filter(Boolean),
      actors: parseActors(show),
      uniqueIds: parseUniqueIds(show),
      ratings: parseRatings(show),
      userRating: userRating && !Number.isNaN(userRating) ? userRating : null,
    };
  } catch {
    return null;
  }
}

export interface ParsedEpisodeNfo {
  title?: string;
  showTitle?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  displaySeason?: number | null;
  displayEpisode?: number | null;
  aired?: string | null;
  plot?: string;
  runtimeMinutes?: number | null;
  directors?: string[];
  writers?: string[];
  actors?: ActorEntry[];
  uniqueIds?: UniqueIds;
  ratings?: RatingEntry[];
  userRating?: number | null;
  playCount?: number;
  watched?: boolean;
  lastPlayed?: string | null;
  streamDetails?: StreamDetails | null;
}

export function parseEpisodeNfoXml(xmlContent: string): ParsedEpisodeNfo[] {
  try {
    // Support Kodi multi-episode NFOs where multiple <episodedetails> siblings exist without a wrapper root
    const normalized = xmlContent.replace(/<\?xml[^?]*\?>/gi, '').trim();
    const wrapped = `<_root>${normalized}</_root>`;
    const parsed = parser.parse(wrapped) as { _root?: { episodedetails?: Array<Record<string, unknown>> } };
    const blocks = asArray(parsed._root?.episodedetails);
    const out: ParsedEpisodeNfo[] = [];

    for (const ep of blocks) {
      if (!ep || typeof ep !== 'object') continue;
      const playCount = Number(textOf(ep.playcount) || '0') || 0;
      const watchedFlag = textOf(ep.watched).toLowerCase() === 'true' || playCount > 0;
      const runtimeRaw = textOf(ep.runtime);
      const userRatingRaw = textOf(ep.userrating);
      out.push({
        title: textOf(ep.title) || undefined,
        showTitle: textOf(ep.showtitle) || undefined,
        seasonNumber: parseOptionalInt(textOf(ep.season)) ?? undefined,
        episodeNumber: parseOptionalInt(textOf(ep.episode)) ?? undefined,
        displaySeason: parseOptionalInt(textOf(ep.displayseason)),
        displayEpisode: parseOptionalInt(textOf(ep.displayepisode)),
        aired: textOf(ep.aired) || null,
        plot: textOf(ep.plot),
        runtimeMinutes: runtimeRaw && !Number.isNaN(Number(runtimeRaw)) ? Number(runtimeRaw) : null,
        directors: asArray(ep.director).map(textOf).filter(Boolean),
        writers: asArray(ep.credits).map(textOf).filter(Boolean),
        actors: parseActors(ep),
        uniqueIds: parseUniqueIds(ep),
        ratings: parseRatings(ep),
        userRating: userRatingRaw && !Number.isNaN(Number(userRatingRaw)) ? Number(userRatingRaw) : null,
        playCount,
        watched: watchedFlag,
        lastPlayed: textOf(ep.lastplayed) || null,
        streamDetails: parseStreamDetails(ep),
      });
    }
    return out;
  } catch {
    return [];
  }
}

export function buildRatingsXml(ratings: RatingEntry[], indent = '  '): string {
  if (!ratings || ratings.length === 0) return '';
  const hasDefault = ratings.some((r) => r.isDefault);
  const lines: string[] = [`${indent}<ratings>`];
  ratings.forEach((r, idx) => {
    const isDef = r.isDefault || (!hasDefault && idx === 0);
    lines.push(`${indent}  <rating name="${escapeXml(r.source)}" max="${escapeXml(r.max)}" default="${isDef ? 'true' : 'false'}">`);
    lines.push(`${indent}    <value>${escapeXml(r.value)}</value>`);
    if (r.votes !== undefined) {
      lines.push(`${indent}    <votes>${escapeXml(r.votes)}</votes>`);
    }
    lines.push(`${indent}  </rating>`);
  });
  lines.push(`${indent}</ratings>`);
  return lines.join('\n');
}

export function buildUniqueIdsXml(uniqueIds: UniqueIds, indent = '  '): string {
  const entries = Object.entries(uniqueIds).filter(([, val]) => Boolean(val));
  if (entries.length === 0) return '';
  // Default priority: imdb -> tmdb -> tvdb -> first
  const defaultKey = uniqueIds.imdb
    ? 'imdb'
    : uniqueIds.tmdb
      ? 'tmdb'
      : uniqueIds.tvdb
        ? 'tvdb'
        : entries[0][0];

  return entries
    .map(
      ([type, val]) =>
        `${indent}<uniqueid type="${escapeXml(type)}" default="${type === defaultKey ? 'true' : 'false'}">${escapeXml(val)}</uniqueid>`
    )
    .join('\n');
}

export function buildActorsXml(actors: ActorEntry[], indent = '  '): string {
  return actors
    .map((a, idx) => {
      const lines = [`${indent}<actor>`];
      lines.push(`${indent}  <name>${escapeXml(a.name)}</name>`);
      if (a.role) lines.push(`${indent}  <role>${escapeXml(a.role)}</role>`);
      lines.push(`${indent}  <order>${a.order ?? idx}</order>`);
      if (a.thumb) lines.push(`${indent}  <thumb>${escapeXml(a.thumb)}</thumb>`);
      lines.push(`${indent}</actor>`);
      return lines.join('\n');
    })
    .join('\n');
}

export function buildStreamDetailsXml(sd: StreamDetails, indent = '  '): string {
  if (!sd || (sd.video.length === 0 && sd.audio.length === 0 && sd.subtitle.length === 0)) return '';
  const lines = [`${indent}<fileinfo>`, `${indent}  <streamdetails>`];
  for (const v of sd.video) {
    lines.push(`${indent}    <video>`);
    lines.push(`${indent}      <codec>${escapeXml(v.codec)}</codec>`);
    lines.push(`${indent}      <aspect>${escapeXml(v.aspect)}</aspect>`);
    lines.push(`${indent}      <width>${escapeXml(v.width)}</width>`);
    lines.push(`${indent}      <height>${escapeXml(v.height)}</height>`);
    lines.push(`${indent}      <durationinseconds>${escapeXml(v.durationSeconds)}</durationinseconds>`);
    if (v.hdrType) lines.push(`${indent}      <hdrtype>${escapeXml(v.hdrType)}</hdrtype>`);
    lines.push(`${indent}    </video>`);
  }
  for (const a of sd.audio) {
    lines.push(`${indent}    <audio>`);
    lines.push(`${indent}      <codec>${escapeXml(a.codec)}</codec>`);
    lines.push(`${indent}      <language>${escapeXml(a.language)}</language>`);
    lines.push(`${indent}      <channels>${escapeXml(a.channels)}</channels>`);
    lines.push(`${indent}    </audio>`);
  }
  for (const s of sd.subtitle) {
    lines.push(`${indent}    <subtitle>`);
    lines.push(`${indent}      <language>${escapeXml(s.language)}</language>`);
    lines.push(`${indent}    </subtitle>`);
  }
  lines.push(`${indent}  </streamdetails>`, `${indent}</fileinfo>`);
  return lines.join('\n');
}

export function serializeMovieNfo(movie: MovieRecord): string {
  const parts: string[] = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>', '<movie>'];
  parts.push(`  <title>${escapeXml(movie.title)}</title>`);
  if (movie.originalTitle) parts.push(`  <originaltitle>${escapeXml(movie.originalTitle)}</originaltitle>`);
  if (movie.sortTitle) parts.push(`  <sorttitle>${escapeXml(movie.sortTitle)}</sorttitle>`);

  const ratingsXml = buildRatingsXml(movie.ratings);
  if (ratingsXml) parts.push(ratingsXml);

  if (movie.userRating != null) parts.push(`  <userrating>${escapeXml(movie.userRating)}</userrating>`);
  if (movie.outline) parts.push(`  <outline>${escapeXml(movie.outline)}</outline>`);
  if (movie.plot) parts.push(`  <plot>${escapeXml(movie.plot)}</plot>`);
  if (movie.tagline) parts.push(`  <tagline>${escapeXml(movie.tagline)}</tagline>`);
  if (movie.runtimeMinutes != null) parts.push(`  <runtime>${escapeXml(movie.runtimeMinutes)}</runtime>`);

  if (movie.artwork.poster) parts.push(`  <thumb aspect="poster">${escapeXml(movie.artwork.poster)}</thumb>`);
  if (movie.artwork.clearlogo) parts.push(`  <thumb aspect="clearlogo">${escapeXml(movie.artwork.clearlogo)}</thumb>`);
  if (movie.artwork.banner) parts.push(`  <thumb aspect="banner">${escapeXml(movie.artwork.banner)}</thumb>`);
  if (movie.artwork.landscape) parts.push(`  <thumb aspect="landscape">${escapeXml(movie.artwork.landscape)}</thumb>`);
  if (movie.artwork.fanart) {
    parts.push(`  <fanart>\n    <thumb>${escapeXml(movie.artwork.fanart)}</thumb>\n  </fanart>`);
  }

  if (movie.mpaa) parts.push(`  <mpaa>${escapeXml(movie.mpaa)}</mpaa>`);
  parts.push(`  <playcount>${movie.playCount ?? (movie.watched ? 1 : 0)}</playcount>`);
  parts.push(`  <watched>${movie.watched ? 'true' : 'false'}</watched>`);
  if (movie.lastPlayed) parts.push(`  <lastplayed>${escapeXml(movie.lastPlayed)}</lastplayed>`);

  const idsXml = buildUniqueIdsXml(movie.uniqueIds);
  if (idsXml) parts.push(idsXml);

  for (const g of movie.genres) parts.push(`  <genre>${escapeXml(g)}</genre>`);
  if (movie.country) parts.push(`  <country>${escapeXml(movie.country)}</country>`);
  if (movie.setName) {
    parts.push('  <set>');
    parts.push(`    <name>${escapeXml(movie.setName)}</name>`);
    if (movie.setOverview) parts.push(`    <overview>${escapeXml(movie.setOverview)}</overview>`);
    parts.push('  </set>');
  }
  for (const t of movie.tags) parts.push(`  <tag>${escapeXml(t)}</tag>`);
  for (const w of movie.writers) parts.push(`  <credits>${escapeXml(w)}</credits>`);
  for (const d of movie.directors) parts.push(`  <director>${escapeXml(d)}</director>`);
  if (movie.premiered) parts.push(`  <premiered>${escapeXml(movie.premiered)}</premiered>`);
  if (movie.year != null) parts.push(`  <year>${escapeXml(movie.year)}</year>`);
  for (const s of movie.studios) parts.push(`  <studio>${escapeXml(s)}</studio>`);
  if (movie.trailerUrl) parts.push(`  <trailer>${escapeXml(movie.trailerUrl)}</trailer>`);

  const streamXml = buildStreamDetailsXml(movie.streamDetails);
  if (streamXml) parts.push(streamXml);

  const actorsXml = buildActorsXml(movie.actors);
  if (actorsXml) parts.push(actorsXml);

  if (movie.dateAdded) parts.push(`  <dateadded>${escapeXml(movie.dateAdded.slice(0, 19).replace('T', ' '))}</dateadded>`);
  parts.push('</movie>');
  return parts.join('\n') + '\n';
}

export function serializeTvShowNfo(show: TvShowRecord, seasons: TvSeasonRecord[] = []): string {
  const parts: string[] = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>', '<tvshow>'];
  parts.push(`  <title>${escapeXml(show.title)}</title>`);
  if (show.originalTitle) parts.push(`  <originaltitle>${escapeXml(show.originalTitle)}</originaltitle>`);
  if (show.sortTitle) parts.push(`  <sorttitle>${escapeXml(show.sortTitle)}</sorttitle>`);

  const ratingsXml = buildRatingsXml(show.ratings);
  if (ratingsXml) parts.push(ratingsXml);

  if (show.userRating != null) parts.push(`  <userrating>${escapeXml(show.userRating)}</userrating>`);
  if (show.plot) parts.push(`  <plot>${escapeXml(show.plot)}</plot>`);
  if (show.mpaa) parts.push(`  <mpaa>${escapeXml(show.mpaa)}</mpaa>`);
  if (show.premiered) parts.push(`  <premiered>${escapeXml(show.premiered)}</premiered>`);
  if (show.year != null) parts.push(`  <year>${escapeXml(show.year)}</year>`);
  if (show.status) parts.push(`  <status>${escapeXml(show.status)}</status>`);
  if (show.studio) parts.push(`  <studio>${escapeXml(show.studio)}</studio>`);

  const idsXml = buildUniqueIdsXml(show.uniqueIds);
  if (idsXml) parts.push(idsXml);

  for (const g of show.genres) parts.push(`  <genre>${escapeXml(g)}</genre>`);
  for (const t of show.tags) parts.push(`  <tag>${escapeXml(t)}</tag>`);
  for (const s of seasons) {
    parts.push(`  <namedseason number="${s.seasonNumber}">${escapeXml(s.name)}</namedseason>`);
  }

  const actorsXml = buildActorsXml(show.actors);
  if (actorsXml) parts.push(actorsXml);

  parts.push('</tvshow>');
  return parts.join('\n') + '\n';
}

export function serializeSeasonNfo(season: TvSeasonRecord): string {
  const parts: string[] = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>', '<season>'];
  parts.push(`  <seasonnumber>${season.seasonNumber}</seasonnumber>`);
  parts.push(`  <title>${escapeXml(season.name)}</title>`);
  if (season.overview) parts.push(`  <plot>${escapeXml(season.overview)}</plot>`);
  parts.push('</season>');
  return parts.join('\n') + '\n';
}

function serializeEpisodeBlock(entry: {
  title: string;
  showTitle: string;
  ratings: RatingEntry[];
  userRating: number | null;
  seasonNumber: number;
  episodeNumber: number;
  displaySeason?: number | null;
  displayEpisode?: number | null;
  plot: string;
  runtimeMinutes: number | null;
  aired: string | null;
  playCount: number;
  watched: boolean;
  lastPlayed: string | null;
  uniqueIds: UniqueIds;
  writers: string[];
  directors: string[];
  streamDetails: StreamDetails;
  actors: ActorEntry[];
}): string {
  const parts: string[] = ['<episodedetails>'];
  parts.push(`  <title>${escapeXml(entry.title)}</title>`);
  if (entry.showTitle) parts.push(`  <showtitle>${escapeXml(entry.showTitle)}</showtitle>`);

  const ratingsXml = buildRatingsXml(entry.ratings);
  if (ratingsXml) parts.push(ratingsXml);

  if (entry.userRating != null) parts.push(`  <userrating>${escapeXml(entry.userRating)}</userrating>`);
  parts.push(`  <season>${entry.seasonNumber}</season>`);
  parts.push(`  <episode>${entry.episodeNumber}</episode>`);
  if (entry.displaySeason != null) parts.push(`  <displayseason>${entry.displaySeason}</displayseason>`);
  if (entry.displayEpisode != null) parts.push(`  <displayepisode>${entry.displayEpisode}</displayepisode>`);
  if (entry.plot) parts.push(`  <plot>${escapeXml(entry.plot)}</plot>`);
  if (entry.runtimeMinutes != null) parts.push(`  <runtime>${escapeXml(entry.runtimeMinutes)}</runtime>`);
  if (entry.aired) parts.push(`  <aired>${escapeXml(entry.aired)}</aired>`);
  parts.push(`  <playcount>${entry.playCount ?? (entry.watched ? 1 : 0)}</playcount>`);
  parts.push(`  <watched>${entry.watched ? 'true' : 'false'}</watched>`);
  if (entry.lastPlayed) parts.push(`  <lastplayed>${escapeXml(entry.lastPlayed)}</lastplayed>`);

  const idsXml = buildUniqueIdsXml(entry.uniqueIds);
  if (idsXml) parts.push(idsXml);

  for (const w of entry.writers) parts.push(`  <credits>${escapeXml(w)}</credits>`);
  for (const d of entry.directors) parts.push(`  <director>${escapeXml(d)}</director>`);

  const streamXml = buildStreamDetailsXml(entry.streamDetails);
  if (streamXml) parts.push(streamXml);

  const actorsXml = buildActorsXml(entry.actors);
  if (actorsXml) parts.push(actorsXml);

  parts.push('</episodedetails>');
  return parts.join('\n');
}

export function serializeEpisodeNfo(ep: TvEpisodeRecord): string {
  const blocks: string[] = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'];
  const serializedKeys = new Set<string>();
  const subParts: TvEpisodeSubEntry[] = ep.multiEpisodeParts ?? [];

  blocks.push(
    serializeEpisodeBlock({
      title: ep.title,
      showTitle: ep.showTitle,
      ratings: ep.ratings,
      userRating: ep.userRating,
      seasonNumber: ep.seasonNumber,
      episodeNumber: ep.episodeNumber,
      displaySeason: ep.displaySeason,
      displayEpisode: ep.displayEpisode,
      plot: ep.plot,
      runtimeMinutes: ep.runtimeMinutes,
      aired: ep.aired,
      playCount: ep.playCount,
      watched: ep.watched,
      lastPlayed: ep.lastPlayed,
      uniqueIds: ep.uniqueIds,
      writers: ep.writers,
      directors: ep.directors,
      streamDetails: ep.streamDetails,
      actors: ep.actors,
    })
  );
  serializedKeys.add(`${ep.seasonNumber}:${ep.episodeNumber}`);

  const endEp = ep.multiEpisodeEnd && ep.multiEpisodeEnd > ep.episodeNumber ? ep.multiEpisodeEnd : ep.episodeNumber;
  for (let num = ep.episodeNumber + 1; num <= endEp; num++) {
    const key = `${ep.seasonNumber}:${num}`;
    if (serializedKeys.has(key)) continue;
    const partIdx = num - ep.episodeNumber - 1;
    const explicit =
      subParts.find((p) => p.seasonNumber === ep.seasonNumber && p.episodeNumber === num) ??
      (subParts[partIdx] && subParts[partIdx].episodeNumber === num ? subParts[partIdx] : undefined);

    if (explicit) {
      blocks.push(
        serializeEpisodeBlock({
          title: explicit.title || `Episode ${num}`,
          showTitle: ep.showTitle,
          ratings: explicit.ratings,
          userRating: explicit.userRating,
          seasonNumber: explicit.seasonNumber,
          episodeNumber: explicit.episodeNumber,
          displaySeason: explicit.displaySeason,
          displayEpisode: explicit.displayEpisode,
          plot: explicit.plot,
          runtimeMinutes: explicit.runtimeMinutes,
          aired: explicit.aired,
          playCount: explicit.playCount,
          watched: explicit.watched,
          lastPlayed: explicit.lastPlayed,
          uniqueIds: explicit.uniqueIds,
          writers: explicit.writers,
          directors: explicit.directors,
          streamDetails: ep.streamDetails,
          actors: explicit.actors,
        })
      );
    } else {
      const partNumber = num - ep.episodeNumber + 1;
      const fallbackTitle =
        ep.title && !/^Episode\s+\d+$/i.test(ep.title) ? `${ep.title} (Part ${partNumber})` : `Episode ${num}`;
      blocks.push(
        serializeEpisodeBlock({
          title: fallbackTitle,
          showTitle: ep.showTitle,
          ratings: [],
          userRating: null,
          seasonNumber: ep.seasonNumber,
          episodeNumber: num,
          displaySeason: null,
          displayEpisode: null,
          plot: '',
          runtimeMinutes: ep.runtimeMinutes,
          aired: ep.aired,
          playCount: ep.playCount,
          watched: ep.watched,
          lastPlayed: ep.lastPlayed,
          uniqueIds: {},
          writers: ep.writers,
          directors: ep.directors,
          streamDetails: ep.streamDetails,
          actors: ep.actors,
        })
      );
    }
    serializedKeys.add(key);
  }

  // Preserve any additional custom multi-episode parts outside the contiguous range
  for (const part of subParts) {
    const key = `${part.seasonNumber}:${part.episodeNumber}`;
    if (serializedKeys.has(key)) continue;
    blocks.push(
      serializeEpisodeBlock({
        title: part.title || `Episode ${part.episodeNumber}`,
        showTitle: ep.showTitle,
        ratings: part.ratings,
        userRating: part.userRating,
        seasonNumber: part.seasonNumber,
        episodeNumber: part.episodeNumber,
        displaySeason: part.displaySeason,
        displayEpisode: part.displayEpisode,
        plot: part.plot,
        runtimeMinutes: part.runtimeMinutes,
        aired: part.aired,
        playCount: part.playCount,
        watched: part.watched,
        lastPlayed: part.lastPlayed,
        uniqueIds: part.uniqueIds,
        writers: part.writers,
        directors: part.directors,
        streamDetails: ep.streamDetails,
        actors: part.actors,
      })
    );
    serializedKeys.add(key);
  }

  return blocks.join('\n') + '\n';
}

export function validateKodiNfoXml(xmlContent: string): NfoValidationReport {
  const warnings: string[] = [];
  const errors: string[] = [];
  let rootElement: string | null = null;
  let hasUniqueIdDefault = false;
  let hasRatingsBlock = false;
  let hasStreamDetails = false;

  if (!xmlContent || !xmlContent.trim()) {
    return {
      valid: false,
      kodiVersionTarget: 'Kodi v21 Omega',
      warnings: [],
      errors: ['NFO file is empty'],
      rootElement: null,
      hasUniqueIdDefault: false,
      hasRatingsBlock: false,
      hasStreamDetails: false,
    };
  }

  try {
    const normalized = xmlContent.replace(/<\?xml[^?]*\?>/gi, '').trim();
    const wrapped = `<_kodi_check>${normalized}</_kodi_check>`;
    const parsed = parser.parse(wrapped) as { _kodi_check?: Record<string, unknown> };
    const root = parsed._kodi_check ?? {};
    const keys = Object.keys(root).filter((k) => !k.startsWith('@_') && k !== '#text');
    rootElement = keys[0] ?? null;

    if (!rootElement || !['movie', 'tvshow', 'episodedetails', 'season'].includes(rootElement)) {
      errors.push(`Unsupported or missing Kodi root element (found: ${rootElement ?? 'none'})`);
      return {
        valid: false,
        kodiVersionTarget: 'Kodi v21 Omega',
        warnings,
        errors,
        rootElement,
        hasUniqueIdDefault,
        hasRatingsBlock,
        hasStreamDetails,
      };
    }

    const rawTarget = root[rootElement];
    const blocks =
      rootElement === 'episodedetails'
        ? asArray<Record<string, unknown>>(rawTarget as Record<string, unknown>[])
        : [Array.isArray(rawTarget) ? (rawTarget[0] as Record<string, unknown>) : (rawTarget as Record<string, unknown>)];

    const multiBlock = blocks.length > 1;
    const seenEpKeys = new Set<string>();
    let allUniqueIdDefaults = blocks.length > 0;
    let allRatingsBlocks = blocks.length > 0;
    let allStreamDetails = blocks.length > 0;

    blocks.forEach((target, idx) => {
      const sText = textOf(target.season);
      const eText = textOf(target.episode);
      const prefix = multiBlock
        ? `Part ${idx + 1}${sText && eText ? ` (S${sText.padStart(2, '0')}E${eText.padStart(2, '0')})` : ''}: `
        : '';

      if (!textOf(target.title)) {
        errors.push(`${prefix}Missing required <title> element`);
      }

      if (multiBlock) {
        if (!eText) {
          warnings.push(`${prefix}Missing <episode> element in multi-episode NFO`);
        } else {
          const epKey = `${sText || '1'}:${eText}`;
          if (seenEpKeys.has(epKey)) {
            warnings.push(`${prefix}Duplicate season/episode number (${epKey}) inside multi-episode NFO`);
          }
          seenEpKeys.add(epKey);
        }
      }

      const uids = asArray<Record<string, unknown> | string>(target.uniqueid as Record<string, unknown>[]);
      const blockHasUidDefault = uids.some((u) => typeof u === 'object' && String(u['@_default'] ?? '').toLowerCase() === 'true');
      if (!blockHasUidDefault) allUniqueIdDefaults = false;
      if (rootElement !== 'season') {
        if (uids.length === 0) {
          warnings.push(`${prefix}Missing <uniqueid> tag (legacy <id> is deprecated in Kodi v19+)`);
        } else if (!blockHasUidDefault) {
          warnings.push(`${prefix}No <uniqueid default="true"> attribute specified`);
        }
      }

      const ratingsBlock = target.ratings as Record<string, unknown> | undefined;
      const blockHasRatings = Boolean(ratingsBlock && asArray(ratingsBlock.rating).length > 0);
      if (!blockHasRatings) allRatingsBlocks = false;
      if (rootElement !== 'season' && !blockHasRatings) {
        if (target.rating) {
          warnings.push(`${prefix}Using legacy <rating> instead of Kodi v18+ <ratings><rating name="..." default="true"> block`);
        } else {
          warnings.push(`${prefix}Missing <ratings> metadata block`);
        }
      }

      if (rootElement === 'movie' || rootElement === 'episodedetails') {
        const blockHasStreams = Boolean((target.fileinfo as Record<string, unknown> | undefined)?.streamdetails);
        if (!blockHasStreams) {
          allStreamDetails = false;
          warnings.push(`${prefix}Missing <fileinfo><streamdetails> media probe info`);
        }
      } else {
        allStreamDetails = false;
      }

      if (rootElement === 'movie' && !textOf(target.year) && !textOf(target.premiered)) {
        warnings.push('Missing <year> or <premiered> release date');
      }
      if (rootElement === 'movie' && !textOf(target.plot)) {
        warnings.push('Missing <plot> synopsis');
      }
    });

    hasUniqueIdDefault = allUniqueIdDefaults;
    hasRatingsBlock = allRatingsBlocks;
    hasStreamDetails = allStreamDetails;
  } catch (err) {
    errors.push(`XML syntax error: ${(err as Error).message}`);
  }

  return {
    valid: errors.length === 0,
    kodiVersionTarget: 'Kodi v21 Omega',
    warnings,
    errors,
    rootElement,
    hasUniqueIdDefault,
    hasRatingsBlock,
    hasStreamDetails,
  };
}
