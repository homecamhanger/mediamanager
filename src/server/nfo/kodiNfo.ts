import { XMLParser } from 'fast-xml-parser';
import type {
  ActorEntry,
  MovieRecord,
  NfoValidationReport,
  RatingEntry,
  StreamDetails,
  TvEpisodeRecord,
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
        seasonNumber: textOf(ep.season) ? Number(textOf(ep.season)) : undefined,
        episodeNumber: textOf(ep.episode) ? Number(textOf(ep.episode)) : undefined,
        displaySeason: textOf(ep.displayseason) ? Number(textOf(ep.displayseason)) : null,
        displayEpisode: textOf(ep.displayepisode) ? Number(textOf(ep.displayepisode)) : null,
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

export function serializeEpisodeNfo(ep: TvEpisodeRecord): string {
  const parts: string[] = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'];
  const endEp = ep.multiEpisodeEnd && ep.multiEpisodeEnd > ep.episodeNumber ? ep.multiEpisodeEnd : ep.episodeNumber;

  for (let num = ep.episodeNumber; num <= endEp; num++) {
    parts.push('<episodedetails>');
    parts.push(`  <title>${escapeXml(ep.title)}</title>`);
    if (ep.showTitle) parts.push(`  <showtitle>${escapeXml(ep.showTitle)}</showtitle>`);

    const ratingsXml = buildRatingsXml(ep.ratings);
    if (ratingsXml) parts.push(ratingsXml);

    if (ep.userRating != null) parts.push(`  <userrating>${escapeXml(ep.userRating)}</userrating>`);
    parts.push(`  <season>${ep.seasonNumber}</season>`);
    parts.push(`  <episode>${num}</episode>`);
    if (ep.displaySeason != null) parts.push(`  <displayseason>${ep.displaySeason}</displayseason>`);
    if (ep.displayEpisode != null) parts.push(`  <displayepisode>${ep.displayEpisode}</displayepisode>`);
    if (ep.plot) parts.push(`  <plot>${escapeXml(ep.plot)}</plot>`);
    if (ep.runtimeMinutes != null) parts.push(`  <runtime>${escapeXml(ep.runtimeMinutes)}</runtime>`);
    if (ep.aired) parts.push(`  <aired>${escapeXml(ep.aired)}</aired>`);
    parts.push(`  <playcount>${ep.playCount ?? (ep.watched ? 1 : 0)}</playcount>`);
    parts.push(`  <watched>${ep.watched ? 'true' : 'false'}</watched>`);
    if (ep.lastPlayed) parts.push(`  <lastplayed>${escapeXml(ep.lastPlayed)}</lastplayed>`);

    const idsXml = buildUniqueIdsXml(ep.uniqueIds);
    if (idsXml) parts.push(idsXml);

    for (const w of ep.writers) parts.push(`  <credits>${escapeXml(w)}</credits>`);
    for (const d of ep.directors) parts.push(`  <director>${escapeXml(d)}</director>`);

    const streamXml = buildStreamDetailsXml(ep.streamDetails);
    if (streamXml) parts.push(streamXml);

    const actorsXml = buildActorsXml(ep.actors);
    if (actorsXml) parts.push(actorsXml);

    parts.push('</episodedetails>');
  }
  return parts.join('\n') + '\n';
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
    const target = Array.isArray(rawTarget) ? (rawTarget[0] as Record<string, unknown>) : (rawTarget as Record<string, unknown>);

    if (!textOf(target.title)) {
      errors.push('Missing required <title> element');
    }

    const uids = asArray<Record<string, unknown> | string>(target.uniqueid as Record<string, unknown>[]);
    hasUniqueIdDefault = uids.some((u) => typeof u === 'object' && String(u['@_default'] ?? '').toLowerCase() === 'true');
    if (rootElement !== 'season') {
      if (uids.length === 0) {
        warnings.push('Missing <uniqueid> tag (legacy <id> is deprecated in Kodi v19+)');
      } else if (!hasUniqueIdDefault) {
        warnings.push('No <uniqueid default="true"> attribute specified');
      }
    }

    const ratingsBlock = target.ratings as Record<string, unknown> | undefined;
    hasRatingsBlock = Boolean(ratingsBlock && asArray(ratingsBlock.rating).length > 0);
    if (rootElement !== 'season' && !hasRatingsBlock) {
      if (target.rating) {
        warnings.push('Using legacy <rating> instead of Kodi v18+ <ratings><rating name="..." default="true"> block');
      } else {
        warnings.push('Missing <ratings> metadata block');
      }
    }

    if (rootElement === 'movie' || rootElement === 'episodedetails') {
      hasStreamDetails = Boolean((target.fileinfo as Record<string, unknown> | undefined)?.streamdetails);
      if (!hasStreamDetails) {
        warnings.push('Missing <fileinfo><streamdetails> media probe info');
      }
    }

    if (rootElement === 'movie' && !textOf(target.year) && !textOf(target.premiered)) {
      warnings.push('Missing <year> or <premiered> release date');
    }
    if (rootElement === 'movie' && !textOf(target.plot)) {
      warnings.push('Missing <plot> synopsis');
    }
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
