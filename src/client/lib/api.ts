import type {
  ActivityLogEntry,
  AppPreferences,
  ArtworkKind,
  DashboardSummary,
  KodiRpcConfig,
  LibraryAuditReport,
  MediaSource,
  MovieRecord,
  MovieSetRecord,
  NfoValidationReport,
  RenameHistoryBatch,
  RenamePatternsConfig,
  RenamePreviewItem,
  ScrapedMetadataBundle,
  ScraperFieldMapping,
  ScraperProviderConfig,
  ScraperProviderId,
  ScraperSearchResult,
  SubtitleCue,
  SubtitleFileRecord,
  SubtitleSearchResult,
  TvEpisodeRecord,
  TvSeasonRecord,
  TvShowRecord,
} from '../../shared/types.js';

export function getArtworkUrl(filePath: string | null | undefined, cacheBust?: string | number): string | null {
  if (!filePath) return null;
  if (/^https?:\/\//i.test(filePath) || filePath.startsWith('/api/')) return filePath;
  const qs = new URLSearchParams({ path: filePath });
  if (cacheBust !== undefined) qs.set('v', String(cacheBust));
  return `/api/artwork/file?${qs.toString()}`;
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let idx = 0;
  let val = bytes;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx++;
  }
  return `${val.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (!res.ok) {
    const errObj = json as { error?: string };
    throw new Error(errObj.error || `Request failed (${res.status})`);
  }
  return json as T;
}

export const api = {
  // Dashboard & Audit
  getDashboard: () => req<DashboardSummary>('/api/dashboard'),
  getAudit: () => req<LibraryAuditReport>('/api/audit'),

  // Movies
  listMovies: () => req<{ movies: MovieRecord[] }>('/api/movies'),
  getMovie: (id: number) => req<{ movie: MovieRecord }>(`/api/movies/${id}`),
  updateMovie: (id: number, patch: Partial<MovieRecord> & { writeNfo?: boolean; setName?: string | null }) =>
    req<{ movie: MovieRecord }>(`/api/movies/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  batchMovies: (action: 'markWatched' | 'markUnwatched' | 'writeNfo' | 'addTag' | 'assignSet', movieIds: number[], payload?: Record<string, unknown>) =>
    req<{ affected: number }>('/api/movies/batch', { method: 'POST', body: JSON.stringify({ action, movieIds, payload }) }),
  setMovieArtwork: (id: number, kind: ArtworkKind, url?: string) =>
    req<{ movie: MovieRecord }>(`/api/movies/${id}/artwork`, { method: 'POST', body: JSON.stringify({ kind, url }) }),

  // Movie Sets
  listSets: () => req<{ sets: MovieSetRecord[] }>('/api/sets'),
  createSet: (name: string, overview: string, movieIds: number[] = []) =>
    req<{ set: MovieSetRecord }>('/api/sets', { method: 'POST', body: JSON.stringify({ name, overview, movieIds }) }),
  updateSet: (id: number, patch: { name?: string; overview?: string }) =>
    req<{ set: MovieSetRecord }>(`/api/sets/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteSet: (id: number) => req<{ ok: boolean }>(`/api/sets/${id}`, { method: 'DELETE' }),

  // TV Shows & Episodes
  listShows: () => req<{ shows: TvShowRecord[] }>('/api/shows'),
  getShow: (id: number) => req<{ show: TvShowRecord; seasons: TvSeasonRecord[]; episodes: TvEpisodeRecord[] }>(`/api/shows/${id}`),
  updateShow: (id: number, patch: Partial<TvShowRecord> & { writeNfo?: boolean }) =>
    req<{ show: TvShowRecord }>(`/api/shows/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  updateEpisode: (id: number, patch: Partial<TvEpisodeRecord> & { writeNfo?: boolean }) =>
    req<{ episode: TvEpisodeRecord }>(`/api/episodes/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  batchEpisodes: (action: 'markWatched' | 'markUnwatched' | 'writeNfo', episodeIds: number[]) =>
    req<{ affected: number }>('/api/episodes/batch', { method: 'POST', body: JSON.stringify({ action, episodeIds }) }),

  // Scrapers
  getScraperConfig: () => req<{ providers: ScraperProviderConfig[]; fieldMapping: ScraperFieldMapping }>('/api/scrapers/config'),
  saveScraperConfig: (providers: ScraperProviderConfig[], fieldMapping: ScraperFieldMapping) =>
    req<{ providers: ScraperProviderConfig[]; fieldMapping: ScraperFieldMapping }>('/api/scrapers/config', {
      method: 'PUT',
      body: JSON.stringify({ providers, fieldMapping }),
    }),
  searchScrapers: (query: string, mediaKind: 'movie' | 'tvshow', year?: number | null, providerIds?: ScraperProviderId[]) =>
    req<{ results: ScraperSearchResult[] }>('/api/scrapers/search', {
      method: 'POST',
      body: JSON.stringify({ query, mediaKind, year, providerIds }),
    }),
  fetchScraperBundle: (externalId: string, provider: ScraperProviderId, mediaKind: 'movie' | 'tvshow') =>
    req<{ bundle: ScrapedMetadataBundle }>('/api/scrapers/bundle', {
      method: 'POST',
      body: JSON.stringify({ externalId, provider, mediaKind }),
    }),
  applyMovieBundle: (id: number, bundle: ScrapedMetadataBundle, selectedArtwork?: Partial<Record<ArtworkKind, string>>) =>
    req<{ movie: MovieRecord }>(`/api/scrapers/apply/movie/${id}`, {
      method: 'POST',
      body: JSON.stringify({ bundle, selectedArtwork }),
    }),
  applyShowBundle: (id: number, bundle: ScrapedMetadataBundle) =>
    req<{ show: TvShowRecord }>(`/api/scrapers/apply/show/${id}`, {
      method: 'POST',
      body: JSON.stringify({ bundle }),
    }),
  batchScrape: (params: { movieIds?: number[]; showIds?: number[]; onlyUnscraped?: boolean }) =>
    req<{ scrapedMovies: number; unmatchedMovies: number; scrapedShows: number; unmatchedShows: number }>('/api/scrapers/batch', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  // NFO
  listNfos: () =>
    req<{
      items: Array<{
        mediaType: 'movie' | 'tvshow' | 'episode';
        mediaId: number;
        title: string;
        nfoPath: string | null;
        hasNfo: boolean;
        nfoValid: boolean;
        warnings: string[];
      }>;
    }>('/api/nfo/list'),
  readNfo: (mediaType: 'movie' | 'tvshow' | 'episode', mediaId: number) =>
    req<{ nfoPath: string; existsOnDisk: boolean; xml: string; validation: NfoValidationReport }>(
      `/api/nfo/read?mediaType=${mediaType}&mediaId=${mediaId}`
    ),
  validateNfo: (xml: string) =>
    req<NfoValidationReport>('/api/nfo/validate', { method: 'POST', body: JSON.stringify({ xml }) }),
  saveNfo: (mediaType: 'movie' | 'tvshow' | 'episode', mediaId: number, xml: string) =>
    req<{ nfoPath: string; validation: NfoValidationReport }>('/api/nfo/save', {
      method: 'PUT',
      body: JSON.stringify({ mediaType, mediaId, xml }),
    }),
  regenerateNfos: (params: { scope?: 'all'; movieIds?: number[]; showIds?: number[]; episodeIds?: number[] }) =>
    req<{ written: number }>('/api/nfo/regenerate', { method: 'POST', body: JSON.stringify(params) }),

  // Subtitles
  listSubtitles: () => req<{ subtitles: Array<SubtitleFileRecord & { mediaTitle: string }> }>('/api/subtitles'),
  getSubtitleConfig: () =>
    req<{ openSubtitlesApiKey: string; openSubtitlesUsername: string; openSubtitlesPassword: string; subdlApiKey: string; useDemoFallback: boolean }>(
      '/api/subtitles/config'
    ),
  saveSubtitleConfig: (cfg: Record<string, unknown>) =>
    req('/api/subtitles/config', { method: 'PUT', body: JSON.stringify(cfg) }),
  searchSubtitles: (params: { mediaType: 'movie' | 'episode'; mediaId: number; languages: string[]; query?: string; forcedOnly?: boolean }) =>
    req<{ results: SubtitleSearchResult[] }>('/api/subtitles/search', { method: 'POST', body: JSON.stringify(params) }),
  downloadSubtitle: (mediaType: 'movie' | 'episode', mediaId: number, candidate: SubtitleSearchResult) =>
    req<{ subtitle: SubtitleFileRecord }>('/api/subtitles/download', {
      method: 'POST',
      body: JSON.stringify({ mediaType, mediaId, candidate }),
    }),
  batchMissingSubtitles: (params?: { languages?: string[]; movieIds?: number[]; episodeIds?: number[] }) =>
    req<{ downloaded: number }>('/api/subtitles/batch-missing', { method: 'POST', body: JSON.stringify(params ?? {}) }),
  previewSubtitle: (id: number) =>
    req<{ subtitle: SubtitleFileRecord; raw: string; cues: SubtitleCue[] }>(`/api/subtitles/${id}/preview`),
  transformSubtitle: (
    id: number,
    action: { shiftMs?: number; fromFps?: number; toFps?: number; stripHi?: boolean; forced?: boolean; sdh?: boolean; language?: string }
  ) => req<{ subtitle: SubtitleFileRecord }>(`/api/subtitles/${id}/transform`, { method: 'POST', body: JSON.stringify(action) }),
  deleteSubtitle: (id: number) => req<{ ok: boolean }>(`/api/subtitles/${id}`, { method: 'DELETE' }),

  // Renamer
  getRenamePatterns: () => req<RenamePatternsConfig>('/api/renamer/patterns'),
  saveRenamePatterns: (patterns: RenamePatternsConfig) =>
    req<RenamePatternsConfig>('/api/renamer/patterns', { method: 'PUT', body: JSON.stringify(patterns) }),
  previewRename: (params: { movieIds?: number[]; episodeIds?: number[]; patterns?: Partial<RenamePatternsConfig> }) =>
    req<{ items: RenamePreviewItem[] }>('/api/renamer/preview', { method: 'POST', body: JSON.stringify(params) }),
  executeRename: (items: RenamePreviewItem[], cleanupEmptyFolders = true) =>
    req<{ batchId: string; movedCount: number; skippedCount: number; errors: string[] }>('/api/renamer/execute', {
      method: 'POST',
      body: JSON.stringify({ items, cleanupEmptyFolders }),
    }),
  listRenameHistory: () => req<{ batches: RenameHistoryBatch[] }>('/api/renamer/history'),
  undoRenameBatch: (batchId: string) => req<{ revertedFiles: number; errors: string[] }>(`/api/renamer/undo/${batchId}`, { method: 'POST' }),

  // Sources, Settings & Kodi
  listSources: () => req<{ sources: MediaSource[] }>('/api/settings/sources'),
  addSource: (input: { name: string; path: string; mediaKind: 'movie' | 'tvshow'; nfoNaming?: 'movie.nfo' | 'filename.nfo'; artworkNaming?: 'folder' | 'filename' }) =>
    req<{ source: MediaSource }>('/api/settings/sources', { method: 'POST', body: JSON.stringify(input) }),
  deleteSource: (id: number) => req<{ ok: boolean }>(`/api/settings/sources/${id}`, { method: 'DELETE' }),
  scanSources: (sourceId?: number) =>
    req<{ moviesScanned: number; showsScanned: number; episodesScanned: number }>('/api/settings/sources/scan', {
      method: 'POST',
      body: JSON.stringify(sourceId ? { sourceId } : {}),
    }),
  browseFolder: (dirPath?: string) =>
    req<{ currentPath: string; parentPath: string | null; directories: Array<{ name: string; path: string }> }>(
      `/api/settings/fs/browse${dirPath ? `?path=${encodeURIComponent(dirPath)}` : ''}`
    ),
  getPreferences: () => req<AppPreferences>('/api/settings/preferences'),
  savePreferences: (prefs: AppPreferences) => req<AppPreferences>('/api/settings/preferences', { method: 'PUT', body: JSON.stringify(prefs) }),
  getKodiConfig: () => req<KodiRpcConfig>('/api/settings/kodi'),
  saveKodiConfig: (cfg: KodiRpcConfig) => req<KodiRpcConfig>('/api/settings/kodi', { method: 'PUT', body: JSON.stringify(cfg) }),
  testKodiRpc: () => req<{ ok: boolean; status: string }>('/api/settings/kodi/test', { method: 'POST' }),
  triggerKodiScan: () => req<{ ok: boolean; error?: string }>('/api/settings/kodi/scan', { method: 'POST' }),
  triggerKodiClean: () => req<{ ok: boolean; error?: string }>('/api/settings/kodi/clean', { method: 'POST' }),
  resetSampleLibrary: () => req<{ ok: boolean }>('/api/settings/sample/reset', { method: 'POST' }),
  generateSmartPlaylist: (opts: Record<string, unknown>) =>
    req<{ xml: string }>('/api/export/smartplaylist', { method: 'POST', body: JSON.stringify(opts) }),
  getSourcesXml: () => req<{ xml: string }>('/api/export/sources-xml'),
};

export type { ActivityLogEntry };
