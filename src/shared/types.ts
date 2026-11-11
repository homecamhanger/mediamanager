export type MediaKind = 'movie' | 'tvshow';

export interface MediaSource {
  id: number;
  name: string;
  path: string;
  mediaKind: MediaKind;
  nfoNaming: 'movie.nfo' | 'filename.nfo';
  artworkNaming: 'folder' | 'filename';
  autoScan: boolean;
  lastScannedAt: string | null;
  createdAt: string;
}

export type RatingSource =
  | 'imdb'
  | 'tmdb'
  | 'rottentomatoes'
  | 'metacritic'
  | 'tvdb'
  | 'trakt'
  | 'tvmaze'
  | 'mal'
  | 'user';

export interface RatingEntry {
  source: RatingSource | string;
  value: number;
  max: number;
  votes?: number;
  isDefault?: boolean;
}

export interface UniqueIds {
  imdb?: string;
  tmdb?: string;
  tvdb?: string;
  tvmaze?: string;
  trakt?: string;
  mal?: string;
  anidb?: string;
  [key: string]: string | undefined;
}

export interface ActorEntry {
  name: string;
  role: string;
  order: number;
  thumb?: string;
}

export type ArtworkKind =
  | 'poster'
  | 'fanart'
  | 'banner'
  | 'clearlogo'
  | 'clearart'
  | 'disc'
  | 'landscape'
  | 'thumb';

export interface ArtworkFileInfo {
  kind: ArtworkKind;
  path: string | null;
  url?: string;
  width?: number;
  height?: number;
  exists: boolean;
}

export interface VideoStreamInfo {
  codec: string;
  width: number;
  height: number;
  aspect: string;
  durationSeconds: number;
  hdrType?: string;
  fps?: number;
  source?: string;
  releaseGroup?: string;
}

export interface AudioStreamInfo {
  codec: string;
  language: string;
  channels: number;
}

export interface EmbeddedSubtitleInfo {
  language: string;
  title?: string;
}

export interface StreamDetails {
  video: VideoStreamInfo[];
  audio: AudioStreamInfo[];
  subtitle: EmbeddedSubtitleInfo[];
}

export interface SubtitleFileRecord {
  id: number;
  mediaType: 'movie' | 'episode';
  mediaId: number;
  filePath: string;
  fileName: string;
  language: string;
  format: 'srt' | 'ass' | 'ssa' | 'vtt' | 'sub';
  forced: boolean;
  sdh: boolean;
  sizeBytes: number;
  cueCount?: number;
}

export interface MovieRecord {
  id: number;
  sourceId: number;
  folderPath: string;
  filePath: string;
  fileName: string;
  fileSizeBytes: number;
  movieHash: string | null;
  nfoPath: string | null;
  hasNfo: boolean;
  nfoValid: boolean;
  nfoWarnings: string[];
  scraped: boolean;
  scrapedSource: string | null;

  title: string;
  originalTitle: string;
  sortTitle: string;
  year: number | null;
  premiered: string | null;
  tagline: string;
  plot: string;
  outline: string;
  runtimeMinutes: number | null;
  mpaa: string;
  country: string;
  studios: string[];
  genres: string[];
  tags: string[];
  directors: string[];
  writers: string[];
  actors: ActorEntry[];
  trailerUrl: string;

  setId: number | null;
  setName: string | null;
  setOverview: string | null;

  uniqueIds: UniqueIds;
  ratings: RatingEntry[];
  userRating: number | null;
  playCount: number;
  watched: boolean;
  lastPlayed: string | null;
  dateAdded: string;

  artwork: Record<ArtworkKind, string | null>;
  artworkCandidates?: Partial<Record<ArtworkKind, ArtworkCandidate[]>>;
  streamDetails: StreamDetails;
  subtitles: SubtitleFileRecord[];

  parsedInfo: ParsedFilenameInfo;
  updatedAt: string;
}

export interface MovieSetRecord {
  id: number;
  name: string;
  overview: string;
  posterPath: string | null;
  fanartPath: string | null;
  clearlogoPath: string | null;
  tmdbCollectionId?: string | null;
  movies: MovieRecord[];
}

export interface GuideEpisodeEntry {
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  aired: string | null;
  plot: string;
  runtimeMinutes: number | null;
  thumbUrl?: string;
}

export interface MissingEpisodeRecord extends GuideEpisodeEntry {
  showId: number;
  showTitle: string;
  seasonName: string;
  code: string;
}

/**
 * A video file found inside a series folder that could not be identified as a
 * specific episode (no `SxxExx` marker, or it lives in an Extras/ScreenShots-style
 * folder). These are kept and surfaced for the user instead of being guessed at or
 * silently dropped.
 */
export interface UnmatchedVideoFile {
  id: number;
  sourceId: number;
  showId: number | null;
  filePath: string;
  fileName: string;
  folderPath: string;
  reason: 'no-episode-marker' | 'non-episode-folder';
  fileSizeBytes: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface TvShowRecord {
  id: number;
  sourceId: number;
  folderPath: string;
  nfoPath: string | null;
  hasNfo: boolean;
  nfoValid: boolean;
  nfoWarnings: string[];
  scraped: boolean;
  scrapedSource: string | null;

  title: string;
  originalTitle: string;
  sortTitle: string;
  year: number | null;
  premiered: string | null;
  status: 'Continuing' | 'Ended' | 'Upcoming' | string;
  plot: string;
  mpaa: string;
  studio: string;
  genres: string[];
  tags: string[];
  actors: ActorEntry[];
  episodeOrder: 'aired' | 'dvd' | 'absolute';
  episodeGuide?: GuideEpisodeEntry[];

  uniqueIds: UniqueIds;
  ratings: RatingEntry[];
  userRating: number | null;
  dateAdded: string;

  artwork: Record<ArtworkKind, string | null>;
  artworkCandidates?: Partial<Record<ArtworkKind, ArtworkCandidate[]>>;
  seasonsCount: number;
  episodesCount: number;
  watchedEpisodesCount: number;
  missingSubtitlesCount: number;
  missingNfoCount: number;
  missingEpisodesCount?: number;
  updatedAt: string;
}

export interface TvSeasonRecord {
  id: number;
  showId: number;
  seasonNumber: number;
  name: string;
  overview: string;
  folderPath: string | null;
  nfoPath: string | null;
  hasNfo: boolean;
  posterPath: string | null;
  bannerPath: string | null;
  episodesCount: number;
}

export interface TvEpisodeSubEntry {
  seasonNumber: number;
  episodeNumber: number;
  displaySeason?: number | null;
  displayEpisode?: number | null;
  title: string;
  aired: string | null;
  plot: string;
  runtimeMinutes: number | null;
  directors: string[];
  writers: string[];
  actors: ActorEntry[];
  uniqueIds: UniqueIds;
  ratings: RatingEntry[];
  userRating: number | null;
  playCount: number;
  watched: boolean;
  lastPlayed: string | null;
}

export interface TvEpisodeRecord {
  id: number;
  showId: number;
  seasonNumber: number;
  episodeNumber: number;
  displaySeason?: number | null;
  displayEpisode?: number | null;
  multiEpisodeEnd?: number | null;
  multiEpisodeParts?: TvEpisodeSubEntry[];
  folderPath: string;
  filePath: string;
  fileName: string;
  fileSizeBytes: number;
  movieHash: string | null;
  nfoPath: string | null;
  hasNfo: boolean;
  nfoValid: boolean;
  nfoWarnings: string[];
  scraped: boolean;

  title: string;
  showTitle: string;
  aired: string | null;
  plot: string;
  runtimeMinutes: number | null;
  directors: string[];
  writers: string[];
  actors: ActorEntry[];
  uniqueIds: UniqueIds;
  ratings: RatingEntry[];
  userRating: number | null;
  playCount: number;
  watched: boolean;
  lastPlayed: string | null;

  thumbPath: string | null;
  streamDetails: StreamDetails;
  subtitles: SubtitleFileRecord[];
  parsedInfo: ParsedFilenameInfo;
}

export interface ParsedFilenameInfo {
  cleanTitle: string;
  year: number | null;
  mediaKind: 'movie' | 'episode';
  seasonNumber: number | null;
  episodeNumber: number | null;
  multiEpisodeEnd: number | null;
  resolution: string | null;
  source: string | null;
  videoCodec: string | null;
  audioCodec: string | null;
  audioChannels: number | null;
  hdr: string | null;
  edition: string | null;
  releaseGroup: string | null;
}

export type ScraperProviderId =
  | 'tmdb'
  | 'tvdb'
  | 'omdb'
  | 'tvmaze'
  | 'fanarttv'
  | 'trakt'
  | 'jikan'
  | 'itunes'
  | 'wikidata'
  | 'kodi-catalog';

export interface ScraperProviderConfig {
  id: ScraperProviderId;
  name: string;
  description: string;
  supports: ('movie' | 'tvshow' | 'artwork' | 'ratings' | 'anime')[];
  requiresKey: boolean;
  apiKey: string;
  secondaryKey?: string; // e.g. TVDB PIN / Trakt Client Secret
  enabled: boolean;
  priority: number;
  language: string;
  useDemoFallback: boolean;
}

export interface ScraperFieldMapping {
  title: ScraperProviderId[];
  plot: ScraperProviderId[];
  ratings: ScraperProviderId[]; // multi-source aggregate!
  cast: ScraperProviderId[];
  genres: ScraperProviderId[];
  certification: ScraperProviderId[];
  artwork: ScraperProviderId[];
  episodeGuide: ScraperProviderId[];
}

export interface ArtworkCandidate {
  kind: ArtworkKind;
  url: string;
  provider: ScraperProviderId;
  language?: string;
  width?: number;
  height?: number;
  score?: number;
  label?: string;
}

export interface ScraperSearchResult {
  externalId: string;
  provider: ScraperProviderId;
  mediaKind: 'movie' | 'tvshow';
  title: string;
  originalTitle?: string;
  year: number | null;
  overview: string;
  posterUrl?: string;
  confidence: number;
  uniqueIds: UniqueIds;
  dataOrigin: 'live-api' | 'builtin-catalog';
}

export interface ScrapedMetadataBundle {
  provider: ScraperProviderId;
  sourcesUsed: ScraperProviderId[];
  dataOrigin: 'live-api' | 'builtin-catalog' | 'hybrid';
  title: string;
  originalTitle: string;
  sortTitle: string;
  year: number | null;
  premiered: string | null;
  tagline: string;
  plot: string;
  outline: string;
  runtimeMinutes: number | null;
  mpaa: string;
  country: string;
  status?: string;
  studios: string[];
  genres: string[];
  tags: string[];
  directors: string[];
  writers: string[];
  actors: ActorEntry[];
  trailerUrl: string;
  setName?: string;
  setOverview?: string;
  tmdbCollectionId?: string;
  uniqueIds: UniqueIds;
  ratings: RatingEntry[];
  artwork: ArtworkCandidate[];
  episodes?: Array<{
    seasonNumber: number;
    episodeNumber: number;
    title: string;
    aired: string | null;
    plot: string;
    runtimeMinutes: number | null;
    directors: string[];
    writers: string[];
    actors?: ActorEntry[];
    ratings: RatingEntry[];
    uniqueIds: UniqueIds;
    thumbUrl?: string;
  }>;
}

export interface ScrapedEpisodePart {
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  aired: string | null;
  plot: string;
  runtimeMinutes: number | null;
  directors: string[];
  writers: string[];
  actors: ActorEntry[];
  ratings: RatingEntry[];
  uniqueIds: UniqueIds;
  thumbUrl?: string;
  sourcesUsed: ScraperProviderId[];
}

export interface EpisodeScrapePreview {
  episodeId: number;
  showId: number;
  showTitle: string;
  showUniqueIds: UniqueIds;
  seasonNumber: number;
  episodeNumber: number;
  multiEpisodeEnd: number | null;
  matched: boolean;
  sourcesUsed: ScraperProviderId[];
  dataOrigin: 'live-api' | 'builtin-catalog' | 'hybrid';
  parts: ScrapedEpisodePart[];
}

export interface SubtitleSearchResult {
  id: string;
  provider: 'opensubtitles' | 'subdl' | 'builtin-subtitles';
  language: string;
  languageName: string;
  releaseName: string;
  format: 'srt' | 'ass' | 'vtt';
  fps?: number;
  forced: boolean;
  sdh: boolean;
  hashMatch: boolean;
  downloads: number;
  rating: number;
  uploader: string;
  dataOrigin: 'live-api' | 'builtin-catalog';
  downloadUrl?: string;
  externalFileId?: string;
}

export interface SubtitleCue {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

export interface RenamePatternsConfig {
  movieFolderPattern: string;
  movieFilePattern: string;
  tvShowFolderPattern: string;
  seasonFolderPattern: string;
  specialsFolderName: string;
  episodeFilePattern: string;
  colonReplacement: 'dash' | 'space' | 'remove';
  spaceReplacement: 'space' | 'dot' | 'underscore';
  cleanupEmptyFolders: boolean;
  renameSidecarFiles: boolean;
}

export interface RenameSidecarMove {
  kind: 'video' | 'nfo' | 'subtitle' | 'artwork' | 'trailer';
  oldPath: string;
  newPath: string;
}

export interface RenamePreviewItem {
  mediaType: 'movie' | 'episode';
  mediaId: number;
  title: string;
  hasChanges: boolean;
  conflict: string | null;
  oldPath: string;
  newPath: string;
  sidecars: RenameSidecarMove[];
}

export interface RenameHistoryBatch {
  id: string;
  createdAt: string;
  mediaType: 'movie' | 'episode' | 'mixed';
  itemCount: number;
  reverted: boolean;
  moves: RenameSidecarMove[];
}

export interface NfoValidationReport {
  valid: boolean;
  kodiVersionTarget: string;
  warnings: string[];
  errors: string[];
  rootElement: string | null;
  hasUniqueIdDefault: boolean;
  hasRatingsBlock: boolean;
  hasStreamDetails: boolean;
}

export interface LibraryAuditReport {
  summary: {
    totalMovies: number;
    totalShows: number;
    totalEpisodes: number;
    totalSets: number;
    totalSubtitles: number;
    healthScore: number;
  };
  issues: {
    unscrapedMovies: Array<{ id: number; title: string; filePath: string }>;
    unscrapedShows: Array<{ id: number; title: string; folderPath: string }>;
    missingMovieNfo: Array<{ id: number; title: string; filePath: string }>;
    missingEpisodeNfo: Array<{ id: number; showId: number; showTitle: string; code: string; title: string }>;
    missingArtwork: Array<{ mediaType: 'movie' | 'tvshow'; id: number; title: string; missing: ArtworkKind[] }>;
    missingSubtitles: Array<{ mediaType: 'movie' | 'episode'; id: number; showId?: number; title: string; missingLanguages: string[] }>;
    duplicateMovies: Array<{ key: string; reason: string; items: Array<{ id: number; title: string; year: number | null; filePath: string; resolution: string | null }> }>;
    duplicateEpisodes: Array<{ key: string; showTitle: string; season: number; episode: number; items: Array<{ id: number; title: string; filePath: string }> }>;
    invalidNfoFiles: Array<{ mediaType: 'movie' | 'tvshow' | 'episode'; id: number; showId?: number; title: string; warnings: string[] }>;
    lowResolutionItems: Array<{ mediaType: 'movie' | 'episode'; id: number; title: string; resolution: string; filePath: string }>;
    missingEpisodes?: MissingEpisodeRecord[];
  };
}

export interface KodiPathMapping {
  localPrefix: string;
  kodiPrefix: string;
}

export interface KodiRpcConfig {
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  password: string;
  pathMappings: KodiPathMapping[];
  lastConnectedAt: string | null;
  lastStatus: string | null;
}

export interface KodiSyncResult {
  direction: 'pull' | 'push';
  matchedMovies: number;
  updatedMovies: number;
  matchedEpisodes: number;
  updatedEpisodes: number;
  unmatchedCount: number;
  errors: string[];
}

export interface AppPreferences {
  preferredLanguages: string[];
  preferredSubtitleLanguages: string[];
  scraperLanguage: string;
  defaultNfoNaming: 'movie.nfo' | 'filename.nfo';
  defaultArtworkNaming: 'folder' | 'filename';
  downloadArtworkKinds: ArtworkKind[];
  writeActorThumbs: boolean;
  autoWriteNfoOnScrape: boolean;
  autoDownloadSubtitlesOnScrape: boolean;
}

export interface ActivityLogEntry {
  id: number;
  action: string;
  category: 'scan' | 'scrape' | 'nfo' | 'subtitle' | 'rename' | 'kodi' | 'system';
  status: 'success' | 'warning' | 'error' | 'info';
  message: string;
  createdAt: string;
}

export interface DashboardSummary {
  counts: {
    movies: number;
    shows: number;
    episodes: number;
    sets: number;
    subtitles: number;
    scrapedMovies: number;
    scrapedShows: number;
    moviesWithNfo: number;
    moviesWithPoster: number;
    moviesWithFanart: number;
    moviesWithClearlogo: number;
    totalStorageBytes: number;
  };
  qualityDistribution: Array<{ label: string; count: number }>;
  genreDistribution: Array<{ genre: string; count: number }>;
  sourceStatuses: Array<{ id: ScraperProviderId; name: string; enabled: boolean; configured: boolean; mode: string }>;
  recentActivity: ActivityLogEntry[];
  healthScore: number;
}

export type ScanStepId =
  | 'register_source'
  | 'discover_files'
  | 'probe_and_hash'
  | 'parse_sidecars'
  | 'finalize';

export type ScanStepStatus = 'pending' | 'in_progress' | 'completed' | 'error';

export interface ScanStepProgress {
  id: ScanStepId;
  label: string;
  description: string;
  status: ScanStepStatus;
  completedCount?: number;
  totalCount?: number;
  detail?: string;
}

export interface SourceScanJob {
  jobId: string;
  sourceId: number;
  sourceName: string;
  sourcePath: string;
  mediaKind: MediaKind;
  status: 'queued' | 'running' | 'completed' | 'failed';
  overallPercent: number;
  currentItem?: string;
  itemsProcessed: number;
  itemsTotal: number;
  moviesScanned: number;
  showsScanned: number;
  episodesScanned: number;
  steps: ScanStepProgress[];
  error?: string;
  startedAt: string;
  finishedAt: string | null;
}

export type BatchJobKind = 'scrape' | 'subtitles' | 'nfo' | 'scan';

export interface BatchJob {
  jobId: string;
  kind: BatchJobKind;
  label: string;
  status: 'running' | 'completed' | 'cancelled' | 'failed';
  overallPercent: number;
  processedCount: number;
  totalCount: number;
  succeededCount: number;
  skippedCount: number;
  failedCount: number;
  currentItem?: string;
  detail?: string;
  cancelRequested: boolean;
  error?: string;
  startedAt: string;
  finishedAt: string | null;
}

/* ------------------------------------------------------------------ *
 * Smart playlists (Kodi .xsp)
 * ------------------------------------------------------------------ */

export type SmartPlaylistType = 'movies' | 'episodes' | 'tvshows';

/** Fields we can both evaluate locally (for previews) and emit as Kodi <rule>s. */
export type SmartPlaylistField =
  | 'title'
  | 'genre'
  | 'tag'
  | 'studio'
  | 'year'
  | 'rating'
  | 'userrating'
  | 'playcount'
  | 'videoresolution'
  | 'videocodec'
  | 'hdr'
  | 'audiocodec'
  | 'audiochannels'
  | 'subtitlelanguage'
  | 'runtime'
  | 'dateadded'
  | 'set'
  | 'director'
  | 'writer'
  | 'actor'
  | 'mpaa'
  | 'country'
  | 'season'
  | 'episode'
  | 'tvshowtitle'
  | 'status';

export type SmartPlaylistOperator =
  | 'is'
  | 'isnot'
  | 'contains'
  | 'doesnotcontain'
  | 'startswith'
  | 'endswith'
  | 'greaterthan'
  | 'lessthan'
  | 'in'
  | 'notin'
  | 'inthelast'
  | 'notinthelast';

/** How comparison values are typed for a given field (drives the UI control). */
export type SmartPlaylistFieldKind = 'text' | 'number' | 'list' | 'date-days' | 'enum' | 'boolean';

export interface SmartPlaylistFieldDef {
  field: SmartPlaylistField;
  label: string;
  kind: SmartPlaylistFieldKind;
  operators: SmartPlaylistOperator[];
  supports: SmartPlaylistType[];
  unit?: string;
  hint?: string;
  choices?: Array<{ value: string; label: string }>;
}

export interface SmartPlaylistRule {
  id: string;
  field: SmartPlaylistField;
  operator: SmartPlaylistOperator;
  value: string;
  /** Optional second value, used by between-range style rules (year/runtime). */
  value2?: string;
}

export interface SmartPlaylistOrder {
  by: 'title' | 'rating' | 'year' | 'dateadded' | 'runtime' | 'playcount' | 'episode' | 'random';
  direction: 'ascending' | 'descending';
}

export interface SmartPlaylistDefinition {
  name: string;
  type: SmartPlaylistType;
  match: 'all' | 'one';
  rules: SmartPlaylistRule[];
  order: SmartPlaylistOrder;
  limit?: number | null;
}

export interface SmartPlaylistPreviewItem {
  mediaType: 'movie' | 'episode' | 'tvshow';
  id: number;
  title: string;
  subtitle: string;
  year: number | null;
  rating: number | null;
  resolution: string | null;
  watched: boolean;
}

export interface SmartPlaylistRuleDiagnostic {
  ruleId: string;
  label: string;
  matchedCount: number;
  /** True when this rule is the reason a whole `match=all` playlist is empty. */
  blocking: boolean;
}

export interface SmartPlaylistPreview {
  totalCount: number;
  libraryCount: number;
  items: SmartPlaylistPreviewItem[];
  rules: SmartPlaylistRuleDiagnostic[];
  warnings: string[];
  /** Kodi file name that will be written when pushed, without the .xsp extension. */
  kodiFileName: string;
  xml: string;
}

export interface SmartPlaylistRecord extends SmartPlaylistDefinition {
  id: number;
  createdAt: string;
  updatedAt: string;
  lastExportedAt: string | null;
  lastExportedHash: string | null;
  /** True when the definition has changed since the last export/push. */
  stale: boolean;
  /** Last preview count, cached so the list view can show sizes without re-evaluating. */
  lastKnownCount: number | null;
}

export interface SmartPlaylistExportResult {
  ok: boolean;
  method: 'json-rpc' | 'local-file';
  targetPath?: string;
  error?: string;
  xml: string;
}

/** Preset templates surfaced in the builder. */
export type SmartPlaylistPresetId =
  | 'top-rated'
  | 'unwatched-4k'
  | 'recently-added'
  | 'in-progress'
  | 'missing-subtitles'
  | 'unwatched-episodes'
  | 'kids-animation'
  | 'short-films'
  | 'continuing-shows'
  | 'blank';

export interface VocabularyTerm {
  value: string;
  count: number;
  mediaTypes: Array<'movie' | 'tvshow'>;
}

export interface LibraryVocabulary {
  tags: VocabularyTerm[];
  genres: VocabularyTerm[];
  studios: VocabularyTerm[];
  directors: VocabularyTerm[];
  writers: VocabularyTerm[];
}
