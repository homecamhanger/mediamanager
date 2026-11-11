import type {
  MovieRecord,
  SmartPlaylistDefinition,
  SmartPlaylistField,
  SmartPlaylistFieldDef,
  SmartPlaylistOperator,
  SmartPlaylistPreview,
  SmartPlaylistPreviewItem,
  SmartPlaylistPresetId,
  SmartPlaylistRule,
  SmartPlaylistRuleDiagnostic,
  SmartPlaylistType,
  TvEpisodeRecord,
  TvShowRecord,
} from '../../shared/types.js';

const MOVIE_ONLY: SmartPlaylistType[] = ['movies'];
const EPISODE_ONLY: SmartPlaylistType[] = ['episodes'];
const SHOW_ONLY: SmartPlaylistType[] = ['tvshows'];
const MOVIE_EPISODE: SmartPlaylistType[] = ['movies', 'episodes'];

const TEXT_OPS: SmartPlaylistOperator[] = ['contains', 'doesnotcontain', 'is', 'isnot', 'startswith', 'endswith'];
const NUM_OPS: SmartPlaylistOperator[] = ['greaterthan', 'lessthan', 'is', 'isnot'];
const LIST_OPS: SmartPlaylistOperator[] = ['contains', 'doesnotcontain', 'is', 'isnot'];

const RESOLUTION_CHOICES = [
  { value: '2160', label: '4K UHD (2160p+)' },
  { value: '1080', label: '1080p or better' },
  { value: '720', label: '720p or better' },
  { value: '576', label: '576p or better' },
];

const CODEC_CHOICES = ['hevc', 'h264', 'av1', 'vc-1', 'mpeg2'].map((v) => ({ value: v, label: v.toUpperCase() }));
const HDR_CHOICES = ['dolbyvision', 'hdr10', 'hdr10+', 'hlg'].map((v) => ({ value: v, label: v.toUpperCase() }));
const AUDIO_CHOICES = ['eac3', 'ac3', 'dtshd_ma', 'truehd', 'aac', 'dts', 'flac'].map((v) => ({
  value: v,
  label: v.toUpperCase(),
}));

export const SMART_PLAYLIST_FIELDS: SmartPlaylistFieldDef[] = [
  {
    field: 'title',
    label: 'Title',
    kind: 'text',
    operators: TEXT_OPS,
    supports: ['movies', 'episodes', 'tvshows'],
  },
  { field: 'genre', label: 'Genre', kind: 'list', operators: LIST_OPS, supports: ['movies', 'episodes', 'tvshows'] },
  { field: 'tag', label: 'Tag', kind: 'list', operators: LIST_OPS, supports: ['movies', 'episodes', 'tvshows'] },
  { field: 'studio', label: 'Studio / Network', kind: 'list', operators: LIST_OPS, supports: ['movies', 'episodes', 'tvshows'] },
  { field: 'year', label: 'Year', kind: 'number', operators: NUM_OPS, supports: ['movies', 'episodes', 'tvshows'] },
  {
    field: 'rating',
    label: 'Rating',
    kind: 'number',
    operators: NUM_OPS,
    supports: ['movies', 'episodes', 'tvshows'],
    hint: '0–10, uses the default source rating',
  },
  {
    field: 'userrating',
    label: 'Your Rating',
    kind: 'number',
    operators: NUM_OPS,
    supports: ['movies', 'episodes', 'tvshows'],
    hint: '0–10',
  },
  {
    field: 'playcount',
    label: 'Play Count',
    kind: 'number',
    operators: NUM_OPS,
    supports: ['movies', 'episodes'],
    hint: '0 = never watched',
  },
  {
    field: 'videoresolution',
    label: 'Vertical Resolution',
    kind: 'enum',
    operators: NUM_OPS,
    supports: MOVIE_EPISODE,
    unit: 'px',
    choices: RESOLUTION_CHOICES,
  },
  {
    field: 'videocodec',
    label: 'Video Codec',
    kind: 'enum',
    operators: LIST_OPS,
    supports: MOVIE_EPISODE,
    choices: CODEC_CHOICES,
  },
  { field: 'hdr', label: 'HDR Type', kind: 'enum', operators: LIST_OPS, supports: MOVIE_EPISODE, choices: HDR_CHOICES },
  {
    field: 'audiocodec',
    label: 'Audio Codec',
    kind: 'enum',
    operators: LIST_OPS,
    supports: MOVIE_EPISODE,
    choices: AUDIO_CHOICES,
  },
  {
    field: 'audiochannels',
    label: 'Audio Channels',
    kind: 'number',
    operators: NUM_OPS,
    supports: MOVIE_EPISODE,
    hint: '6 = 5.1, 8 = 7.1',
  },
  {
    field: 'subtitlelanguage',
    label: 'Subtitle Language',
    kind: 'list',
    operators: LIST_OPS,
    supports: MOVIE_EPISODE,
    hint: 'e.g. eng, fre',
  },
  {
    field: 'runtime',
    label: 'Runtime',
    kind: 'number',
    operators: NUM_OPS,
    supports: MOVIE_EPISODE,
    unit: 'min',
  },
  {
    field: 'dateadded',
    label: 'Date Added',
    kind: 'date-days',
    operators: ['inthelast', 'notinthelast'],
    supports: ['movies', 'episodes', 'tvshows'],
    unit: 'days',
  },
  { field: 'set', label: 'Movie Set / Collection', kind: 'text', operators: TEXT_OPS, supports: MOVIE_ONLY },
  { field: 'director', label: 'Director', kind: 'list', operators: LIST_OPS, supports: MOVIE_EPISODE },
  { field: 'writer', label: 'Writer', kind: 'list', operators: LIST_OPS, supports: MOVIE_EPISODE },
  { field: 'actor', label: 'Actor', kind: 'list', operators: LIST_OPS, supports: ['movies', 'episodes', 'tvshows'] },
  { field: 'mpaa', label: 'MPAA Rating', kind: 'text', operators: TEXT_OPS, supports: ['movies', 'tvshows'] },
  { field: 'country', label: 'Country', kind: 'text', operators: TEXT_OPS, supports: MOVIE_ONLY },
  {
    field: 'season',
    label: 'Season',
    kind: 'number',
    operators: NUM_OPS,
    supports: EPISODE_ONLY,
  },
  {
    field: 'episode',
    label: 'Episode',
    kind: 'number',
    operators: NUM_OPS,
    supports: EPISODE_ONLY,
  },
  { field: 'tvshowtitle', label: 'TV Show Title', kind: 'text', operators: TEXT_OPS, supports: EPISODE_ONLY },
  {
    field: 'status',
    label: 'Series Status',
    kind: 'enum',
    operators: LIST_OPS,
    supports: SHOW_ONLY,
    choices: ['continuing', 'ended', 'upcoming'].map((v) => ({ value: v, label: v.replace(/^./, (c) => c.toUpperCase()) })),
  },
];

export function fieldsForType(type: SmartPlaylistType): SmartPlaylistFieldDef[] {
  return SMART_PLAYLIST_FIELDS.filter((f) => f.supports.includes(type));
}

export function getFieldDef(field: SmartPlaylistField): SmartPlaylistFieldDef | null {
  return SMART_PLAYLIST_FIELDS.find((f) => f.field === field) ?? null;
}

export const OPERATOR_LABELS: Record<SmartPlaylistOperator, string> = {
  is: 'is',
  isnot: 'is not',
  contains: 'contains',
  doesnotcontain: 'does not contain',
  startswith: 'starts with',
  endswith: 'ends with',
  greaterthan: 'is greater than',
  lessthan: 'is less than',
  in: 'is one of',
  notin: 'is not one of',
  inthelast: 'is in the last',
  notinthelast: 'is not in the last',
};

export const FIELD_LABELS: Record<SmartPlaylistField, string> = Object.fromEntries(
  SMART_PLAYLIST_FIELDS.map((f) => [f.field, f.label])
) as Record<SmartPlaylistField, string>;

/* ------------------------------------------------------------------ *
 * Evaluation
 * ------------------------------------------------------------------ */

interface NormalizedItem {
  mediaType: 'movie' | 'episode' | 'tvshow';
  id: number;
  values: Record<SmartPlaylistField, string[]>;
  preview: SmartPlaylistPreviewItem;
}

const norm = (s: string | number | null | undefined): string => (s == null ? '' : String(s)).trim().toLowerCase();

/** Collapse Kodi-style codec spellings so "hevc"/"h265"/"h.265" all compare equally. */
function normalizeCodec(raw: string): string {
  const v = norm(raw).replace(/[\s.]/g, '');
  const aliases: Record<string, string> = {
    h265: 'hevc',
    hvc1: 'hevc',
    hev1: 'hevc',
    x265: 'hevc',
    h264: 'h264',
    avc1: 'h264',
    x264: 'h264',
    avc: 'h264',
    dts: 'dts',
    dtshd: 'dtshd_ma',
    dtshdma: 'dtshd_ma',
    truehd: 'truehd',
    eac3: 'eac3',
    eac3atmos: 'eac3',
    ac3: 'ac3',
    aac: 'aac',
    flac: 'flac',
    mpeg2: 'mpeg2',
    mpeg2video: 'mpeg2',
    vc1: 'vc-1',
    av1: 'av1',
  };
  const key = v.replace(/[-_]/g, (m) => m);
  return aliases[v] ?? aliases[key] ?? v;
}

function normalizeHdr(raw: string): string {
  const v = norm(raw).replace(/[\s_-]/g, '');
  if (v.includes('dolby') || v === 'dv' || v === 'dovi') return 'dolbyvision';
  if (v.includes('hdr10+') || v === 'hdr10plus') return 'hdr10+';
  if (v.includes('hdr10')) return 'hdr10';
  if (v === 'hlg') return 'hlg';
  return v;
}

/**
 * Subtitle languages in the library may be ISO 639-1 ("en") while a user types
 * or Kodi stores ISO 639-2/B ("eng"). Canonicalise to 639-2/B so either works.
 */
const LANGUAGE_ALIASES: Record<string, string> = {
  en: 'eng', eng: 'eng',
  es: 'spa', spa: 'spa',
  fr: 'fre', fre: 'fre', fra: 'fre',
  de: 'ger', ger: 'ger', deu: 'ger',
  it: 'ita', ita: 'ita',
  ja: 'jpn', jpn: 'jpn',
  ko: 'kor', kor: 'kor',
  zh: 'chi', chi: 'chi', zho: 'chi',
  ru: 'rus', rus: 'rus',
  pt: 'por', por: 'por',
  nl: 'dut', dut: 'dut', nld: 'dut',
  sv: 'swe', swe: 'swe',
  no: 'nor', nor: 'nor',
  da: 'dan', dan: 'dan',
  fi: 'fin', fin: 'fin',
  pl: 'pol', pol: 'pol',
  tr: 'tur', tur: 'tur',
  ar: 'ara', ara: 'ara',
  he: 'heb', heb: 'heb',
  hi: 'hin', hin: 'hin',
  th: 'tha', tha: 'tha',
  cs: 'cze', cze: 'cze', ces: 'cze',
  el: 'gre', gre: 'gre', ell: 'gre',
  hu: 'hun', hun: 'hun',
  ro: 'rum', rum: 'rum', ron: 'rum',
  uk: 'ukr', ukr: 'ukr',
  vi: 'vie', vie: 'vie',
  id: 'ind', ind: 'ind',
  und: 'und',
};

function normalizeLanguage(raw: string): string {
  const v = norm(raw);
  return LANGUAGE_ALIASES[v] ?? LANGUAGE_ALIASES[v.slice(0, 2)] ?? v;
}

function ratingOf(ratings: Array<{ value: number; isDefault?: boolean; max?: number }>): number | null {
  if (!ratings || ratings.length === 0) return null;
  const dflt = ratings.find((r) => r.isDefault) ?? ratings[0];
  if (!dflt) return null;
  // Normalize percentage-scored sources (RT/MC) onto a 0–10 scale for comparisons.
  return dflt.max === 100 ? dflt.value / 10 : dflt.value;
}

function videoOf(streamDetails: { video: Array<Record<string, unknown>> }) {
  return streamDetails.video?.[0] ?? {};
}
function audioOf(streamDetails: { audio: Array<Record<string, unknown>> }) {
  return streamDetails.audio?.[0] ?? {};
}

function movieToItem(m: MovieRecord): NormalizedItem {
  const v = videoOf(m.streamDetails as never);
  const a = audioOf(m.streamDetails as never);
  const height = Number(v.height ?? 0);
  const parsedRes = m.parsedInfo.resolution ?? null;
  const derivedHeight = height > 0 ? height : parsedRes ? Number(parsedRes.replace(/\D/g, '')) || 0 : 0;
  const rating = ratingOf(m.ratings);
  const values: Record<SmartPlaylistField, string[]> = {
    title: [norm(m.title), norm(m.originalTitle), norm(m.sortTitle)],
    genre: m.genres.map(norm),
    tag: m.tags.map(norm),
    studio: m.studios.map(norm),
    year: m.year != null ? [String(m.year)] : [],
    rating: rating != null ? [String(Number(rating.toFixed(2)))] : [],
    userrating: m.userRating != null ? [String(m.userRating)] : [],
    playcount: [String(m.watched ? Math.max(1, m.playCount) : 0)],
    videoresolution: derivedHeight ? [String(derivedHeight)] : [],
    videocodec: [normalizeCodec(String(m.parsedInfo.videoCodec ?? v.codec ?? ''))].filter(Boolean),
    hdr: [normalizeHdr(String(m.parsedInfo.hdr ?? v.hdrType ?? ''))].filter(Boolean),
    audiocodec: [normalizeCodec(String(m.parsedInfo.audioCodec ?? a.codec ?? ''))].filter(Boolean),
    audiochannels: a.channels != null ? [String(a.channels)] : m.parsedInfo.audioChannels ? [String(m.parsedInfo.audioChannels)] : [],
    subtitlelanguage: m.subtitles.map((s) => normalizeLanguage(s.language)),
    runtime: m.runtimeMinutes != null ? [String(m.runtimeMinutes)] : [],
    dateadded: [norm(m.dateAdded)],
    set: [norm(m.setName ?? '')].filter(Boolean),
    director: m.directors.map(norm),
    writer: m.writers.map(norm),
    actor: m.actors.map((x) => norm(x.name)),
    mpaa: m.mpaa ? [norm(m.mpaa)] : [],
    country: m.country ? [norm(m.country)] : [],
    season: [],
    episode: [],
    tvshowtitle: [],
    status: [],
  };
  return {
    mediaType: 'movie',
    id: m.id,
    values,
    preview: {
      mediaType: 'movie',
      id: m.id,
      title: m.title,
      subtitle: [m.year, m.genres[0]].filter(Boolean).join(' · '),
      year: m.year,
      rating,
      resolution: derivedHeight ? `${derivedHeight}p` : parsedRes,
      watched: m.watched,
    },
  };
}

function episodeToItem(e: TvEpisodeRecord, show?: TvShowRecord): NormalizedItem {
  const v = videoOf(e.streamDetails as never);
  const a = audioOf(e.streamDetails as never);
  const height = Number(v.height ?? 0);
  const parsedRes = e.parsedInfo.resolution ?? null;
  const derivedHeight = height > 0 ? height : parsedRes ? Number(parsedRes.replace(/\D/g, '')) || 0 : 0;
  const rating = ratingOf(e.ratings);
  const code = `S${String(e.seasonNumber).padStart(2, '0')}E${String(e.episodeNumber).padStart(2, '0')}`;
  const values: Record<SmartPlaylistField, string[]> = {
    title: [norm(e.title)],
    genre: (show?.genres ?? []).map(norm),
    tag: (show?.tags ?? []).map(norm),
    studio: show?.studio ? [norm(show.studio)] : [],
    year: e.aired ? [e.aired.slice(0, 4)] : show?.year ? [String(show.year)] : [],
    rating: rating != null ? [String(Number(rating.toFixed(2)))] : [],
    userrating: e.userRating != null ? [String(e.userRating)] : [],
    playcount: [String(e.watched ? Math.max(1, e.playCount) : 0)],
    videoresolution: derivedHeight ? [String(derivedHeight)] : [],
    videocodec: [normalizeCodec(String(e.parsedInfo.videoCodec ?? v.codec ?? ''))].filter(Boolean),
    hdr: [normalizeHdr(String(e.parsedInfo.hdr ?? v.hdrType ?? ''))].filter(Boolean),
    audiocodec: [normalizeCodec(String(e.parsedInfo.audioCodec ?? a.codec ?? ''))].filter(Boolean),
    audiochannels: a.channels != null ? [String(a.channels)] : e.parsedInfo.audioChannels ? [String(e.parsedInfo.audioChannels)] : [],
    subtitlelanguage: e.subtitles.map((s) => normalizeLanguage(s.language)),
    runtime: e.runtimeMinutes != null ? [String(e.runtimeMinutes)] : [],
    dateadded: [],
    set: [],
    director: e.directors.map(norm),
    writer: e.writers.map(norm),
    actor: e.actors.map((x) => norm(x.name)),
    mpaa: [],
    country: [],
    season: [String(e.seasonNumber)],
    episode: [String(e.episodeNumber)],
    tvshowtitle: [norm(e.showTitle ?? show?.title ?? '')].filter(Boolean),
    status: [],
  };
  return {
    mediaType: 'episode',
    id: e.id,
    values,
    preview: {
      mediaType: 'episode',
      id: e.id,
      title: `${code} — ${e.title}`,
      subtitle: [e.showTitle ?? show?.title, e.aired].filter(Boolean).join(' · '),
      year: e.aired ? Number(e.aired.slice(0, 4)) || null : null,
      rating,
      resolution: derivedHeight ? `${derivedHeight}p` : parsedRes,
      watched: e.watched,
    },
  };
}

function showToItem(s: TvShowRecord): NormalizedItem {
  const rating = ratingOf(s.ratings);
  const values: Record<SmartPlaylistField, string[]> = {
    title: [norm(s.title), norm(s.originalTitle), norm(s.sortTitle)],
    genre: s.genres.map(norm),
    tag: s.tags.map(norm),
    studio: s.studio ? [norm(s.studio)] : [],
    year: s.year != null ? [String(s.year)] : [],
    rating: rating != null ? [String(Number(rating.toFixed(2)))] : [],
    userrating: s.userRating != null ? [String(s.userRating)] : [],
    playcount: [],
    videoresolution: [],
    videocodec: [],
    hdr: [],
    audiocodec: [],
    audiochannels: [],
    subtitlelanguage: [],
    runtime: [],
    dateadded: [norm(s.dateAdded)],
    set: [],
    director: [],
    writer: [],
    actor: s.actors.map((x) => norm(x.name)),
    mpaa: s.mpaa ? [norm(s.mpaa)] : [],
    country: [],
    season: [],
    episode: [],
    tvshowtitle: [],
    status: [norm(s.status)],
  };
  return {
    mediaType: 'tvshow',
    id: s.id,
    values,
    preview: {
      mediaType: 'tvshow',
      id: s.id,
      title: s.title,
      subtitle: [s.year, s.status, `${s.episodesCount} episodes`].filter(Boolean).join(' · '),
      year: s.year,
      rating,
      resolution: null,
      watched: s.episodesCount > 0 && s.watchedEpisodesCount >= s.episodesCount,
    },
  };
}

/** Build the normalised candidate list for a playlist type. */
export function buildPlaylistItems(
  type: SmartPlaylistType,
  movies: MovieRecord[],
  episodes: TvEpisodeRecord[],
  shows: TvShowRecord[]
): NormalizedItem[] {
  if (type === 'movies') return movies.map(movieToItem);
  if (type === 'episodes') {
    const byId = new Map(shows.map((s) => [s.id, s]));
    return episodes.map((e) => episodeToItem(e, byId.get(e.showId)));
  }
  return shows.map(showToItem);
}

function daysAgo(iso: string, now: number): number | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((now - t) / 86_400_000);
}

function compareNumber(actual: number, operator: SmartPlaylistOperator, expected: number): boolean {
  switch (operator) {
    case 'is':
      return actual === expected;
    case 'isnot':
      return actual !== expected;
    case 'greaterthan':
      return actual > expected;
    case 'lessthan':
      return actual < expected;
    default:
      return false;
  }
}

/** Evaluate one rule against one item. Returns false when the item has no value for the field. */
export function evaluateRule(item: NormalizedItem, rule: SmartPlaylistRule, now = Date.now()): boolean {
  const def = getFieldDef(rule.field);
  if (!def) return false;
  const values = item.values[rule.field] ?? [];
  const raw = rule.value?.trim() ?? '';
  if (!raw) return false;

  // dateadded compares against a rolling window rather than an absolute date.
  if (def.kind === 'date-days') {
    const dates = values.filter(Boolean);
    if (dates.length === 0) return false;
    const window = Number(raw);
    if (!Number.isFinite(window)) return false;
    const within = dates.some((d) => {
      const diff = daysAgo(d, now);
      return diff != null && diff <= window;
    });
    return rule.operator === 'notinthelast' ? !within : within;
  }

  // Resolution is presented as a friendly enum in the UI but compared numerically
  // (Kodi stores it as a vertical pixel count), so it must not hit the enum branch.
  if (def.kind === 'number' || def.field === 'videoresolution') {
    const nums = values.map(Number).filter((n) => Number.isFinite(n));
    if (nums.length === 0) return false;
    const expected = Number(raw);
    if (!Number.isFinite(expected)) return false;
    return nums.some((n) => compareNumber(n, rule.operator, expected));
  }

  if (def.kind === 'enum') {
    const expected = rule.field === 'videocodec' || rule.field === 'audiocodec' ? normalizeCodec(raw) : rule.field === 'hdr' ? normalizeHdr(raw) : norm(raw);
    const hits = values.some((v) => v === expected || v.includes(expected));
    return rule.operator === 'isnot' || rule.operator === 'doesnotcontain' ? !hits : hits;
  }

  // Text and list fields: token-wise so "Science Fiction" matches the genre list.
  const expected = rule.field === 'subtitlelanguage' ? normalizeLanguage(raw) : norm(raw);
  switch (rule.operator) {
    case 'contains':
    case 'in':
      return values.some((v) => v === expected || v.includes(expected));
    case 'doesnotcontain':
    case 'notin':
      return !values.some((v) => v === expected || v.includes(expected));
    case 'is':
      return values.some((v) => v === expected);
    case 'isnot':
      return !values.some((v) => v === expected);
    case 'startswith':
      return values.some((v) => v.startsWith(expected));
    case 'endswith':
      return values.some((v) => v.endsWith(expected));
    default:
      return false;
  }
}

/** Percent of the item list matched by all rules — used to sort per-rule diagnostics. */
export function evaluateDefinition(
  definition: SmartPlaylistDefinition,
  items: NormalizedItem[],
  now = Date.now()
): { matched: NormalizedItem[]; diagnostics: SmartPlaylistRuleDiagnostic[]; warnings: string[] } {
  const activeRules = definition.rules.filter((r) => r.value?.trim() !== '');
  const warnings: string[] = [];

  const perRule = activeRules.map((rule) => ({
    rule,
    hits: new Set(items.filter((item) => evaluateRule(item, rule, now)).map((i) => `${i.mediaType}:${i.id}`)),
  }));

  let matched: NormalizedItem[];
  if (perRule.length === 0) {
    matched = items;
    warnings.push('No filter rules — this playlist matches the entire library.');
  } else if (definition.match === 'one') {
    const ids = new Set<string>();
    perRule.forEach(({ hits }) => hits.forEach((id) => ids.add(id)));
    matched = items.filter((i) => ids.has(`${i.mediaType}:${i.id}`));
  } else {
    matched = items.filter((item) => perRule.every(({ hits }) => hits.has(`${item.mediaType}:${item.id}`)));
  }

  const diagnostics: SmartPlaylistRuleDiagnostic[] = perRule.map(({ rule, hits }) => ({
    ruleId: rule.id,
    label: `${FIELD_LABELS[rule.field] ?? rule.field} ${OPERATOR_LABELS[rule.operator]} "${rule.value}"`,
    matchedCount: hits.size,
    blocking: definition.match === 'all' && matched.length === 0 && hits.size === 0,
  }));

  if (definition.rules.some((r) => r.value?.trim() === '')) {
    warnings.push('Blank rule values are ignored until filled in.');
  }
  if (definition.limit && definition.limit > 0 && matched.length > definition.limit) {
    warnings.push(`Limited to the first ${definition.limit} items — ${matched.length} match the rules.`);
  }

  return { matched, diagnostics, warnings };
}

function sortItems(items: NormalizedItem[], definition: SmartPlaylistDefinition): NormalizedItem[] {
  const { by, direction } = definition.order;
  const sign = direction === 'ascending' ? 1 : -1;
  if (by === 'random') {
    return [...items].sort(() => Math.random() - 0.5);
  }
  const keyOf = (i: NormalizedItem): string | number => {
    switch (by) {
      case 'title':
        return i.preview.title.toLowerCase();
      case 'rating':
        return i.preview.rating ?? -1;
      case 'year':
        return i.preview.year ?? 0;
      case 'playcount':
        return Number(i.values.playcount?.[0] ?? 0);
      case 'runtime':
        return Number(i.values.runtime?.[0] ?? 0);
      case 'dateadded':
        return i.values.dateadded?.[0] ?? '';
      case 'episode':
        return (Number(i.values.season?.[0] ?? 0) * 10_000) + Number(i.values.episode?.[0] ?? 0);
      default:
        return i.preview.title.toLowerCase();
    }
  };
  return [...items].sort((a, b) => {
    if (by === 'episode') {
      const showCmp = String(a.values.tvshowtitle?.[0] ?? '').localeCompare(String(b.values.tvshowtitle?.[0] ?? ''));
      if (showCmp !== 0) return showCmp;
    }
    const ka = keyOf(a);
    const kb = keyOf(b);
    if (typeof ka === 'number' && typeof kb === 'number') return (ka - kb) * sign;
    return String(ka).localeCompare(String(kb)) * sign;
  });
}

export function previewDefinition(
  definition: SmartPlaylistDefinition,
  movies: MovieRecord[],
  episodes: TvEpisodeRecord[],
  shows: TvShowRecord[],
  sampleSize = 25
): { preview: Omit<SmartPlaylistPreview, 'kodiFileName' | 'xml'>; matched: NormalizedItem[] } {
  const items = buildPlaylistItems(definition.type, movies, episodes, shows);
  const { matched, diagnostics, warnings } = evaluateDefinition(definition, items);
  const ordered = sortItems(matched, definition);
  const limited = definition.limit && definition.limit > 0 ? ordered.slice(0, definition.limit) : ordered;
  return {
    matched,
    preview: {
      totalCount: limited.length,
      libraryCount: items.length,
      items: limited.slice(0, sampleSize).map((i) => i.preview),
      rules: diagnostics,
      warnings,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Kodi .xsp serialisation
 * ------------------------------------------------------------------ */

export function escapeXmlText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Kodi derives a playlist's display name from the file name, so keep it filesystem-safe. */
export function toKodiPlaylistFileName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'Smart Playlist';
}

function ruleToKodiXml(rule: SmartPlaylistRule): string {
  const def = getFieldDef(rule.field);
  const value = rule.value.trim();
  const lines = [`  <rule field="${rule.field}" operator="${rule.operator}">`];
  if (def?.kind === 'date-days') {
    // Kodi expects "N" for inthelast windows on dateadded.
    lines.push(`    <value>${escapeXmlText(value)}</value>`);
  } else {
    lines.push(`    <value>${escapeXmlText(value)}</value>`);
  }
  if (rule.value2 && rule.value2.trim()) {
    lines.push(`    <value>${escapeXmlText(rule.value2.trim())}</value>`);
  }
  lines.push('  </rule>');
  return lines.join('\n');
}

export function serializeSmartPlaylist(definition: SmartPlaylistDefinition): string {
  const rules = definition.rules.filter((r) => r.value?.trim() !== '');
  const lines = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>',
    `<smartplaylist type="${definition.type}">`,
    `  <name>${escapeXmlText(definition.name.trim() || 'Smart Playlist')}</name>`,
    `  <match>${definition.match}</match>`,
    ...rules.map(ruleToKodiXml),
    `  <order direction="${definition.order.direction}">${definition.order.by}</order>`,
  ];
  if (definition.limit && definition.limit > 0) lines.push(`  <limit>${definition.limit}</limit>`);
  lines.push('</smartplaylist>');
  return lines.join('\n') + '\n';
}

/** Stable hash used to flag a saved playlist as stale after its rules change. */
export function hashPlaylistDefinition(definition: SmartPlaylistDefinition): string {
  const canonical = JSON.stringify({
    type: definition.type,
    match: definition.match,
    rules: definition.rules
      .filter((r) => r.value?.trim() !== '')
      .map((r) => ({ field: r.field, operator: r.operator, value: r.value.trim(), value2: r.value2?.trim() ?? '' })),
    order: definition.order,
    limit: definition.limit ?? null,
  });
  let hash = 5381;
  for (let i = 0; i < canonical.length; i++) {
    hash = ((hash << 5) + hash + canonical.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}

/* ------------------------------------------------------------------ *
 * Presets
 * ------------------------------------------------------------------ */

let ruleSeq = 0;
export function newRuleId(): string {
  ruleSeq += 1;
  return `r${Date.now().toString(36)}${ruleSeq.toString(36)}`;
}

function rule(field: SmartPlaylistField, operator: SmartPlaylistOperator, value: string): SmartPlaylistRule {
  return { id: newRuleId(), field, operator, value };
}

export const SMART_PLAYLIST_PRESETS: Array<{
  id: SmartPlaylistPresetId;
  label: string;
  description: string;
  definition: SmartPlaylistDefinition;
}> = [
  {
    id: 'top-rated',
    label: 'Top Rated',
    description: 'Highest rated movies in the library, best first.',
    definition: {
      name: 'Top Rated Movies',
      type: 'movies',
      match: 'all',
      rules: [rule('rating', 'greaterthan', '7.5')],
      order: { by: 'rating', direction: 'descending' },
      limit: 100,
    },
  },
  {
    id: 'unwatched-4k',
    label: 'Unwatched 4K',
    description: '4K films you have not watched yet.',
    definition: {
      name: 'Unwatched 4K',
      type: 'movies',
      match: 'all',
      rules: [rule('videoresolution', 'greaterthan', '1080'), rule('playcount', 'is', '0')],
      order: { by: 'dateadded', direction: 'descending' },
      limit: null,
    },
  },
  {
    id: 'recently-added',
    label: 'Recently Added',
    description: 'Everything added to the library in the last 30 days.',
    definition: {
      name: 'Recently Added',
      type: 'movies',
      match: 'all',
      rules: [rule('dateadded', 'inthelast', '30')],
      order: { by: 'dateadded', direction: 'descending' },
      limit: 50,
    },
  },
  {
    id: 'in-progress',
    label: 'In Progress',
    description: 'Movies started but not finished.',
    definition: {
      name: 'In Progress',
      type: 'movies',
      match: 'all',
      rules: [rule('playcount', 'greaterthan', '0'), rule('playcount', 'lessthan', '2')],
      order: { by: 'title', direction: 'ascending' },
      limit: null,
    },
  },
  {
    id: 'missing-subtitles',
    label: 'Missing Subtitles',
    description: 'Films with no English subtitle track.',
    definition: {
      name: 'Needs Subtitles',
      type: 'movies',
      match: 'all',
      rules: [rule('subtitlelanguage', 'doesnotcontain', 'eng')],
      order: { by: 'title', direction: 'ascending' },
      limit: null,
    },
  },
  {
    id: 'unwatched-episodes',
    label: 'Unwatched Episodes',
    description: 'Next-up episodes across every series, oldest first.',
    definition: {
      name: 'Unwatched Episodes',
      type: 'episodes',
      match: 'all',
      rules: [rule('playcount', 'is', '0')],
      order: { by: 'episode', direction: 'ascending' },
      limit: null,
    },
  },
  {
    id: 'kids-animation',
    label: 'Kids & Animation',
    description: 'Animated family films.',
    definition: {
      name: 'Kids & Animation',
      type: 'movies',
      match: 'all',
      rules: [rule('genre', 'contains', 'animation'), rule('mpaa', 'isnot', 'R')],
      order: { by: 'title', direction: 'ascending' },
      limit: null,
    },
  },
  {
    id: 'short-films',
    label: 'Under 2½ Hours',
    description: 'Quick watches — anything under 150 minutes.',
    definition: {
      name: 'Under 2.5 Hours',
      type: 'movies',
      match: 'all',
      rules: [rule('runtime', 'lessthan', '150')],
      order: { by: 'runtime', direction: 'ascending' },
      limit: null,
    },
  },
  {
    id: 'continuing-shows',
    label: 'Continuing Shows',
    description: 'Series that are still running.',
    definition: {
      name: 'Continuing Shows',
      type: 'tvshows',
      match: 'all',
      rules: [rule('status', 'is', 'continuing')],
      order: { by: 'title', direction: 'ascending' },
      limit: null,
    },
  },
  {
    id: 'blank',
    label: 'Start Blank',
    description: 'Empty rule set — build it yourself.',
    definition: {
      name: 'New Smart Playlist',
      type: 'movies',
      match: 'all',
      rules: [],
      order: { by: 'title', direction: 'ascending' },
      limit: null,
    },
  },
];

export function presetDefinition(id: SmartPlaylistPresetId): SmartPlaylistDefinition | null {
  const preset = SMART_PLAYLIST_PRESETS.find((p) => p.id === id);
  if (!preset) return null;
  // Deep clone so callers can mutate freely, and give every rule a fresh id.
  return {
    ...preset.definition,
    rules: preset.definition.rules.map((r) => ({ ...r, id: newRuleId() })),
    order: { ...preset.definition.order },
  };
}

/** Validate a definition coming from the API, returning warnings rather than throwing. */
export function sanitizeDefinition(input: Partial<SmartPlaylistDefinition>): {
  definition: SmartPlaylistDefinition;
  warnings: string[];
} {
  const warnings: string[] = [];
  const type: SmartPlaylistType =
    input.type === 'episodes' || input.type === 'tvshows' || input.type === 'movies' ? input.type : 'movies';
  if (input.type && input.type !== type) warnings.push(`Unknown playlist type "${input.type}" — using movies.`);

  const allowedFields = new Set(fieldsForType(type).map((f) => f.field));
  const rules: SmartPlaylistRule[] = [];
  for (const raw of input.rules ?? []) {
    if (!raw || typeof raw !== 'object') continue;
    const def = getFieldDef(raw.field as SmartPlaylistField);
    if (!def) {
      warnings.push(`Ignored unknown field "${String(raw.field)}".`);
      continue;
    }
    if (!allowedFields.has(def.field)) {
      warnings.push(`"${def.label}" does not apply to ${type} — rule ignored.`);
      continue;
    }
    if (!def.operators.includes(raw.operator as SmartPlaylistOperator)) {
      warnings.push(`"${OPERATOR_LABELS[raw.operator as SmartPlaylistOperator] ?? raw.operator}" is not valid for ${def.label} — rule ignored.`);
      continue;
    }
    const value = String(raw.value ?? '').trim();
    if (!value) {
      warnings.push(`${def.label}: empty value — rule ignored.`);
      continue;
    }
    if (def.kind === 'number' || def.kind === 'date-days') {
      const n = Number(value);
      if (!Number.isFinite(n)) {
        warnings.push(`${def.label}: "${value}" is not a number — rule ignored.`);
        continue;
      }
      if (def.field === 'rating' || def.field === 'userrating') {
        if (n < 0 || n > 10) warnings.push(`${def.label}: ${n} is outside 0–10.`);
      }
    }
    rules.push({
      id: String(raw.id ?? newRuleId()),
      field: def.field,
      operator: raw.operator as SmartPlaylistOperator,
      value,
      ...(raw.value2 ? { value2: String(raw.value2) } : {}),
    });
  }

  const limitRaw = input.limit;
  const limit = limitRaw == null || limitRaw === ('' as unknown) ? null : Number(limitRaw);
  if (limit != null && (!Number.isFinite(limit) || limit < 0)) warnings.push('Limit must be a positive number — cleared.');

  const orderBy = input.order?.by;
  const orderByValid: SmartPlaylistDefinition['order']['by'] = (
    ['title', 'rating', 'year', 'dateadded', 'runtime', 'playcount', 'episode', 'random'] as const
  ).includes(orderBy as never)
    ? (orderBy as SmartPlaylistDefinition['order']['by'])
    : 'title';
  const direction = input.order?.direction === 'ascending' ? 'ascending' : 'descending';

  return {
    warnings,
    definition: {
      name: String(input.name ?? '').trim() || 'Smart Playlist',
      type,
      match: input.match === 'one' ? 'one' : 'all',
      rules,
      order: { by: orderByValid, direction },
      limit: limit != null && Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : null,
    },
  };
}
