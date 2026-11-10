import type { KodiRpcConfig, MovieRecord } from '../../shared/types.js';
import { DEFAULT_KODI_RPC, MediaDatabase } from '../db/database.js';

export class KodiClient {
  constructor(private db: MediaDatabase) {}

  getConfig(): KodiRpcConfig {
    return this.db.getSetting<KodiRpcConfig>('kodi_rpc', DEFAULT_KODI_RPC);
  }

  private async rpcCall(method: string, params: Record<string, unknown> = {}): Promise<{ ok: boolean; result?: unknown; error?: string }> {
    const cfg = this.getConfig();
    const url = `http://${cfg.host}:${cfg.port}/jsonrpc`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cfg.username || cfg.password) {
      headers.Authorization = `Basic ${Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64')}`;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3500);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) return { ok: false, error: `HTTP ${res.status} ${res.statusText}` };
      const json = (await res.json()) as { result?: unknown; error?: { message?: string } };
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
    this.db.logActivity('kodi', 'Kodi Library Scan', res.ok ? 'Triggered Kodi VideoLibrary.Scan' : `Failed: ${res.error}`, res.ok ? 'success' : 'warning');
    return res;
  }

  async triggerClean() {
    const res = await this.rpcCall('VideoLibrary.Clean', { showdialogs: true });
    this.db.logActivity('kodi', 'Kodi Library Clean', res.ok ? 'Triggered Kodi VideoLibrary.Clean' : `Failed: ${res.error}`, res.ok ? 'success' : 'warning');
    return res;
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
    const sources = this.db.listSources();
    const movieSources = sources.filter((s) => s.mediaKind === 'movie');
    const tvSources = sources.filter((s) => s.mediaKind === 'tvshow');
    const block = (items: typeof sources) =>
      items
        .map(
          (s) =>
            `    <source>\n      <name>${escapeXml(s.name)}</name>\n      <path pathversion="1">${escapeXml(s.path)}</path>\n      <allowsharing>true</allowsharing>\n    </source>`
        )
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
