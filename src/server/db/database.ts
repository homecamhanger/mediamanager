import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import type {
  ActivityLogEntry,
  AppPreferences,
  ArtworkKind,
  KodiRpcConfig,
  MediaSource,
  MovieRecord,
  MovieSetRecord,
  ParsedFilenameInfo,
  RenameHistoryBatch,
  RenamePatternsConfig,
  ScraperFieldMapping,
  ScraperProviderConfig,
  StreamDetails,
  SubtitleFileRecord,
  TvEpisodeRecord,
  TvSeasonRecord,
  TvShowRecord,
} from '../../shared/types.js';

export const DEFAULT_SCRAPER_PROVIDERS: ScraperProviderConfig[] = [
  {
    id: 'tmdb',
    name: 'TMDb (The Movie Database)',
    description: 'Primary source for movie & TV metadata, localized titles, plots, cast, collections, posters, and backdrops.',
    supports: ['movie', 'tvshow', 'artwork', 'ratings'],
    requiresKey: true,
    apiKey: '',
    enabled: true,
    priority: 1,
    language: 'en-US',
    useDemoFallback: true,
  },
  {
    id: 'omdb',
    name: 'OMDb / IMDb / Rotten Tomatoes / Metacritic',
    description: 'Fetches IMDb ratings & votes, Rotten Tomatoes Tomatometer %, Metacritic scores, MPAA certification, and awards.',
    supports: ['movie', 'tvshow', 'ratings'],
    requiresKey: true,
    apiKey: '',
    enabled: true,
    priority: 2,
    language: 'en-US',
    useDemoFallback: true,
  },
  {
    id: 'tvdb',
    name: 'TheTVDB (v4)',
    description: 'Authoritative TV series metadata, aired/DVD/absolute episode ordering, network details, and series banners.',
    supports: ['tvshow', 'movie', 'artwork', 'ratings'],
    requiresKey: true,
    apiKey: '',
    secondaryKey: '',
    enabled: true,
    priority: 3,
    language: 'eng',
    useDemoFallback: true,
  },
  {
    id: 'fanarttv',
    name: 'Fanart.tv',
    description: 'HD ClearLOGO, ClearART, DiscART, 16:9 Landscape thumbs, CharacterART, and Season banners for Kodi skins.',
    supports: ['artwork'],
    requiresKey: true,
    apiKey: '',
    enabled: true,
    priority: 4,
    language: 'en',
    useDemoFallback: true,
  },
  {
    id: 'tvmaze',
    name: 'TVmaze',
    description: 'Open no-key TV series database for episode air dates, show status, cast, and episode thumbnails.',
    supports: ['tvshow', 'ratings', 'artwork'],
    requiresKey: false,
    apiKey: '',
    enabled: true,
    priority: 5,
    language: 'en',
    useDemoFallback: true,
  },
  {
    id: 'trakt',
    name: 'Trakt.tv',
    description: 'Community ratings, vote counts, slugs, and cross-referenced IMDb/TMDb/TVDB identifiers.',
    supports: ['movie', 'tvshow', 'ratings'],
    requiresKey: true,
    apiKey: '',
    enabled: true,
    priority: 6,
    language: 'en',
    useDemoFallback: true,
  },
  {
    id: 'jikan',
    name: 'Jikan / MyAnimeList',
    description: 'Open anime scraper providing MAL scores, studio credits, Japanese/Romaji/English titles, and episode guides.',
    supports: ['anime', 'movie', 'tvshow', 'ratings'],
    requiresKey: false,
    apiKey: '',
    enabled: true,
    priority: 7,
    language: 'en',
    useDemoFallback: true,
  },
  {
    id: 'itunes',
    name: 'Apple iTunes Search',
    description: 'Open keyless movie & TV metadata source providing official synopses, MPAA ratings, runtimes, posters, trailers, and episodes.',
    supports: ['movie', 'tvshow', 'artwork'],
    requiresKey: false,
    apiKey: '',
    enabled: true,
    priority: 8,
    language: 'en-US',
    useDemoFallback: true,
  },
  {
    id: 'wikidata',
    name: 'Wikipedia / Wikidata',
    description: 'Open keyless encyclopedia & entity graph providing summaries, posters, and cross-referenced IMDb/TMDb/TVDB IDs.',
    supports: ['movie', 'tvshow', 'artwork'],
    requiresKey: false,
    apiKey: '',
    enabled: true,
    priority: 9,
    language: 'en',
    useDemoFallback: true,
  },
  {
    id: 'kodi-catalog',
    name: 'Built-in Kodi Catalog',
    description: 'Offline multi-source reference catalog with complete metadata, multi-provider ratings, and generated Kodi artwork.',
    supports: ['movie', 'tvshow', 'artwork', 'ratings', 'anime'],
    requiresKey: false,
    apiKey: '',
    enabled: true,
    priority: 10,
    language: 'en-US',
    useDemoFallback: true,
  },
];

export const DEFAULT_FIELD_MAPPING: ScraperFieldMapping = {
  title: ['tmdb', 'tvdb', 'tvmaze', 'jikan', 'itunes', 'wikidata', 'kodi-catalog'],
  plot: ['tmdb', 'tvdb', 'omdb', 'tvmaze', 'itunes', 'wikidata', 'jikan', 'kodi-catalog'],
  ratings: ['omdb', 'tmdb', 'trakt', 'tvdb', 'tvmaze', 'jikan', 'kodi-catalog'],
  cast: ['tmdb', 'tvdb', 'tvmaze', 'itunes', 'kodi-catalog'],
  genres: ['tmdb', 'omdb', 'tvdb', 'itunes', 'jikan', 'kodi-catalog'],
  certification: ['omdb', 'tmdb', 'tvdb', 'itunes', 'jikan', 'kodi-catalog'],
  artwork: ['fanarttv', 'tmdb', 'tvdb', 'itunes', 'tvmaze', 'wikidata', 'jikan', 'kodi-catalog'],
  episodeGuide: ['tvdb', 'tmdb', 'tvmaze', 'itunes', 'jikan', 'kodi-catalog'],
};

export const DEFAULT_RENAME_PATTERNS: RenamePatternsConfig = {
  movieFolderPattern: '{title} ({year}){ [imdbid-{imdb_id}]}',
  movieFilePattern: '{title} ({year}){ - {edition}}{ [{resolution} {video_codec} {audio_codec}]}',
  tvShowFolderPattern: '{show_title} ({year}){ [tvdbid-{tvdb_id}]}',
  seasonFolderPattern: 'Season {season:02d}',
  specialsFolderName: 'Specials',
  episodeFilePattern: '{show_title} - S{season:02d}E{episode:02d}{ - {episode_title}}{ [{resolution} {video_codec}]}',
  colonReplacement: 'dash',
  spaceReplacement: 'space',
  cleanupEmptyFolders: true,
  renameSidecarFiles: true,
};

export const DEFAULT_KODI_RPC: KodiRpcConfig = {
  enabled: false,
  host: '192.168.1.50',
  port: 8080,
  username: 'kodi',
  password: '',
  lastConnectedAt: null,
  lastStatus: null,
};

export const DEFAULT_PREFERENCES: AppPreferences = {
  preferredLanguages: ['en', 'en-US'],
  preferredSubtitleLanguages: ['en'],
  scraperLanguage: 'en-US',
  defaultNfoNaming: 'movie.nfo',
  defaultArtworkNaming: 'folder',
  downloadArtworkKinds: ['poster', 'fanart', 'clearlogo', 'banner', 'disc', 'landscape'],
  writeActorThumbs: false,
  autoWriteNfoOnScrape: true,
  autoDownloadSubtitlesOnScrape: false,
};

export interface SubtitleConfig {
  openSubtitlesApiKey: string;
  openSubtitlesUsername: string;
  openSubtitlesPassword: string;
  subdlApiKey: string;
  useDemoFallback: boolean;
}

export const DEFAULT_SUBTITLE_CONFIG: SubtitleConfig = {
  openSubtitlesApiKey: '',
  openSubtitlesUsername: '',
  openSubtitlesPassword: '',
  subdlApiKey: '',
  useDemoFallback: true,
};

export class MediaDatabase {
  public db: DatabaseSync;
  public dbPath: string;

  constructor(dbPath?: string) {
    const resolved = dbPath ?? process.env.DB_PATH ?? path.resolve(process.cwd(), 'data', 'mediamanager.db');
    this.dbPath = resolved;
    if (resolved !== ':memory:') {
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
    }
    this.db = new DatabaseSync(resolved);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.migrate();
    this.ensureDefaultSettings();
  }

  close() {
    this.db.close();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS media_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        media_kind TEXT NOT NULL CHECK(media_kind IN ('movie', 'tvshow')),
        nfo_naming TEXT NOT NULL DEFAULT 'movie.nfo',
        artwork_naming TEXT NOT NULL DEFAULT 'folder',
        auto_scan INTEGER NOT NULL DEFAULT 1,
        last_scanned_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS movie_sets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        overview TEXT NOT NULL DEFAULT '',
        poster_path TEXT,
        fanart_path TEXT,
        clearlogo_path TEXT,
        tmdb_collection_id TEXT
      );

      CREATE TABLE IF NOT EXISTS movies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id INTEGER NOT NULL REFERENCES media_sources(id) ON DELETE CASCADE,
        folder_path TEXT NOT NULL,
        file_path TEXT NOT NULL UNIQUE,
        file_name TEXT NOT NULL,
        file_size_bytes INTEGER NOT NULL DEFAULT 0,
        movie_hash TEXT,
        nfo_path TEXT,
        has_nfo INTEGER NOT NULL DEFAULT 0,
        nfo_valid INTEGER NOT NULL DEFAULT 0,
        nfo_warnings_json TEXT NOT NULL DEFAULT '[]',
        scraped INTEGER NOT NULL DEFAULT 0,
        scraped_source TEXT,

        title TEXT NOT NULL,
        original_title TEXT NOT NULL DEFAULT '',
        sort_title TEXT NOT NULL DEFAULT '',
        year INTEGER,
        premiered TEXT,
        tagline TEXT NOT NULL DEFAULT '',
        plot TEXT NOT NULL DEFAULT '',
        outline TEXT NOT NULL DEFAULT '',
        runtime_minutes INTEGER,
        mpaa TEXT NOT NULL DEFAULT '',
        country TEXT NOT NULL DEFAULT '',
        studios_json TEXT NOT NULL DEFAULT '[]',
        genres_json TEXT NOT NULL DEFAULT '[]',
        tags_json TEXT NOT NULL DEFAULT '[]',
        directors_json TEXT NOT NULL DEFAULT '[]',
        writers_json TEXT NOT NULL DEFAULT '[]',
        actors_json TEXT NOT NULL DEFAULT '[]',
        trailer_url TEXT NOT NULL DEFAULT '',

        set_id INTEGER REFERENCES movie_sets(id) ON DELETE SET NULL,
        unique_ids_json TEXT NOT NULL DEFAULT '{}',
        ratings_json TEXT NOT NULL DEFAULT '[]',
        user_rating REAL,
        play_count INTEGER NOT NULL DEFAULT 0,
        watched INTEGER NOT NULL DEFAULT 0,
        last_played TEXT,
        date_added TEXT NOT NULL,

        artwork_json TEXT NOT NULL DEFAULT '{}',
        artwork_candidates_json TEXT NOT NULL DEFAULT '{}',
        stream_details_json TEXT NOT NULL DEFAULT '{"video":[],"audio":[],"subtitle":[]}',
        parsed_info_json TEXT NOT NULL DEFAULT '{}',
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tv_shows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id INTEGER NOT NULL REFERENCES media_sources(id) ON DELETE CASCADE,
        folder_path TEXT NOT NULL UNIQUE,
        nfo_path TEXT,
        has_nfo INTEGER NOT NULL DEFAULT 0,
        nfo_valid INTEGER NOT NULL DEFAULT 0,
        nfo_warnings_json TEXT NOT NULL DEFAULT '[]',
        scraped INTEGER NOT NULL DEFAULT 0,
        scraped_source TEXT,

        title TEXT NOT NULL,
        original_title TEXT NOT NULL DEFAULT '',
        sort_title TEXT NOT NULL DEFAULT '',
        year INTEGER,
        premiered TEXT,
        status TEXT NOT NULL DEFAULT 'Ended',
        plot TEXT NOT NULL DEFAULT '',
        mpaa TEXT NOT NULL DEFAULT '',
        studio TEXT NOT NULL DEFAULT '',
        genres_json TEXT NOT NULL DEFAULT '[]',
        tags_json TEXT NOT NULL DEFAULT '[]',
        actors_json TEXT NOT NULL DEFAULT '[]',
        episode_order TEXT NOT NULL DEFAULT 'aired',

        unique_ids_json TEXT NOT NULL DEFAULT '{}',
        ratings_json TEXT NOT NULL DEFAULT '[]',
        user_rating REAL,
        date_added TEXT NOT NULL,
        artwork_json TEXT NOT NULL DEFAULT '{}',
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tv_seasons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        show_id INTEGER NOT NULL REFERENCES tv_shows(id) ON DELETE CASCADE,
        season_number INTEGER NOT NULL,
        name TEXT NOT NULL,
        overview TEXT NOT NULL DEFAULT '',
        folder_path TEXT,
        nfo_path TEXT,
        has_nfo INTEGER NOT NULL DEFAULT 0,
        poster_path TEXT,
        banner_path TEXT,
        UNIQUE(show_id, season_number)
      );

      CREATE TABLE IF NOT EXISTS tv_episodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        show_id INTEGER NOT NULL REFERENCES tv_shows(id) ON DELETE CASCADE,
        season_number INTEGER NOT NULL,
        episode_number INTEGER NOT NULL,
        display_season INTEGER,
        display_episode INTEGER,
        multi_episode_end INTEGER,
        folder_path TEXT NOT NULL,
        file_path TEXT NOT NULL UNIQUE,
        file_name TEXT NOT NULL,
        file_size_bytes INTEGER NOT NULL DEFAULT 0,
        movie_hash TEXT,
        nfo_path TEXT,
        has_nfo INTEGER NOT NULL DEFAULT 0,
        nfo_valid INTEGER NOT NULL DEFAULT 0,
        nfo_warnings_json TEXT NOT NULL DEFAULT '[]',
        scraped INTEGER NOT NULL DEFAULT 0,

        title TEXT NOT NULL,
        show_title TEXT NOT NULL DEFAULT '',
        aired TEXT,
        plot TEXT NOT NULL DEFAULT '',
        runtime_minutes INTEGER,
        directors_json TEXT NOT NULL DEFAULT '[]',
        writers_json TEXT NOT NULL DEFAULT '[]',
        actors_json TEXT NOT NULL DEFAULT '[]',
        unique_ids_json TEXT NOT NULL DEFAULT '{}',
        ratings_json TEXT NOT NULL DEFAULT '[]',
        user_rating REAL,
        play_count INTEGER NOT NULL DEFAULT 0,
        watched INTEGER NOT NULL DEFAULT 0,
        last_played TEXT,

        thumb_path TEXT,
        stream_details_json TEXT NOT NULL DEFAULT '{"video":[],"audio":[],"subtitle":[]}',
        parsed_info_json TEXT NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS subtitles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        media_type TEXT NOT NULL CHECK(media_type IN ('movie', 'episode')),
        media_id INTEGER NOT NULL,
        file_path TEXT NOT NULL UNIQUE,
        file_name TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'und',
        format TEXT NOT NULL DEFAULT 'srt',
        forced INTEGER NOT NULL DEFAULT 0,
        sdh INTEGER NOT NULL DEFAULT 0,
        size_bytes INTEGER NOT NULL DEFAULT 0,
        cue_count INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS rename_history (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        media_type TEXT NOT NULL,
        item_count INTEGER NOT NULL,
        reverted INTEGER NOT NULL DEFAULT 0,
        moves_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        category TEXT NOT NULL,
        status TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }

  private ensureDefaultSettings() {
    const defaults: Record<string, unknown> = {
      scraper_providers: DEFAULT_SCRAPER_PROVIDERS,
      scraper_field_mapping: DEFAULT_FIELD_MAPPING,
      rename_patterns: DEFAULT_RENAME_PATTERNS,
      kodi_rpc: DEFAULT_KODI_RPC,
      preferences: DEFAULT_PREFERENCES,
      subtitle_config: DEFAULT_SUBTITLE_CONFIG,
    };
    for (const [key, value] of Object.entries(defaults)) {
      const existing = this.db.prepare('SELECT key, value_json FROM app_settings WHERE key = ?').get(key) as
        | { key: string; value_json: string }
        | undefined;
      if (!existing) {
        this.db.prepare('INSERT INTO app_settings (key, value_json) VALUES (?, ?)').run(key, JSON.stringify(value));
      } else if (key === 'scraper_providers') {
        try {
          const saved = JSON.parse(existing.value_json) as ScraperProviderConfig[];
          const savedIds = new Set(saved.map((p) => p.id));
          const missing = DEFAULT_SCRAPER_PROVIDERS.filter((p) => !savedIds.has(p.id));
          if (missing.length > 0) {
            this.db
              .prepare('UPDATE app_settings SET value_json = ? WHERE key = ?')
              .run(JSON.stringify([...saved, ...missing]), key);
          }
        } catch {
          // ignore malformed stored JSON
        }
      } else if (key === 'scraper_field_mapping') {
        try {
          const saved = JSON.parse(existing.value_json) as ScraperFieldMapping;
          let changed = false;
          for (const field of Object.keys(DEFAULT_FIELD_MAPPING) as Array<keyof ScraperFieldMapping>) {
            const list = saved[field] ?? [];
            for (const pid of DEFAULT_FIELD_MAPPING[field]) {
              if (!list.includes(pid)) {
                const catIdx = list.indexOf('kodi-catalog');
                if (catIdx >= 0) list.splice(catIdx, 0, pid);
                else list.push(pid);
                changed = true;
              }
            }
            saved[field] = list;
          }
          if (changed) {
            this.db.prepare('UPDATE app_settings SET value_json = ? WHERE key = ?').run(JSON.stringify(saved), key);
          }
        } catch {
          // ignore malformed stored JSON
        }
      }
    }
  }

  getSetting<T>(key: string, fallback: T): T {
    const row = this.db.prepare('SELECT value_json FROM app_settings WHERE key = ?').get(key) as { value_json: string } | undefined;
    if (!row) return fallback;
    try {
      return JSON.parse(row.value_json) as T;
    } catch {
      return fallback;
    }
  }

  setSetting<T>(key: string, value: T): void {
    this.db
      .prepare('INSERT INTO app_settings (key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json')
      .run(key, JSON.stringify(value));
  }

  logActivity(
    category: ActivityLogEntry['category'],
    action: string,
    message: string,
    status: ActivityLogEntry['status'] = 'info'
  ) {
    this.db
      .prepare('INSERT INTO activity_log (action, category, status, message, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(action, category, status, message, new Date().toISOString());
  }

  getRecentActivity(limit = 30): ActivityLogEntry[] {
    const rows = this.db
      .prepare('SELECT id, action, category, status, message, created_at FROM activity_log ORDER BY id DESC LIMIT ?')
      .all(limit) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: Number(r.id),
      action: String(r.action),
      category: r.category as ActivityLogEntry['category'],
      status: r.status as ActivityLogEntry['status'],
      message: String(r.message),
      createdAt: String(r.created_at),
    }));
  }

  // ---- Media Sources ----
  listSources(): MediaSource[] {
    const rows = this.db.prepare('SELECT * FROM media_sources ORDER BY id ASC').all() as Array<Record<string, unknown>>;
    return rows.map(this.mapSourceRow);
  }

  getSource(id: number): MediaSource | null {
    const row = this.db.prepare('SELECT * FROM media_sources WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.mapSourceRow(row) : null;
  }

  addSource(input: {
    name: string;
    path: string;
    mediaKind: 'movie' | 'tvshow';
    nfoNaming?: 'movie.nfo' | 'filename.nfo';
    artworkNaming?: 'folder' | 'filename';
  }): MediaSource {
    const now = new Date().toISOString();
    const res = this.db
      .prepare(
        `INSERT INTO media_sources (name, path, media_kind, nfo_naming, artwork_naming, auto_scan, created_at)
         VALUES (?, ?, ?, ?, ?, 1, ?)`
      )
      .run(
        input.name,
        input.path,
        input.mediaKind,
        input.nfoNaming ?? 'movie.nfo',
        input.artworkNaming ?? 'folder',
        now
      );
    return this.getSource(Number(res.lastInsertRowid))!;
  }

  deleteSource(id: number) {
    this.db.prepare('DELETE FROM media_sources WHERE id = ?').run(id);
  }

  updateSourceScanned(id: number) {
    this.db.prepare('UPDATE media_sources SET last_scanned_at = ? WHERE id = ?').run(new Date().toISOString(), id);
  }

  private mapSourceRow(row: Record<string, unknown>): MediaSource {
    return {
      id: Number(row.id),
      name: String(row.name),
      path: String(row.path),
      mediaKind: row.media_kind as 'movie' | 'tvshow',
      nfoNaming: (row.nfo_naming as 'movie.nfo' | 'filename.nfo') || 'movie.nfo',
      artworkNaming: (row.artwork_naming as 'folder' | 'filename') || 'folder',
      autoScan: Boolean(row.auto_scan),
      lastScannedAt: row.last_scanned_at ? String(row.last_scanned_at) : null,
      createdAt: String(row.created_at),
    };
  }

  // ---- Movie Sets ----
  upsertMovieSet(name: string, overview = '', tmdbCollectionId?: string | null): number {
    const clean = name.trim();
    const existing = this.db.prepare('SELECT id, overview, tmdb_collection_id FROM movie_sets WHERE name = ?').get(clean) as
      | { id: number; overview: string; tmdb_collection_id: string | null }
      | undefined;
    if (existing) {
      if ((overview && !existing.overview) || (tmdbCollectionId && !existing.tmdb_collection_id)) {
        this.db
          .prepare('UPDATE movie_sets SET overview = COALESCE(NULLIF(?, \'\'), overview), tmdb_collection_id = COALESCE(?, tmdb_collection_id) WHERE id = ?')
          .run(overview, tmdbCollectionId ?? null, existing.id);
      }
      return existing.id;
    }
    const res = this.db
      .prepare('INSERT INTO movie_sets (name, overview, tmdb_collection_id) VALUES (?, ?, ?)')
      .run(clean, overview, tmdbCollectionId ?? null);
    return Number(res.lastInsertRowid);
  }

  listMovieSets(): MovieSetRecord[] {
    const sets = this.db.prepare('SELECT * FROM movie_sets ORDER BY name ASC').all() as Array<Record<string, unknown>>;
    const allMovies = this.listMovies();
    return sets.map((s) => {
      const id = Number(s.id);
      return {
        id,
        name: String(s.name),
        overview: String(s.overview ?? ''),
        posterPath: s.poster_path ? String(s.poster_path) : null,
        fanartPath: s.fanart_path ? String(s.fanart_path) : null,
        clearlogoPath: s.clearlogo_path ? String(s.clearlogo_path) : null,
        tmdbCollectionId: s.tmdb_collection_id ? String(s.tmdb_collection_id) : null,
        movies: allMovies.filter((m) => m.setId === id),
      };
    });
  }

  updateMovieSet(id: number, patch: { name?: string; overview?: string; posterPath?: string | null; fanartPath?: string | null; clearlogoPath?: string | null }) {
    const current = this.db.prepare('SELECT * FROM movie_sets WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!current) return null;
    this.db
      .prepare(
        `UPDATE movie_sets SET name = ?, overview = ?, poster_path = ?, fanart_path = ?, clearlogo_path = ? WHERE id = ?`
      )
      .run(
        patch.name ?? String(current.name ?? ''),
        patch.overview ?? String(current.overview ?? ''),
        patch.posterPath !== undefined ? patch.posterPath : (current.poster_path ? String(current.poster_path) : null),
        patch.fanartPath !== undefined ? patch.fanartPath : (current.fanart_path ? String(current.fanart_path) : null),
        patch.clearlogoPath !== undefined ? patch.clearlogoPath : (current.clearlogo_path ? String(current.clearlogo_path) : null),
        id
      );
    return this.listMovieSets().find((s) => s.id === id) ?? null;
  }

  deleteMovieSet(id: number) {
    this.db.prepare('UPDATE movies SET set_id = NULL WHERE set_id = ?').run(id);
    this.db.prepare('DELETE FROM movie_sets WHERE id = ?').run(id);
  }

  // ---- Subtitles ----
  replaceSubtitlesForMedia(mediaType: 'movie' | 'episode', mediaId: number, subs: Array<Omit<SubtitleFileRecord, 'id'>>) {
    this.db.prepare('DELETE FROM subtitles WHERE media_type = ? AND media_id = ?').run(mediaType, mediaId);
    const stmt = this.db.prepare(
      `INSERT INTO subtitles (media_type, media_id, file_path, file_name, language, format, forced, sdh, size_bytes, cue_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(file_path) DO UPDATE SET
         language = excluded.language, format = excluded.format, forced = excluded.forced, sdh = excluded.sdh,
         size_bytes = excluded.size_bytes, cue_count = excluded.cue_count`
    );
    for (const s of subs) {
      stmt.run(
        mediaType,
        mediaId,
        s.filePath,
        s.fileName,
        s.language,
        s.format,
        s.forced ? 1 : 0,
        s.sdh ? 1 : 0,
        s.sizeBytes,
        s.cueCount ?? 0
      );
    }
  }

  addSubtitle(sub: Omit<SubtitleFileRecord, 'id'>): SubtitleFileRecord {
    this.db
      .prepare(
        `INSERT INTO subtitles (media_type, media_id, file_path, file_name, language, format, forced, sdh, size_bytes, cue_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(file_path) DO UPDATE SET
           media_type = excluded.media_type, media_id = excluded.media_id, file_name = excluded.file_name,
           language = excluded.language, format = excluded.format, forced = excluded.forced, sdh = excluded.sdh,
           size_bytes = excluded.size_bytes, cue_count = excluded.cue_count`
      )
      .run(
        sub.mediaType,
        sub.mediaId,
        sub.filePath,
        sub.fileName,
        sub.language,
        sub.format,
        sub.forced ? 1 : 0,
        sub.sdh ? 1 : 0,
        sub.sizeBytes,
        sub.cueCount ?? 0
      );
    const row = this.db.prepare('SELECT * FROM subtitles WHERE file_path = ?').get(sub.filePath) as Record<string, unknown>;
    return this.mapSubtitleRow(row);
  }

  getSubtitle(id: number): SubtitleFileRecord | null {
    const row = this.db.prepare('SELECT * FROM subtitles WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.mapSubtitleRow(row) : null;
  }

  listAllSubtitles(): SubtitleFileRecord[] {
    const rows = this.db.prepare('SELECT * FROM subtitles ORDER BY id DESC').all() as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapSubtitleRow(r));
  }

  listSubtitlesFor(mediaType: 'movie' | 'episode', mediaId: number): SubtitleFileRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM subtitles WHERE media_type = ? AND media_id = ? ORDER BY language ASC, file_name ASC')
      .all(mediaType, mediaId) as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapSubtitleRow(r));
  }

  deleteSubtitle(id: number) {
    this.db.prepare('DELETE FROM subtitles WHERE id = ?').run(id);
  }

  private mapSubtitleRow(row: Record<string, unknown>): SubtitleFileRecord {
    return {
      id: Number(row.id),
      mediaType: row.media_type as 'movie' | 'episode',
      mediaId: Number(row.media_id),
      filePath: String(row.file_path),
      fileName: String(row.file_name),
      language: String(row.language),
      format: row.format as SubtitleFileRecord['format'],
      forced: Boolean(row.forced),
      sdh: Boolean(row.sdh),
      sizeBytes: Number(row.size_bytes ?? 0),
      cueCount: row.cue_count != null ? Number(row.cue_count) : undefined,
    };
  }

  // ---- Movies ----
  listMovies(): MovieRecord[] {
    const rows = this.db
      .prepare(
        `SELECT m.*, ms.name AS set_name, ms.overview AS set_overview
         FROM movies m
         LEFT JOIN movie_sets ms ON ms.id = m.set_id
         ORDER BY COALESCE(NULLIF(m.sort_title, ''), m.title) ASC`
      )
      .all() as Array<Record<string, unknown>>;
    const allSubs = this.listAllSubtitles().filter((s) => s.mediaType === 'movie');
    const subsByMovie = new Map<number, SubtitleFileRecord[]>();
    for (const s of allSubs) {
      const list = subsByMovie.get(s.mediaId) ?? [];
      list.push(s);
      subsByMovie.set(s.mediaId, list);
    }
    return rows.map((row) => this.mapMovieRow(row, subsByMovie.get(Number(row.id)) ?? []));
  }

  getMovie(id: number): MovieRecord | null {
    const row = this.db
      .prepare(
        `SELECT m.*, ms.name AS set_name, ms.overview AS set_overview
         FROM movies m
         LEFT JOIN movie_sets ms ON ms.id = m.set_id
         WHERE m.id = ?`
      )
      .get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    const subs = this.listSubtitlesFor('movie', id);
    return this.mapMovieRow(row, subs);
  }

  getMovieByPath(filePath: string): MovieRecord | null {
    const row = this.db
      .prepare(
        `SELECT m.*, ms.name AS set_name, ms.overview AS set_overview
         FROM movies m
         LEFT JOIN movie_sets ms ON ms.id = m.set_id
         WHERE m.file_path = ?`
      )
      .get(filePath) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.mapMovieRow(row, this.listSubtitlesFor('movie', Number(row.id)));
  }

  upsertMovie(movie: Omit<MovieRecord, 'id' | 'subtitles' | 'setName' | 'setOverview'>): MovieRecord {
    const existing = this.db.prepare('SELECT id FROM movies WHERE file_path = ?').get(movie.filePath) as { id: number } | undefined;
    const now = new Date().toISOString();
    if (existing) {
      this.db
        .prepare(
          `UPDATE movies SET
            source_id = ?, folder_path = ?, file_name = ?, file_size_bytes = ?, movie_hash = ?,
            nfo_path = ?, has_nfo = ?, nfo_valid = ?, nfo_warnings_json = ?, scraped = ?, scraped_source = ?,
            title = ?, original_title = ?, sort_title = ?, year = ?, premiered = ?, tagline = ?, plot = ?, outline = ?,
            runtime_minutes = ?, mpaa = ?, country = ?, studios_json = ?, genres_json = ?, tags_json = ?,
            directors_json = ?, writers_json = ?, actors_json = ?, trailer_url = ?, set_id = ?,
            unique_ids_json = ?, ratings_json = ?, user_rating = ?, play_count = ?, watched = ?, last_played = ?,
            artwork_json = ?, artwork_candidates_json = ?, stream_details_json = ?, parsed_info_json = ?, updated_at = ?
          WHERE id = ?`
        )
        .run(
          movie.sourceId,
          movie.folderPath,
          movie.fileName,
          movie.fileSizeBytes,
          movie.movieHash,
          movie.nfoPath,
          movie.hasNfo ? 1 : 0,
          movie.nfoValid ? 1 : 0,
          JSON.stringify(movie.nfoWarnings),
          movie.scraped ? 1 : 0,
          movie.scrapedSource,
          movie.title,
          movie.originalTitle,
          movie.sortTitle,
          movie.year,
          movie.premiered,
          movie.tagline,
          movie.plot,
          movie.outline,
          movie.runtimeMinutes,
          movie.mpaa,
          movie.country,
          JSON.stringify(movie.studios),
          JSON.stringify(movie.genres),
          JSON.stringify(movie.tags),
          JSON.stringify(movie.directors),
          JSON.stringify(movie.writers),
          JSON.stringify(movie.actors),
          movie.trailerUrl,
          movie.setId,
          JSON.stringify(movie.uniqueIds),
          JSON.stringify(movie.ratings),
          movie.userRating,
          movie.playCount,
          movie.watched ? 1 : 0,
          movie.lastPlayed,
          JSON.stringify(movie.artwork),
          JSON.stringify(movie.artworkCandidates ?? {}),
          JSON.stringify(movie.streamDetails),
          JSON.stringify(movie.parsedInfo),
          now,
          existing.id
        );
      return this.getMovie(existing.id)!;
    }

    const res = this.db
      .prepare(
        `INSERT INTO movies (
          source_id, folder_path, file_path, file_name, file_size_bytes, movie_hash,
          nfo_path, has_nfo, nfo_valid, nfo_warnings_json, scraped, scraped_source,
          title, original_title, sort_title, year, premiered, tagline, plot, outline,
          runtime_minutes, mpaa, country, studios_json, genres_json, tags_json,
          directors_json, writers_json, actors_json, trailer_url, set_id,
          unique_ids_json, ratings_json, user_rating, play_count, watched, last_played, date_added,
          artwork_json, artwork_candidates_json, stream_details_json, parsed_info_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        movie.sourceId,
        movie.folderPath,
        movie.filePath,
        movie.fileName,
        movie.fileSizeBytes,
        movie.movieHash,
        movie.nfoPath,
        movie.hasNfo ? 1 : 0,
        movie.nfoValid ? 1 : 0,
        JSON.stringify(movie.nfoWarnings),
        movie.scraped ? 1 : 0,
        movie.scrapedSource,
        movie.title,
        movie.originalTitle,
        movie.sortTitle,
        movie.year,
        movie.premiered,
        movie.tagline,
        movie.plot,
        movie.outline,
        movie.runtimeMinutes,
        movie.mpaa,
        movie.country,
        JSON.stringify(movie.studios),
        JSON.stringify(movie.genres),
        JSON.stringify(movie.tags),
        JSON.stringify(movie.directors),
        JSON.stringify(movie.writers),
        JSON.stringify(movie.actors),
        movie.trailerUrl,
        movie.setId,
        JSON.stringify(movie.uniqueIds),
        JSON.stringify(movie.ratings),
        movie.userRating,
        movie.playCount,
        movie.watched ? 1 : 0,
        movie.lastPlayed,
        movie.dateAdded || now,
        JSON.stringify(movie.artwork),
        JSON.stringify(movie.artworkCandidates ?? {}),
        JSON.stringify(movie.streamDetails),
        JSON.stringify(movie.parsedInfo),
        now
      );
    return this.getMovie(Number(res.lastInsertRowid))!;
  }

  updateMovie(id: number, patch: Partial<MovieRecord> & { setName?: string | null; setOverview?: string | null }): MovieRecord | null {
    const cur = this.getMovie(id);
    if (!cur) return null;

    let setId = patch.setId !== undefined ? patch.setId : cur.setId;
    if (patch.setName !== undefined) {
      setId = patch.setName ? this.upsertMovieSet(patch.setName, patch.setOverview ?? '') : null;
    }

    const merged: MovieRecord = {
      ...cur,
      ...patch,
      setId,
      studios: patch.studios ?? cur.studios,
      genres: patch.genres ?? cur.genres,
      tags: patch.tags ?? cur.tags,
      directors: patch.directors ?? cur.directors,
      writers: patch.writers ?? cur.writers,
      actors: patch.actors ?? cur.actors,
      uniqueIds: patch.uniqueIds ?? cur.uniqueIds,
      ratings: patch.ratings ?? cur.ratings,
      artwork: patch.artwork ?? cur.artwork,
      artworkCandidates: patch.artworkCandidates ?? cur.artworkCandidates,
      streamDetails: patch.streamDetails ?? cur.streamDetails,
      nfoWarnings: patch.nfoWarnings ?? cur.nfoWarnings,
      parsedInfo: patch.parsedInfo ?? cur.parsedInfo,
    };

    this.db
      .prepare(
        `UPDATE movies SET
          folder_path = ?, file_path = ?, file_name = ?, file_size_bytes = ?, movie_hash = ?,
          nfo_path = ?, has_nfo = ?, nfo_valid = ?, nfo_warnings_json = ?, scraped = ?, scraped_source = ?,
          title = ?, original_title = ?, sort_title = ?, year = ?, premiered = ?, tagline = ?, plot = ?, outline = ?,
          runtime_minutes = ?, mpaa = ?, country = ?, studios_json = ?, genres_json = ?, tags_json = ?,
          directors_json = ?, writers_json = ?, actors_json = ?, trailer_url = ?, set_id = ?,
          unique_ids_json = ?, ratings_json = ?, user_rating = ?, play_count = ?, watched = ?, last_played = ?,
          artwork_json = ?, artwork_candidates_json = ?, stream_details_json = ?, parsed_info_json = ?, updated_at = ?
        WHERE id = ?`
      )
      .run(
        merged.folderPath,
        merged.filePath,
        merged.fileName,
        merged.fileSizeBytes,
        merged.movieHash,
        merged.nfoPath,
        merged.hasNfo ? 1 : 0,
        merged.nfoValid ? 1 : 0,
        JSON.stringify(merged.nfoWarnings),
        merged.scraped ? 1 : 0,
        merged.scrapedSource,
        merged.title,
        merged.originalTitle,
        merged.sortTitle,
        merged.year,
        merged.premiered,
        merged.tagline,
        merged.plot,
        merged.outline,
        merged.runtimeMinutes,
        merged.mpaa,
        merged.country,
        JSON.stringify(merged.studios),
        JSON.stringify(merged.genres),
        JSON.stringify(merged.tags),
        JSON.stringify(merged.directors),
        JSON.stringify(merged.writers),
        JSON.stringify(merged.actors),
        merged.trailerUrl,
        merged.setId,
        JSON.stringify(merged.uniqueIds),
        JSON.stringify(merged.ratings),
        merged.userRating,
        merged.playCount,
        merged.watched ? 1 : 0,
        merged.lastPlayed,
        JSON.stringify(merged.artwork),
        JSON.stringify(merged.artworkCandidates ?? {}),
        JSON.stringify(merged.streamDetails),
        JSON.stringify(merged.parsedInfo),
        new Date().toISOString(),
        id
      );

    return this.getMovie(id);
  }

  deleteMovie(id: number) {
    this.db.prepare("DELETE FROM subtitles WHERE media_type = 'movie' AND media_id = ?").run(id);
    this.db.prepare('DELETE FROM movies WHERE id = ?').run(id);
  }

  private mapMovieRow(row: Record<string, unknown>, subs: SubtitleFileRecord[]): MovieRecord {
    const emptyArtwork: Record<ArtworkKind, string | null> = {
      poster: null,
      fanart: null,
      banner: null,
      clearlogo: null,
      clearart: null,
      disc: null,
      landscape: null,
      thumb: null,
    };
    return {
      id: Number(row.id),
      sourceId: Number(row.source_id),
      folderPath: String(row.folder_path),
      filePath: String(row.file_path),
      fileName: String(row.file_name),
      fileSizeBytes: Number(row.file_size_bytes ?? 0),
      movieHash: row.movie_hash ? String(row.movie_hash) : null,
      nfoPath: row.nfo_path ? String(row.nfo_path) : null,
      hasNfo: Boolean(row.has_nfo),
      nfoValid: Boolean(row.nfo_valid),
      nfoWarnings: safeJson(row.nfo_warnings_json, []),
      scraped: Boolean(row.scraped),
      scrapedSource: row.scraped_source ? String(row.scraped_source) : null,

      title: String(row.title),
      originalTitle: String(row.original_title ?? ''),
      sortTitle: String(row.sort_title ?? ''),
      year: row.year != null ? Number(row.year) : null,
      premiered: row.premiered ? String(row.premiered) : null,
      tagline: String(row.tagline ?? ''),
      plot: String(row.plot ?? ''),
      outline: String(row.outline ?? ''),
      runtimeMinutes: row.runtime_minutes != null ? Number(row.runtime_minutes) : null,
      mpaa: String(row.mpaa ?? ''),
      country: String(row.country ?? ''),
      studios: safeJson(row.studios_json, []),
      genres: safeJson(row.genres_json, []),
      tags: safeJson(row.tags_json, []),
      directors: safeJson(row.directors_json, []),
      writers: safeJson(row.writers_json, []),
      actors: safeJson(row.actors_json, []),
      trailerUrl: String(row.trailer_url ?? ''),

      setId: row.set_id != null ? Number(row.set_id) : null,
      setName: row.set_name ? String(row.set_name) : null,
      setOverview: row.set_overview ? String(row.set_overview) : null,

      uniqueIds: safeJson(row.unique_ids_json, {}),
      ratings: safeJson(row.ratings_json, []),
      userRating: row.user_rating != null ? Number(row.user_rating) : null,
      playCount: Number(row.play_count ?? 0),
      watched: Boolean(row.watched),
      lastPlayed: row.last_played ? String(row.last_played) : null,
      dateAdded: String(row.date_added),

      artwork: { ...emptyArtwork, ...safeJson(row.artwork_json, {}) },
      artworkCandidates: safeJson(row.artwork_candidates_json, {}),
      streamDetails: safeJson<StreamDetails>(row.stream_details_json, { video: [], audio: [], subtitle: [] }),
      subtitles: subs,
      parsedInfo: safeJson<ParsedFilenameInfo>(row.parsed_info_json, {
        cleanTitle: String(row.title),
        year: null,
        mediaKind: 'movie',
        seasonNumber: null,
        episodeNumber: null,
        multiEpisodeEnd: null,
        resolution: null,
        source: null,
        videoCodec: null,
        audioCodec: null,
        audioChannels: null,
        hdr: null,
        edition: null,
        releaseGroup: null,
      }),
      updatedAt: String(row.updated_at),
    };
  }

  // ---- TV Shows, Seasons & Episodes ----
  listTvShows(): TvShowRecord[] {
    const shows = this.db
      .prepare('SELECT * FROM tv_shows ORDER BY COALESCE(NULLIF(sort_title, \'\'), title) ASC')
      .all() as Array<Record<string, unknown>>;
    return shows.map((s) => this.mapTvShowRow(s));
  }

  getTvShow(id: number): TvShowRecord | null {
    const row = this.db.prepare('SELECT * FROM tv_shows WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.mapTvShowRow(row) : null;
  }

  upsertTvShow(show: Omit<TvShowRecord, 'id' | 'seasonsCount' | 'episodesCount' | 'watchedEpisodesCount' | 'missingSubtitlesCount' | 'missingNfoCount'>): TvShowRecord {
    const existing = this.db.prepare('SELECT id FROM tv_shows WHERE folder_path = ?').get(show.folderPath) as { id: number } | undefined;
    const now = new Date().toISOString();
    if (existing) {
      this.db
        .prepare(
          `UPDATE tv_shows SET
            source_id = ?, nfo_path = ?, has_nfo = ?, nfo_valid = ?, nfo_warnings_json = ?, scraped = ?, scraped_source = ?,
            title = ?, original_title = ?, sort_title = ?, year = ?, premiered = ?, status = ?, plot = ?, mpaa = ?, studio = ?,
            genres_json = ?, tags_json = ?, actors_json = ?, episode_order = ?, unique_ids_json = ?, ratings_json = ?,
            user_rating = ?, artwork_json = ?, updated_at = ?
          WHERE id = ?`
        )
        .run(
          show.sourceId,
          show.nfoPath,
          show.hasNfo ? 1 : 0,
          show.nfoValid ? 1 : 0,
          JSON.stringify(show.nfoWarnings),
          show.scraped ? 1 : 0,
          show.scrapedSource,
          show.title,
          show.originalTitle,
          show.sortTitle,
          show.year,
          show.premiered,
          show.status,
          show.plot,
          show.mpaa,
          show.studio,
          JSON.stringify(show.genres),
          JSON.stringify(show.tags),
          JSON.stringify(show.actors),
          show.episodeOrder,
          JSON.stringify(show.uniqueIds),
          JSON.stringify(show.ratings),
          show.userRating,
          JSON.stringify(show.artwork),
          now,
          existing.id
        );
      return this.getTvShow(existing.id)!;
    }

    const res = this.db
      .prepare(
        `INSERT INTO tv_shows (
          source_id, folder_path, nfo_path, has_nfo, nfo_valid, nfo_warnings_json, scraped, scraped_source,
          title, original_title, sort_title, year, premiered, status, plot, mpaa, studio,
          genres_json, tags_json, actors_json, episode_order, unique_ids_json, ratings_json,
          user_rating, date_added, artwork_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        show.sourceId,
        show.folderPath,
        show.nfoPath,
        show.hasNfo ? 1 : 0,
        show.nfoValid ? 1 : 0,
        JSON.stringify(show.nfoWarnings),
        show.scraped ? 1 : 0,
        show.scrapedSource,
        show.title,
        show.originalTitle,
        show.sortTitle,
        show.year,
        show.premiered,
        show.status,
        show.plot,
        show.mpaa,
        show.studio,
        JSON.stringify(show.genres),
        JSON.stringify(show.tags),
        JSON.stringify(show.actors),
        show.episodeOrder,
        JSON.stringify(show.uniqueIds),
        JSON.stringify(show.ratings),
        show.userRating,
        show.dateAdded || now,
        JSON.stringify(show.artwork),
        now
      );
    return this.getTvShow(Number(res.lastInsertRowid))!;
  }

  updateTvShow(id: number, patch: Partial<TvShowRecord>): TvShowRecord | null {
    const cur = this.getTvShow(id);
    if (!cur) return null;
    const merged = {
      ...cur,
      ...patch,
      genres: patch.genres ?? cur.genres,
      tags: patch.tags ?? cur.tags,
      actors: patch.actors ?? cur.actors,
      uniqueIds: patch.uniqueIds ?? cur.uniqueIds,
      ratings: patch.ratings ?? cur.ratings,
      artwork: patch.artwork ?? cur.artwork,
      nfoWarnings: patch.nfoWarnings ?? cur.nfoWarnings,
    };
    this.db
      .prepare(
        `UPDATE tv_shows SET
          folder_path = ?, nfo_path = ?, has_nfo = ?, nfo_valid = ?, nfo_warnings_json = ?, scraped = ?, scraped_source = ?,
          title = ?, original_title = ?, sort_title = ?, year = ?, premiered = ?, status = ?, plot = ?, mpaa = ?, studio = ?,
          genres_json = ?, tags_json = ?, actors_json = ?, episode_order = ?, unique_ids_json = ?, ratings_json = ?,
          user_rating = ?, artwork_json = ?, updated_at = ?
        WHERE id = ?`
      )
      .run(
        merged.folderPath,
        merged.nfoPath,
        merged.hasNfo ? 1 : 0,
        merged.nfoValid ? 1 : 0,
        JSON.stringify(merged.nfoWarnings),
        merged.scraped ? 1 : 0,
        merged.scrapedSource,
        merged.title,
        merged.originalTitle,
        merged.sortTitle,
        merged.year,
        merged.premiered,
        merged.status,
        merged.plot,
        merged.mpaa,
        merged.studio,
        JSON.stringify(merged.genres),
        JSON.stringify(merged.tags),
        JSON.stringify(merged.actors),
        merged.episodeOrder,
        JSON.stringify(merged.uniqueIds),
        JSON.stringify(merged.ratings),
        merged.userRating,
        JSON.stringify(merged.artwork),
        new Date().toISOString(),
        id
      );
    return this.getTvShow(id);
  }

  private mapTvShowRow(row: Record<string, unknown>): TvShowRecord {
    const id = Number(row.id);
    const seasonsCountRow = this.db.prepare('SELECT COUNT(DISTINCT season_number) AS c FROM tv_episodes WHERE show_id = ?').get(id) as { c: number };
    const epStatsRow = this.db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN watched = 1 THEN 1 ELSE 0 END) AS watched_c,
                SUM(CASE WHEN has_nfo = 0 THEN 1 ELSE 0 END) AS missing_nfo
         FROM tv_episodes WHERE show_id = ?`
      )
      .get(id) as { total: number; watched_c: number | null; missing_nfo: number | null };
    const epsWithSubsRow = this.db
      .prepare(
        `SELECT COUNT(DISTINCT e.id) AS c FROM tv_episodes e
         INNER JOIN subtitles s ON s.media_type = 'episode' AND s.media_id = e.id
         WHERE e.show_id = ?`
      )
      .get(id) as { c: number };

    const emptyArtwork: Record<ArtworkKind, string | null> = {
      poster: null,
      fanart: null,
      banner: null,
      clearlogo: null,
      clearart: null,
      disc: null,
      landscape: null,
      thumb: null,
    };

    const totalEps = Number(epStatsRow.total ?? 0);
    return {
      id,
      sourceId: Number(row.source_id),
      folderPath: String(row.folder_path),
      nfoPath: row.nfo_path ? String(row.nfo_path) : null,
      hasNfo: Boolean(row.has_nfo),
      nfoValid: Boolean(row.nfo_valid),
      nfoWarnings: safeJson(row.nfo_warnings_json, []),
      scraped: Boolean(row.scraped),
      scrapedSource: row.scraped_source ? String(row.scraped_source) : null,
      title: String(row.title),
      originalTitle: String(row.original_title ?? ''),
      sortTitle: String(row.sort_title ?? ''),
      year: row.year != null ? Number(row.year) : null,
      premiered: row.premiered ? String(row.premiered) : null,
      status: String(row.status ?? 'Ended'),
      plot: String(row.plot ?? ''),
      mpaa: String(row.mpaa ?? ''),
      studio: String(row.studio ?? ''),
      genres: safeJson(row.genres_json, []),
      tags: safeJson(row.tags_json, []),
      actors: safeJson(row.actors_json, []),
      episodeOrder: (row.episode_order as TvShowRecord['episodeOrder']) || 'aired',
      uniqueIds: safeJson(row.unique_ids_json, {}),
      ratings: safeJson(row.ratings_json, []),
      userRating: row.user_rating != null ? Number(row.user_rating) : null,
      dateAdded: String(row.date_added),
      artwork: { ...emptyArtwork, ...safeJson(row.artwork_json, {}) },
      seasonsCount: Number(seasonsCountRow.c ?? 0),
      episodesCount: totalEps,
      watchedEpisodesCount: Number(epStatsRow.watched_c ?? 0),
      missingSubtitlesCount: Math.max(0, totalEps - Number(epsWithSubsRow.c ?? 0)),
      missingNfoCount: Number(epStatsRow.missing_nfo ?? 0),
      updatedAt: String(row.updated_at),
    };
  }

  upsertTvSeason(season: Omit<TvSeasonRecord, 'id' | 'episodesCount'>): TvSeasonRecord {
    this.db
      .prepare(
        `INSERT INTO tv_seasons (show_id, season_number, name, overview, folder_path, nfo_path, has_nfo, poster_path, banner_path)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(show_id, season_number) DO UPDATE SET
           name = excluded.name, overview = COALESCE(NULLIF(excluded.overview, ''), tv_seasons.overview),
           folder_path = COALESCE(excluded.folder_path, tv_seasons.folder_path),
           nfo_path = COALESCE(excluded.nfo_path, tv_seasons.nfo_path),
           has_nfo = MAX(excluded.has_nfo, tv_seasons.has_nfo),
           poster_path = COALESCE(excluded.poster_path, tv_seasons.poster_path),
           banner_path = COALESCE(excluded.banner_path, tv_seasons.banner_path)`
      )
      .run(
        season.showId,
        season.seasonNumber,
        season.name,
        season.overview,
        season.folderPath,
        season.nfoPath,
        season.hasNfo ? 1 : 0,
        season.posterPath,
        season.bannerPath
      );
    return this.listSeasonsForShow(season.showId).find((s) => s.seasonNumber === season.seasonNumber)!;
  }

  listSeasonsForShow(showId: number): TvSeasonRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM tv_seasons WHERE show_id = ? ORDER BY season_number ASC')
      .all(showId) as Array<Record<string, unknown>>;
    return rows.map((r) => {
      const sn = Number(r.season_number);
      const countRow = this.db
        .prepare('SELECT COUNT(*) AS c FROM tv_episodes WHERE show_id = ? AND season_number = ?')
        .get(showId, sn) as { c: number };
      return {
        id: Number(r.id),
        showId: Number(r.show_id),
        seasonNumber: sn,
        name: String(r.name),
        overview: String(r.overview ?? ''),
        folderPath: r.folder_path ? String(r.folder_path) : null,
        nfoPath: r.nfo_path ? String(r.nfo_path) : null,
        hasNfo: Boolean(r.has_nfo),
        posterPath: r.poster_path ? String(r.poster_path) : null,
        bannerPath: r.banner_path ? String(r.banner_path) : null,
        episodesCount: Number(countRow.c ?? 0),
      };
    });
  }

  upsertTvEpisode(ep: Omit<TvEpisodeRecord, 'id' | 'subtitles'>): TvEpisodeRecord {
    const existing = this.db.prepare('SELECT id FROM tv_episodes WHERE file_path = ?').get(ep.filePath) as { id: number } | undefined;
    if (existing) {
      this.db
        .prepare(
          `UPDATE tv_episodes SET
            show_id = ?, season_number = ?, episode_number = ?, display_season = ?, display_episode = ?, multi_episode_end = ?,
            folder_path = ?, file_name = ?, file_size_bytes = ?, movie_hash = ?, nfo_path = ?, has_nfo = ?, nfo_valid = ?, nfo_warnings_json = ?,
            scraped = ?, title = ?, show_title = ?, aired = ?, plot = ?, runtime_minutes = ?,
            directors_json = ?, writers_json = ?, actors_json = ?, unique_ids_json = ?, ratings_json = ?,
            user_rating = ?, play_count = ?, watched = ?, last_played = ?, thumb_path = ?, stream_details_json = ?, parsed_info_json = ?
          WHERE id = ?`
        )
        .run(
          ep.showId,
          ep.seasonNumber,
          ep.episodeNumber,
          ep.displaySeason ?? null,
          ep.displayEpisode ?? null,
          ep.multiEpisodeEnd ?? null,
          ep.folderPath,
          ep.fileName,
          ep.fileSizeBytes,
          ep.movieHash,
          ep.nfoPath,
          ep.hasNfo ? 1 : 0,
          ep.nfoValid ? 1 : 0,
          JSON.stringify(ep.nfoWarnings),
          ep.scraped ? 1 : 0,
          ep.title,
          ep.showTitle,
          ep.aired,
          ep.plot,
          ep.runtimeMinutes,
          JSON.stringify(ep.directors),
          JSON.stringify(ep.writers),
          JSON.stringify(ep.actors),
          JSON.stringify(ep.uniqueIds),
          JSON.stringify(ep.ratings),
          ep.userRating,
          ep.playCount,
          ep.watched ? 1 : 0,
          ep.lastPlayed,
          ep.thumbPath,
          JSON.stringify(ep.streamDetails),
          JSON.stringify(ep.parsedInfo),
          existing.id
        );
      return this.getTvEpisode(existing.id)!;
    }

    const res = this.db
      .prepare(
        `INSERT INTO tv_episodes (
          show_id, season_number, episode_number, display_season, display_episode, multi_episode_end,
          folder_path, file_path, file_name, file_size_bytes, movie_hash, nfo_path, has_nfo, nfo_valid, nfo_warnings_json,
          scraped, title, show_title, aired, plot, runtime_minutes,
          directors_json, writers_json, actors_json, unique_ids_json, ratings_json,
          user_rating, play_count, watched, last_played, thumb_path, stream_details_json, parsed_info_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        ep.showId,
        ep.seasonNumber,
        ep.episodeNumber,
        ep.displaySeason ?? null,
        ep.displayEpisode ?? null,
        ep.multiEpisodeEnd ?? null,
        ep.folderPath,
        ep.filePath,
        ep.fileName,
        ep.fileSizeBytes,
        ep.movieHash,
        ep.nfoPath,
        ep.hasNfo ? 1 : 0,
        ep.nfoValid ? 1 : 0,
        JSON.stringify(ep.nfoWarnings),
        ep.scraped ? 1 : 0,
        ep.title,
        ep.showTitle,
        ep.aired,
        ep.plot,
        ep.runtimeMinutes,
        JSON.stringify(ep.directors),
        JSON.stringify(ep.writers),
        JSON.stringify(ep.actors),
        JSON.stringify(ep.uniqueIds),
        JSON.stringify(ep.ratings),
        ep.userRating,
        ep.playCount,
        ep.watched ? 1 : 0,
        ep.lastPlayed,
        ep.thumbPath,
        JSON.stringify(ep.streamDetails),
        JSON.stringify(ep.parsedInfo)
      );
    return this.getTvEpisode(Number(res.lastInsertRowid))!;
  }

  getTvEpisode(id: number): TvEpisodeRecord | null {
    const row = this.db.prepare('SELECT * FROM tv_episodes WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.mapEpisodeRow(row, this.listSubtitlesFor('episode', id));
  }

  listEpisodesForShow(showId: number): TvEpisodeRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM tv_episodes WHERE show_id = ? ORDER BY season_number ASC, episode_number ASC')
      .all(showId) as Array<Record<string, unknown>>;
    const allSubs = this.listAllSubtitles().filter((s) => s.mediaType === 'episode');
    const subsByEp = new Map<number, SubtitleFileRecord[]>();
    for (const s of allSubs) {
      const list = subsByEp.get(s.mediaId) ?? [];
      list.push(s);
      subsByEp.set(s.mediaId, list);
    }
    return rows.map((r) => this.mapEpisodeRow(r, subsByEp.get(Number(r.id)) ?? []));
  }

  listAllEpisodes(): TvEpisodeRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM tv_episodes ORDER BY show_id ASC, season_number ASC, episode_number ASC')
      .all() as Array<Record<string, unknown>>;
    const allSubs = this.listAllSubtitles().filter((s) => s.mediaType === 'episode');
    const subsByEp = new Map<number, SubtitleFileRecord[]>();
    for (const s of allSubs) {
      const list = subsByEp.get(s.mediaId) ?? [];
      list.push(s);
      subsByEp.set(s.mediaId, list);
    }
    return rows.map((r) => this.mapEpisodeRow(r, subsByEp.get(Number(r.id)) ?? []));
  }

  updateTvEpisode(id: number, patch: Partial<TvEpisodeRecord>): TvEpisodeRecord | null {
    const cur = this.getTvEpisode(id);
    if (!cur) return null;
    const merged = {
      ...cur,
      ...patch,
      directors: patch.directors ?? cur.directors,
      writers: patch.writers ?? cur.writers,
      actors: patch.actors ?? cur.actors,
      uniqueIds: patch.uniqueIds ?? cur.uniqueIds,
      ratings: patch.ratings ?? cur.ratings,
      streamDetails: patch.streamDetails ?? cur.streamDetails,
      nfoWarnings: patch.nfoWarnings ?? cur.nfoWarnings,
      parsedInfo: patch.parsedInfo ?? cur.parsedInfo,
    };
    this.db
      .prepare(
        `UPDATE tv_episodes SET
          season_number = ?, episode_number = ?, display_season = ?, display_episode = ?, multi_episode_end = ?,
          folder_path = ?, file_path = ?, file_name = ?, file_size_bytes = ?, movie_hash = ?,
          nfo_path = ?, has_nfo = ?, nfo_valid = ?, nfo_warnings_json = ?, scraped = ?,
          title = ?, show_title = ?, aired = ?, plot = ?, runtime_minutes = ?,
          directors_json = ?, writers_json = ?, actors_json = ?, unique_ids_json = ?, ratings_json = ?,
          user_rating = ?, play_count = ?, watched = ?, last_played = ?, thumb_path = ?, stream_details_json = ?, parsed_info_json = ?
        WHERE id = ?`
      )
      .run(
        merged.seasonNumber,
        merged.episodeNumber,
        merged.displaySeason ?? null,
        merged.displayEpisode ?? null,
        merged.multiEpisodeEnd ?? null,
        merged.folderPath,
        merged.filePath,
        merged.fileName,
        merged.fileSizeBytes,
        merged.movieHash,
        merged.nfoPath,
        merged.hasNfo ? 1 : 0,
        merged.nfoValid ? 1 : 0,
        JSON.stringify(merged.nfoWarnings),
        merged.scraped ? 1 : 0,
        merged.title,
        merged.showTitle,
        merged.aired,
        merged.plot,
        merged.runtimeMinutes,
        JSON.stringify(merged.directors),
        JSON.stringify(merged.writers),
        JSON.stringify(merged.actors),
        JSON.stringify(merged.uniqueIds),
        JSON.stringify(merged.ratings),
        merged.userRating,
        merged.playCount,
        merged.watched ? 1 : 0,
        merged.lastPlayed,
        merged.thumbPath,
        JSON.stringify(merged.streamDetails),
        JSON.stringify(merged.parsedInfo),
        id
      );
    return this.getTvEpisode(id);
  }

  private mapEpisodeRow(row: Record<string, unknown>, subs: SubtitleFileRecord[]): TvEpisodeRecord {
    return {
      id: Number(row.id),
      showId: Number(row.show_id),
      seasonNumber: Number(row.season_number),
      episodeNumber: Number(row.episode_number),
      displaySeason: row.display_season != null ? Number(row.display_season) : null,
      displayEpisode: row.display_episode != null ? Number(row.display_episode) : null,
      multiEpisodeEnd: row.multi_episode_end != null ? Number(row.multi_episode_end) : null,
      folderPath: String(row.folder_path),
      filePath: String(row.file_path),
      fileName: String(row.file_name),
      fileSizeBytes: Number(row.file_size_bytes ?? 0),
      movieHash: row.movie_hash ? String(row.movie_hash) : null,
      nfoPath: row.nfo_path ? String(row.nfo_path) : null,
      hasNfo: Boolean(row.has_nfo),
      nfoValid: Boolean(row.nfo_valid),
      nfoWarnings: safeJson(row.nfo_warnings_json, []),
      scraped: Boolean(row.scraped),
      title: String(row.title),
      showTitle: String(row.show_title ?? ''),
      aired: row.aired ? String(row.aired) : null,
      plot: String(row.plot ?? ''),
      runtimeMinutes: row.runtime_minutes != null ? Number(row.runtime_minutes) : null,
      directors: safeJson(row.directors_json, []),
      writers: safeJson(row.writers_json, []),
      actors: safeJson(row.actors_json, []),
      uniqueIds: safeJson(row.unique_ids_json, {}),
      ratings: safeJson(row.ratings_json, []),
      userRating: row.user_rating != null ? Number(row.user_rating) : null,
      playCount: Number(row.play_count ?? 0),
      watched: Boolean(row.watched),
      lastPlayed: row.last_played ? String(row.last_played) : null,
      thumbPath: row.thumb_path ? String(row.thumb_path) : null,
      streamDetails: safeJson<StreamDetails>(row.stream_details_json, { video: [], audio: [], subtitle: [] }),
      subtitles: subs,
      parsedInfo: safeJson<ParsedFilenameInfo>(row.parsed_info_json, {
        cleanTitle: String(row.title),
        year: null,
        mediaKind: 'episode',
        seasonNumber: Number(row.season_number),
        episodeNumber: Number(row.episode_number),
        multiEpisodeEnd: null,
        resolution: null,
        source: null,
        videoCodec: null,
        audioCodec: null,
        audioChannels: null,
        hdr: null,
        edition: null,
        releaseGroup: null,
      }),
    };
  }

  // ---- Rename History ----
  recordRenameBatch(batch: RenameHistoryBatch) {
    this.db
      .prepare('INSERT INTO rename_history (id, created_at, media_type, item_count, reverted, moves_json) VALUES (?, ?, ?, ?, ?, ?)')
      .run(batch.id, batch.createdAt, batch.mediaType, batch.itemCount, batch.reverted ? 1 : 0, JSON.stringify(batch.moves));
  }

  listRenameHistory(limit = 25): RenameHistoryBatch[] {
    const rows = this.db
      .prepare('SELECT * FROM rename_history ORDER BY created_at DESC LIMIT ?')
      .all(limit) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r.id),
      createdAt: String(r.created_at),
      mediaType: r.media_type as RenameHistoryBatch['mediaType'],
      itemCount: Number(r.item_count),
      reverted: Boolean(r.reverted),
      moves: safeJson(r.moves_json, []),
    }));
  }

  getRenameBatch(id: string): RenameHistoryBatch | null {
    const row = this.db.prepare('SELECT * FROM rename_history WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: String(row.id),
      createdAt: String(row.created_at),
      mediaType: row.media_type as RenameHistoryBatch['mediaType'],
      itemCount: Number(row.item_count),
      reverted: Boolean(row.reverted),
      moves: safeJson(row.moves_json, []),
    };
  }

  markRenameBatchReverted(id: string) {
    this.db.prepare('UPDATE rename_history SET reverted = 1 WHERE id = ?').run(id);
  }
}

function safeJson<T>(val: unknown, fallback: T): T {
  if (typeof val !== 'string' || !val) return fallback;
  try {
    return JSON.parse(val) as T;
  } catch {
    return fallback;
  }
}
