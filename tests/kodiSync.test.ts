import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApiApp } from '../src/server/app.js';
import { MediaDatabase } from '../src/server/db/database.js';
import { mapKodiToLocalPath, mapLocalToKodiPath } from '../src/server/kodi/kodiClient.js';
import { resetAndSeedSampleLibrary } from '../src/server/scanner/sampleGenerator.js';

const tmpDirs: string[] = [];
const activeServers: http.Server[] = [];

afterEach(async () => {
  for (const s of activeServers) {
    await new Promise<void>((resolve) => s.close(() => resolve()));
  }
  activeServers.length = 0;

  for (const d of tmpDirs) {
    fs.rmSync(d, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

async function startMockKodiRpc(handler: (method: string, params: Record<string, unknown>, auth?: string) => unknown) {
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as {
        id: number;
        method: string;
        params?: Record<string, unknown>;
      };
      const result = handler(body.method, body.params ?? {}, req.headers.authorization);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  activeServers.push(server);
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 8080;
  return { port };
}

describe('Kodi Path Mapping & Bidirectional JSON-RPC Sync', () => {
  it('translates local paths <-> Kodi SMB/NFS/UNC paths using longest prefix match', () => {
    const mappings = [
      { localPrefix: '/mnt/media', kodiPrefix: 'smb://nas/Media' },
      { localPrefix: '/mnt/media/Movies/4K', kodiPrefix: 'nfs://10.0.0.5/exports/4K-Movies/' },
      { localPrefix: 'D:\\TV', kodiPrefix: '\\\\STORAGE\\TV\\' },
    ];

    expect(mapLocalToKodiPath('/mnt/media/Movies/4K/Dune (2021)/Dune.mkv', mappings)).toBe(
      'nfs://10.0.0.5/exports/4K-Movies/Dune (2021)/Dune.mkv'
    );
    expect(mapKodiToLocalPath('nfs://10.0.0.5/exports/4K-Movies/Dune (2021)/Dune.mkv', mappings)).toBe(
      '/mnt/media/Movies/4K/Dune (2021)/Dune.mkv'
    );

    expect(mapLocalToKodiPath('/mnt/media/TV Shows/Show/S01E01.mkv', mappings)).toBe(
      'smb://nas/Media/TV Shows/Show/S01E01.mkv'
    );
    expect(mapKodiToLocalPath('smb://nas/Media/TV Shows/Show/S01E01.mkv', mappings)).toBe(
      '/mnt/media/TV Shows/Show/S01E01.mkv'
    );

    expect(mapLocalToKodiPath('D:\\TV\\Dark\\Season 01\\S01E01.mkv', mappings)).toBe(
      '\\\\STORAGE\\TV\\Dark\\Season 01\\S01E01.mkv'
    );
    expect(mapKodiToLocalPath('\\\\STORAGE\\TV\\Dark\\Season 01\\S01E01.mkv', mappings)).toBe(
      'D:\\TV\\Dark\\Season 01\\S01E01.mkv'
    );
  });

  it('applies path mappings to sources.xml and supports ping, pull, push, and targeted refresh via JSON-RPC', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-kodi-'));
    tmpDirs.push(tmp);

    const db = new MediaDatabase(path.join(tmp, 'kodi.db'));
    const sampleRoot = path.join(tmp, 'sample-library');
    await resetAndSeedSampleLibrary(db, sampleRoot);

    const app = createApiApp(db);

    const moviesRes = await request(app).get('/api/movies');
    const firstMovie = moviesRes.body.movies[0];
    const showsRes = await request(app).get('/api/shows/tree');
    const firstEpisode = showsRes.body.tree[0].episodes[0];

    const mappings = [
      { localPrefix: path.join(sampleRoot, 'movies'), kodiPrefix: 'smb://nas/KodiMovies' },
      { localPrefix: path.join(sampleRoot, 'TV Shows'), kodiPrefix: 'smb://nas/KodiTV' },
    ];

    const kodiMoviePath = mapLocalToKodiPath(firstMovie.filePath, mappings);
    const kodiEpPath = mapLocalToKodiPath(firstEpisode.filePath, mappings);

    const rpcCalls: Array<{ method: string; params: Record<string, unknown>; auth?: string }> = [];
    let kodiMovieState = {
      movieid: 42,
      title: firstMovie.title,
      year: firstMovie.year,
      file: kodiMoviePath,
      playcount: 3,
      lastplayed: '2026-10-15 21:30:00',
      userrating: 9,
      uniqueid: firstMovie.uniqueIds,
    };
    let kodiEpState = {
      episodeid: 77,
      title: firstEpisode.title,
      showtitle: firstEpisode.showTitle,
      season: firstEpisode.seasonNumber,
      episode: firstEpisode.episodeNumber,
      file: kodiEpPath,
      playcount: 2,
      lastplayed: '2026-10-16 19:00:00',
      userrating: 8,
      uniqueid: firstEpisode.uniqueIds,
    };

    const { port } = await startMockKodiRpc((method, params, auth) => {
      rpcCalls.push({ method, params, auth });
      if (method === 'JSONRPC.Ping') return 'pong';
      if (method === 'VideoLibrary.GetMovies') return { movies: [kodiMovieState] };
      if (method === 'VideoLibrary.GetEpisodes') return { episodes: [kodiEpState] };
      if (method === 'VideoLibrary.SetMovieDetails') {
        kodiMovieState = {
          ...kodiMovieState,
          playcount: Number(params.playcount ?? kodiMovieState.playcount),
          userrating: Number(params.userrating ?? kodiMovieState.userrating),
          lastplayed: String(params.lastplayed ?? kodiMovieState.lastplayed),
        };
        return 'OK';
      }
      if (method === 'VideoLibrary.SetEpisodeDetails') {
        kodiEpState = {
          ...kodiEpState,
          playcount: Number(params.playcount ?? kodiEpState.playcount),
          userrating: Number(params.userrating ?? kodiEpState.userrating),
          lastplayed: String(params.lastplayed ?? kodiEpState.lastplayed),
        };
        return 'OK';
      }
      if (method === 'VideoLibrary.RefreshMovie' || method === 'VideoLibrary.RefreshEpisode') {
        return 'OK';
      }
      return {};
    });

    // Save Kodi config with pathMappings and credentials
    const saveCfg = await request(app)
      .put('/api/settings/kodi')
      .send({
        host: '127.0.0.1',
        port,
        username: 'kodi',
        password: 'secret',
        enabled: true,
        pathMappings: mappings,
      });
    expect(saveCfg.status).toBe(200);
    expect(saveCfg.body.pathMappings).toHaveLength(2);

    // 1. Verify sources.xml translates local paths -> Kodi SMB paths
    const sourcesXmlRes = await request(app).get('/api/export/sources-xml');
    expect(sourcesXmlRes.status).toBe(200);
    expect(sourcesXmlRes.body.xml).toContain('smb://nas/KodiMovies');
    expect(sourcesXmlRes.body.xml).toContain('smb://nas/KodiTV');

    // 2. Test ping with Basic auth header
    const testRes = await request(app).post('/api/settings/kodi/test').send({});
    expect(testRes.status).toBe(200);
    expect(testRes.body.ok).toBe(true);
    const pingCall = rpcCalls.find((c) => c.method === 'JSONRPC.Ping');
    expect(pingCall?.auth).toBe(`Basic ${Buffer.from('kodi:secret').toString('base64')}`);

    // 3. Pull from Kodi -> updates local DB & regenerates NFO XML
    const pullRes = await request(app).post('/api/settings/kodi/sync').send({ direction: 'pull' });
    expect(pullRes.status).toBe(200);
    expect(pullRes.body.direction).toBe('pull');
    expect(pullRes.body.matchedMovies).toBe(1);
    expect(pullRes.body.updatedMovies).toBe(1);
    expect(pullRes.body.matchedEpisodes).toBe(1);
    expect(pullRes.body.updatedEpisodes).toBe(1);

    const updatedMovieRes = await request(app).get(`/api/movies/${firstMovie.id}`);
    expect(updatedMovieRes.body.movie.watched).toBe(true);
    expect(updatedMovieRes.body.movie.playCount).toBe(3);
    expect(updatedMovieRes.body.movie.userRating).toBe(9);
    const movieNfo = fs.readFileSync(updatedMovieRes.body.movie.nfoPath, 'utf-8');
    expect(movieNfo).toContain('<playcount>3</playcount>');
    expect(movieNfo).toContain('<userrating>9</userrating>');

    // 4. Modify locally & Push to Kodi
    await request(app)
      .patch(`/api/movies/${firstMovie.id}`)
      .send({ watched: false, playCount: 0, userRating: 10, writeNfo: true });
    await request(app)
      .patch(`/api/episodes/${firstEpisode.id}`)
      .send({ playCount: 5, watched: true, userRating: 7, writeNfo: true });

    const pushRes = await request(app).post('/api/settings/kodi/sync').send({ direction: 'push' });
    expect(pushRes.status).toBe(200);
    expect(pushRes.body.direction).toBe('push');
    expect(pushRes.body.updatedMovies).toBe(1);
    expect(pushRes.body.updatedEpisodes).toBe(1);
    expect(kodiMovieState.playcount).toBe(0);
    expect(kodiMovieState.userrating).toBe(10);
    expect(kodiEpState.playcount).toBe(5);
    expect(kodiEpState.userrating).toBe(7);

    // 5. Targeted RefreshMovie & RefreshEpisode
    const refMovieRes = await request(app)
      .post('/api/settings/kodi/refresh')
      .send({ mediaType: 'movie', mediaId: firstMovie.id });
    expect(refMovieRes.status).toBe(200);
    expect(refMovieRes.body.ok).toBe(true);
    expect(refMovieRes.body.kodiItemId).toBe(42);
    expect(rpcCalls.some((c) => c.method === 'VideoLibrary.RefreshMovie' && c.params.movieid === 42 && c.params.ignorenfo === false)).toBe(true);

    const refEpRes = await request(app)
      .post('/api/settings/kodi/refresh')
      .send({ mediaType: 'episode', mediaId: firstEpisode.id });
    expect(refEpRes.status).toBe(200);
    expect(refEpRes.body.ok).toBe(true);
    expect(refEpRes.body.kodiItemId).toBe(77);
    expect(rpcCalls.some((c) => c.method === 'VideoLibrary.RefreshEpisode' && c.params.episodeid === 77 && c.params.ignorenfo === false)).toBe(true);
  }, 15_000);
});
