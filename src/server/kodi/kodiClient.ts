import fs from 'node:fs';
import path from 'node:path';
import type {
  KodiPathMapping,
  KodiRpcConfig,
  KodiSyncResult,
  MovieRecord,
  TvEpisodeRecord,
} from '../../shared/types.js';
import { DEFAULT_KODI_RPC, MediaDatabase } from '../db/database.js';
import { serializeEpisodeNfo, serializeMovieNfo, validateKodiNfoXml } from '../nfo/kodiNfo.js';

interface KodiVideoMovieItem {
  movieid: number;
  title?: string;
  year?: number;
  file?: string;
  playcount?: number;
  lastplayed?: string;
  userrating?: number;
  uniqueid?: Record<string, string>;
}

interface KodiVideoEpisodeItem {
  episodeid: number;
  title?: string;
  showtitle?: string;
  season?: number;
  episode?: number;
  file?: string;
  playcount?: number;
  lastplayed?: string;
  userrating?: number;
  uniqueid?: Record<string, string>;
}

function normalizeSlashes(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '');
}

function normalizeComparePath(p: string): string {
  return normalizeSlashes(p).toLowerCase();
}

export function mapLocalToKodiPath(localPath: string, mappings: KodiPathMapping[]): string {
  const normInput = normalizeSlashes(localPath);
  const sorted = [...mappings]
    .filter((m) => m.localPrefix.trim() && m.kodiPrefix.trim())
    .sort((a, b) => normalizeSlashes(b.localPrefix).length - normalizeSlashes(a.localPrefix).length);

  for (const m of sorted) {
    const normLocal = normalizeSlashes(m.localPrefix);
    const matches =
      normInput.toLowerCase() === normLocal.toLowerCase() ||
      normInput.toLowerCase().startsWith(`${normLocal.toLowerCase()}/`);
    if (!matches) continue;
    const rel = normInput.slice(normLocal.length).replace(/^\/+/, '');
    const usesBackslash = /^[A-Za-z]:\\/.test(m.kodiPrefix) || m.kodiPrefix.startsWith('\\\\');
    const cleanKodi = m.kodiPrefix.replace(/[\\/]+$/, '');
    if (!rel) return cleanKodi;
    return usesBackslash ? `${cleanKodi}\\${rel.replace(/\//g, '\\')}` : `${cleanKodi}/${rel}`;
  }
  return localPath;
}

export function mapKodiToLocalPath(kodiPath: string, mappings: KodiPathMapping[]): string {
  const normInput = normalizeSlashes(kodiPath);
  const sorted = [...mappings]
    .filter((m) => m.localPrefix.trim() && m.kodiPrefix.trim())
    .sort((a, b) => normalizeSlashes(b.kodiPrefix).length - normalizeSlashes(a.kodiPrefix).length);

  for (const m of sorted) {
    const normKodi = normalizeSlashes(m.kodiPrefix);
    const matches =
      normInput.toLowerCase() === normKodi.toLowerCase() ||
      normInput.toLowerCase().startsWith(`${normKodi.toLowerCase()}/`);
    if (!matches) continue;
    const rel = normInput.slice(normKodi.length).replace(/^\/+/, '');
    if (!rel) return m.localPrefix;
    const usesBackslash = /^[A-Za-z]:\\/.test(m.localPrefix) || m.localPrefix.startsWith('\\\\');
    const cleanLocal = m.localPrefix.replace(/[\\/]+$/, '');
    return usesBackslash ? `${cleanLocal}\\${rel.replace(/\//g, '\\')}` : path.posix.join(cleanLocal || '/', rel);
  }
  return kodiPath;
}

export class KodiClient {
  constructor(private db: MediaDatabase) {}

  getConfig(): KodiRpcConfig {
    const stored = this.db.getSetting<Partial<KodiRpcConfig>>('kodi_rpc', DEFAULT_KODI_RPC);
    return {
      ...DEFAULT_KODI_RPC,
      ...stored,
      pathMappings: Array.isArray(stored?.pathMappings) ? stored.pathMappings : [],
    };
  }

  private async rpcCall<T = unknown>(
    method: string,
    params: Record<string, unknown> = {}
  ): Promise<{ ok: boolean; result?: T; error?: string }> {
    const cfg = this.getConfig();
    const url = `http://${cfg.host}:${cfg.port}/jsonrpc`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cfg.username || cfg.password) {
      headers.Authorization = `Basic ${Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64')}`;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) return { ok: false, error: `HTTP ${res.status} ${res.statusText}` };
      const json = (await res.json()) as { result?: T; error?: { message?: string } };
      if (json.error) return { ok: false, error: json.error.message || 'JSON-RPC error' };
      return { ok: true, result: json.result };
    } catch (err) {
      clearTimeout(timer);
      return { ok: false, error: (err as Error).message };
    }
  }

  async testConnection() {
    const res = await this.rpcCall('JSONRPC.Ping');
    const cfg = this.getConfig();
    const updated: KodiRpcConfig = {
      ...cfg,
      lastConnectedAt: res.ok ? new Date().toISOString() : cfg.lastConnectedAt,
      lastStatus: res.ok ? 'Connected (pong)' : `Unreachable: ${res.error}`,
    };
    this.db.setSetting('kodi_rpc', updated);
    this.db.logActivity('kodi', 'Test Kodi RPC', updated.lastStatus || '', res.ok ? 'success' : 'warning');
    return { ok: res.ok, status: updated.lastStatus, result: res.result };
  }

  async triggerScan() {
    const res = await this.rpcCall('VideoLibrary.Scan', { showdialogs: true });
    this.db.logActivity(
      'kodi',
      'Kodi Library Scan',
      res.ok ? 'Triggered Kodi VideoLibrary.Scan' : `Failed: ${res.error}`,
      res.ok ? 'success' : 'warning'
    );
    return res;
  }

  async triggerClean() {
    const res = await this.rpcCall('VideoLibrary.Clean', { showdialogs: true });
    this.db.logActivity(
      'kodi',
      'Kodi Library Clean',
      res.ok ? 'Triggered Kodi VideoLibrary.Clean' : `Failed: ${res.error}`,
      res.ok ? 'success' : 'warning'
    );
    return res;
  }

  private matchMovieItem(
    kodiItem: KodiVideoMovieItem,
    movies: MovieRecord[],
    mappings: KodiPathMapping[]
  ): MovieRecord | null {
    if (kodiItem.file) {
      const mappedLocal = normalizeComparePath(mapKodiToLocalPath(kodiItem.file, mappings));
      const directPath = normalizeComparePath(kodiItem.file);
      const byPath = movies.find((m) => {
        const localCmp = normalizeComparePath(m.filePath);
        const mappedKodiCmp = normalizeComparePath(mapLocalToKodiPath(m.filePath, mappings));
        return localCmp === mappedLocal || mappedKodiCmp === directPath;
      });
      if (byPath) return byPath;
    }

    const kodiImdb = kodiItem.uniqueid?.imdb;
    const kodiTmdb = kodiItem.uniqueid?.tmdb;
    if (kodiImdb || kodiTmdb) {
      const byId = movies.find(
        (m) => (kodiImdb && m.uniqueIds.imdb === kodiImdb) || (kodiTmdb && m.uniqueIds.tmdb === kodiTmdb)
      );
      if (byId) return byId;
    }

    if (kodiItem.title) {
      const normTitle = kodiItem.title.trim().toLowerCase();
      return (
        movies.find(
          (m) =>
            m.title.trim().toLowerCase() === normTitle &&
            (kodiItem.year == null || m.year == null || m.year === kodiItem.year)
        ) ?? null
      );
    }
    return null;
  }

  private matchEpisodeItem(
    kodiItem: KodiVideoEpisodeItem,
    episodes: TvEpisodeRecord[],
    mappings: KodiPathMapping[]
  ): TvEpisodeRecord | null {
    if (kodiItem.file) {
      const mappedLocal = normalizeComparePath(mapKodiToLocalPath(kodiItem.file, mappings));
      const directPath = normalizeComparePath(kodiItem.file);
      const byPath = episodes.find((e) => {
        const localCmp = normalizeComparePath(e.filePath);
        const mappedKodiCmp = normalizeComparePath(mapLocalToKodiPath(e.filePath, mappings));
        return localCmp === mappedLocal || mappedKodiCmp === directPath;
      });
      if (byPath) return byPath;
    }

    const kodiTvdb = kodiItem.uniqueid?.tvdb;
    if (kodiTvdb) {
      const byId = episodes.find((e) => e.uniqueIds.tvdb === kodiTvdb);
      if (byId) return byId;
    }

    if (kodiItem.showtitle && kodiItem.season != null && kodiItem.episode != null) {
      const normShow = kodiItem.showtitle.trim().toLowerCase();
      return (
        episodes.find(
          (e) =>
            e.showTitle.trim().toLowerCase() === normShow &&
            (e.displaySeason ?? e.seasonNumber) === kodiItem.season &&
            (e.displayEpisode ?? e.episodeNumber) === kodiItem.episode
        ) ?? null
      );
    }
    return null;
  }

  async pullFromKodi(): Promise<KodiSyncResult> {
    const cfg = this.getConfig();
    const errors: string[] = [];

    const [moviesRes, episodesRes] = await Promise.all([
      this.rpcCall<{ movies?: KodiVideoMovieItem[] }>('VideoLibrary.GetMovies', {
        properties: ['title', 'year', 'file', 'playcount', 'lastplayed', 'userrating', 'uniqueid'],
      }),
      this.rpcCall<{ episodes?: KodiVideoEpisodeItem[] }>('VideoLibrary.GetEpisodes', {
        properties: ['title', 'showtitle', 'season', 'episode', 'file', 'playcount', 'lastplayed', 'userrating', 'uniqueid'],
      }),
    ]);

    if (!moviesRes.ok) errors.push(`GetMovies: ${moviesRes.error}`);
    if (!episodesRes.ok) errors.push(`GetEpisodes: ${episodesRes.error}`);

    const localMovies = this.db.listMovies();
    const localEpisodes = this.db.listAllEpisodes();
    const kodiMovies = moviesRes.result?.movies ?? [];
    const kodiEpisodes = episodesRes.result?.episodes ?? [];

    let matchedMovies = 0;
    let updatedMovies = 0;
    let matchedEpisodes = 0;
    let updatedEpisodes = 0;
    let unmatchedCount = 0;

    for (const km of kodiMovies) {
      const match = this.matchMovieItem(km, localMovies, cfg.pathMappings);
      if (!match) {
        unmatchedCount++;
        continue;
      }
      matchedMovies++;

      const nextPlayCount = typeof km.playcount === 'number' ? km.playcount : match.playCount;
      const nextWatched = nextPlayCount > 0;
      const nextLastPlayed = km.lastplayed ? km.lastplayed : match.lastPlayed;
      const nextUserRating = typeof km.userrating === 'number' && km.userrating > 0 ? km.userrating : match.userRating;

      const changed =
        nextPlayCount !== match.playCount ||
        nextWatched !== match.watched ||
        nextLastPlayed !== match.lastPlayed ||
        nextUserRating !== match.userRating;

      if (changed) {
        const updated = this.db.updateMovie(match.id, {
          playCount: nextPlayCount,
          watched: nextWatched,
          lastPlayed: nextLastPlayed,
          userRating: nextUserRating,
        });
        if (updated) {
          const base = path.basename(updated.filePath, path.extname(updated.filePath));
          const nfoPath = updated.nfoPath ?? path.join(updated.folderPath, `${base}.nfo`);
          const xml = serializeMovieNfo(updated);
          fs.writeFileSync(nfoPath, xml, 'utf-8');
          const rep = validateKodiNfoXml(xml);
          this.db.updateMovie(updated.id, { nfoPath, hasNfo: true, nfoValid: rep.valid, nfoWarnings: rep.warnings });
          updatedMovies++;
        }
      }
    }

    for (const ke of kodiEpisodes) {
      const match = this.matchEpisodeItem(ke, localEpisodes, cfg.pathMappings);
      if (!match) {
        unmatchedCount++;
        continue;
      }
      matchedEpisodes++;

      const nextPlayCount = typeof ke.playcount === 'number' ? ke.playcount : match.playCount;
      const nextWatched = nextPlayCount > 0;
      const nextLastPlayed = ke.lastplayed ? ke.lastplayed : match.lastPlayed;
      const nextUserRating = typeof ke.userrating === 'number' && ke.userrating > 0 ? ke.userrating : match.userRating;

      const changed =
        nextPlayCount !== match.playCount ||
        nextWatched !== match.watched ||
        nextLastPlayed !== match.lastPlayed ||
        nextUserRating !== match.userRating;

      if (changed) {
        const updated = this.db.updateTvEpisode(match.id, {
          playCount: nextPlayCount,
          watched: nextWatched,
          lastPlayed: nextLastPlayed,
          userRating: nextUserRating,
        });
        if (updated) {
          const base = path.basename(updated.filePath, path.extname(updated.filePath));
          const nfoPath = updated.nfoPath ?? path.join(updated.folderPath, `${base}.nfo`);
          const xml = serializeEpisodeNfo(updated);
          fs.writeFileSync(nfoPath, xml, 'utf-8');
          const rep = validateKodiNfoXml(xml);
          this.db.updateTvEpisode(updated.id, { nfoPath, hasNfo: true, nfoValid: rep.valid, nfoWarnings: rep.warnings });
          updatedEpisodes++;
        }
      }
    }

    const result: KodiSyncResult = {
      direction: 'pull',
      matchedMovies,
      updatedMovies,
      matchedEpisodes,
      updatedEpisodes,
      unmatchedCount,
      errors,
    };

    this.db.logActivity(
      'kodi',
      'Pull Kodi Watch State & Ratings',
      `Pulled ${updatedMovies} movie(s) & ${updatedEpisodes} episode(s) from Kodi (${matchedMovies + matchedEpisodes} matched)`,
      errors.length > 0 ? 'warning' : 'success'
    );
    return result;
  }

  async pushToKodi(): Promise<KodiSyncResult> {
    const cfg = this.getConfig();
    const errors: string[] = [];

    const [moviesRes, episodesRes] = await Promise.all([
      this.rpcCall<{ movies?: KodiVideoMovieItem[] }>('VideoLibrary.GetMovies', {
        properties: ['title', 'year', 'file', 'playcount', 'lastplayed', 'userrating', 'uniqueid'],
      }),
      this.rpcCall<{ episodes?: KodiVideoEpisodeItem[] }>('VideoLibrary.GetEpisodes', {
        properties: ['title', 'showtitle', 'season', 'episode', 'file', 'playcount', 'lastplayed', 'userrating', 'uniqueid'],
      }),
    ]);

    if (!moviesRes.ok) errors.push(`GetMovies: ${moviesRes.error}`);
    if (!episodesRes.ok) errors.push(`GetEpisodes: ${episodesRes.error}`);

    const localMovies = this.db.listMovies();
    const localEpisodes = this.db.listAllEpisodes();
    const kodiMovies = moviesRes.result?.movies ?? [];
    const kodiEpisodes = episodesRes.result?.episodes ?? [];

    let matchedMovies = 0;
    let updatedMovies = 0;
    let matchedEpisodes = 0;
    let updatedEpisodes = 0;
    let unmatchedCount = 0;

    for (const km of kodiMovies) {
      const match = this.matchMovieItem(km, localMovies, cfg.pathMappings);
      if (!match) {
        unmatchedCount++;
        continue;
      }
      matchedMovies++;

      const desiredPlayCount = match.watched ? Math.max(1, match.playCount) : 0;
      const desiredLastPlayed = match.lastPlayed ?? '';
      const desiredUserRating = match.userRating ?? 0;

      const needsUpdate =
        (km.playcount ?? 0) !== desiredPlayCount ||
        (km.userrating ?? 0) !== desiredUserRating ||
        (desiredLastPlayed && (km.lastplayed ?? '') !== desiredLastPlayed);

      if (needsUpdate) {
        const params: Record<string, unknown> = {
          movieid: km.movieid,
          playcount: desiredPlayCount,
          userrating: desiredUserRating,
        };
        if (desiredLastPlayed) params.lastplayed = desiredLastPlayed;
        const setRes = await this.rpcCall('VideoLibrary.SetMovieDetails', params);
        if (setRes.ok) updatedMovies++;
        else errors.push(`SetMovieDetails(${km.movieid}): ${setRes.error}`);
      }
    }

    for (const ke of kodiEpisodes) {
      const match = this.matchEpisodeItem(ke, localEpisodes, cfg.pathMappings);
      if (!match) {
        unmatchedCount++;
        continue;
      }
      matchedEpisodes++;

      const desiredPlayCount = match.watched ? Math.max(1, match.playCount) : 0;
      const desiredLastPlayed = match.lastPlayed ?? '';
      const desiredUserRating = match.userRating ?? 0;

      const needsUpdate =
        (ke.playcount ?? 0) !== desiredPlayCount ||
        (ke.userrating ?? 0) !== desiredUserRating ||
        (desiredLastPlayed && (ke.lastplayed ?? '') !== desiredLastPlayed);

      if (needsUpdate) {
        const params: Record<string, unknown> = {
          episodeid: ke.episodeid,
          playcount: desiredPlayCount,
          userrating: desiredUserRating,
        };
        if (desiredLastPlayed) params.lastplayed = desiredLastPlayed;
        const setRes = await this.rpcCall('VideoLibrary.SetEpisodeDetails', params);
        if (setRes.ok) updatedEpisodes++;
        else errors.push(`SetEpisodeDetails(${ke.episodeid}): ${setRes.error}`);
      }
    }

    const result: KodiSyncResult = {
      direction: 'push',
      matchedMovies,
      updatedMovies,
      matchedEpisodes,
      updatedEpisodes,
      unmatchedCount,
      errors,
    };

    this.db.logActivity(
      'kodi',
      'Push Watch State & Ratings to Kodi',
      `Pushed ${updatedMovies} movie(s) & ${updatedEpisodes} episode(s) to Kodi (${matchedMovies + matchedEpisodes} matched)`,
      errors.length > 0 ? 'warning' : 'success'
    );
    return result;
  }

  async refreshItem(
    mediaType: 'movie' | 'episode',
    mediaId: number
  ): Promise<{ ok: boolean; error?: string; kodiItemId?: number }> {
    const cfg = this.getConfig();

    if (mediaType === 'movie') {
      const movie = this.db.getMovie(mediaId);
      if (!movie) return { ok: false, error: 'Movie not found' };
      const res = await this.rpcCall<{ movies?: KodiVideoMovieItem[] }>('VideoLibrary.GetMovies', {
        properties: ['title', 'year', 'file', 'uniqueid'],
      });
      if (!res.ok) return { ok: false, error: res.error };
      const match = (res.result?.movies ?? []).find((km) => this.matchMovieItem(km, [movie], cfg.pathMappings));
      if (!match) {
        return { ok: false, error: `"${movie.title}" was not found in Kodi's library yet — trigger a Kodi library scan first` };
      }
      const refRes = await this.rpcCall('VideoLibrary.RefreshMovie', { movieid: match.movieid, ignorenfo: false });
      this.db.logActivity(
        'kodi',
        'Refresh Movie in Kodi',
        refRes.ok ? `Refreshed "${movie.title}" (Kodi #${match.movieid}) from NFO` : `Failed: ${refRes.error}`,
        refRes.ok ? 'success' : 'warning'
      );
      return { ok: refRes.ok, error: refRes.error, kodiItemId: match.movieid };
    }

    const ep = this.db.getTvEpisode(mediaId);
    if (!ep) return { ok: false, error: 'Episode not found' };
    const res = await this.rpcCall<{ episodes?: KodiVideoEpisodeItem[] }>('VideoLibrary.GetEpisodes', {
      properties: ['title', 'showtitle', 'season', 'episode', 'file', 'uniqueid'],
    });
    if (!res.ok) return { ok: false, error: res.error };
    const match = (res.result?.episodes ?? []).find((ke) => this.matchEpisodeItem(ke, [ep], cfg.pathMappings));
    if (!match) {
      return { ok: false, error: `"${ep.title}" was not found in Kodi's library yet — trigger a Kodi library scan first` };
    }
    const refRes = await this.rpcCall('VideoLibrary.RefreshEpisode', { episodeid: match.episodeid, ignorenfo: false });
    this.db.logActivity(
      'kodi',
      'Refresh Episode in Kodi',
      refRes.ok ? `Refreshed "${ep.title}" (Kodi #${match.episodeid}) from NFO` : `Failed: ${refRes.error}`,
      refRes.ok ? 'success' : 'warning'
    );
    return { ok: refRes.ok, error: refRes.error, kodiItemId: match.episodeid };
  }

  generateSmartPlaylistXml(opts: {
    name: string;
    type: 'movies' | 'episodes' | 'tvshows';
    genre?: string;
    minRating?: number;
    unwatchedOnly?: boolean;
    resolution?: string;
    orderBy?: 'title' | 'rating' | 'year' | 'dateadded';
    direction?: 'ascending' | 'descending';
    limit?: number;
  }): string {
    const rules: string[] = [];
    if (opts.genre) {
      rules.push(`  <rule field="genre" operator="contains">\n    <value>${escapeXml(opts.genre)}</value>\n  </rule>`);
    }
    if (opts.minRating && opts.minRating > 0) {
      rules.push(`  <rule field="rating" operator="greaterthan">\n    <value>${opts.minRating}</value>\n  </rule>`);
    }
    if (opts.unwatchedOnly) {
      rules.push(`  <rule field="playcount" operator="is">\n    <value>0</value>\n  </rule>`);
    }
    if (opts.resolution === '2160p') {
      rules.push(`  <rule field="videoresolution" operator="greaterthan">\n    <value>1080</value>\n  </rule>`);
    }

    const lines = [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>',
      `<smartplaylist type="${opts.type}">`,
      `  <name>${escapeXml(opts.name)}</name>`,
      '  <match>all</match>',
      ...rules,
      `  <order direction="${opts.direction ?? 'descending'}">${opts.orderBy ?? 'rating'}</order>`,
    ];
    if (opts.limit && opts.limit > 0) lines.push(`  <limit>${opts.limit}</limit>`);
    lines.push('</smartplaylist>');
    return lines.join('\n') + '\n';
  }

  generateSourcesXml(): string {
    const cfg = this.getConfig();
    const sources = this.db.listSources();
    const movieSources = sources.filter((s) => s.mediaKind === 'movie');
    const tvSources = sources.filter((s) => s.mediaKind === 'tvshow');
    const block = (items: typeof sources) =>
      items
        .map((s) => {
          const mappedPath = mapLocalToKodiPath(s.path, cfg.pathMappings);
          return `    <source>\n      <name>${escapeXml(s.name)}</name>\n      <path pathversion="1">${escapeXml(mappedPath)}</path>\n      <allowsharing>true</allowsharing>\n    </source>`;
        })
        .join('\n');

    return [
      '<sources>',
      '  <video>',
      '    <default pathversion="1"></default>',
      block([...movieSources, ...tvSources]),
      '  </video>',
      '</sources>',
    ].join('\n') + '\n';
  }

  exportLibraryJson(): { exportedAt: string; movies: MovieRecord[]; showsCount: number } {
    return {
      exportedAt: new Date().toISOString(),
      movies: this.db.listMovies(),
      showsCount: this.db.listTvShows().length,
    };
  }
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
