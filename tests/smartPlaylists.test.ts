import { describe, expect, it, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApiApp } from '../src/server/app.js';
import { MediaDatabase } from '../src/server/db/database.js';
import {
  SMART_PLAYLIST_FIELDS,
  evaluateRule,
  buildPlaylistItems,
  hashPlaylistDefinition,
  presetDefinition,
  previewDefinition,
  sanitizeDefinition,
  serializeSmartPlaylist,
  toKodiPlaylistFileName,
} from '../src/server/playlists/smartPlaylistEngine.js';
import type {
  ArtworkKind,
  MovieRecord,
  ParsedFilenameInfo,
  SmartPlaylistDefinition,
  SmartPlaylistRule,
} from '../src/shared/types.js';


const EMPTY_ARTWORK: Record<ArtworkKind, string | null> = {
  poster: null,
  fanart: null,
  banner: null,
  clearlogo: null,
  clearart: null,
  disc: null,
  landscape: null,
  thumb: null,
};

const PARSED = (title: string, resolution: string | null = '1080p'): ParsedFilenameInfo => ({
  cleanTitle: title,
  year: 2020,
  mediaKind: 'movie',
  seasonNumber: null,
  episodeNumber: null,
  multiEpisodeEnd: null,
  resolution,
  source: 'WEB-DL',
  videoCodec: null,
  audioCodec: null,
  audioChannels: null,
  hdr: null,
  edition: null,
  releaseGroup: null,
});

/** Build a complete MovieRecord for upsertMovie, which requires every column. */
function makeMovieRecord(
  sourceId: number,
  root: string,
  opts: {
    title: string;
    year?: number;
    genres?: string[];
    studios?: string[];
    setName?: string | null;
    setId?: number | null;
    runtimeMinutes?: number;
    playCount?: number;
    watched?: boolean;
    mpaa?: string;
    country?: string;
    rating?: number | null;
    height?: number;
    codec?: string;
    hdr?: string;
    resolution?: string | null;
    subtitles?: string[];
  }
): Omit<MovieRecord, 'id' | 'setOverview'> {
  const title = opts.title;
  const folder = `${root}/${title}`;
  const filePath = `${folder}/${title}.mkv`;
  const subs = opts.subtitles ?? [];
  return {
    sourceId,
    folderPath: folder,
    filePath,
    fileName: `${title}.mkv`,
    fileSizeBytes: 1000,
    movieHash: null,
    nfoPath: null,
    hasNfo: false,
    nfoValid: false,
    nfoWarnings: [],
    scraped: true,
    scrapedSource: 'tmdb',
    title,
    originalTitle: title,
    sortTitle: title,
    year: opts.year ?? 2020,
    premiered: null,
    tagline: '',
    plot: '',
    outline: '',
    runtimeMinutes: opts.runtimeMinutes ?? 100,
    mpaa: opts.mpaa ?? 'PG-13',
    country: opts.country ?? 'USA',
    studios: opts.studios ?? [],
    genres: opts.genres ?? [],
    tags: [],
    directors: [],
    writers: [],
    actors: [],
    trailerUrl: '',
    setId: opts.setId ?? null,
    setName: opts.setName ?? null,
    uniqueIds: {},
    ratings:
      opts.rating == null
        ? []
        : [{ source: 'imdb', value: opts.rating, max: 10, votes: 100, isDefault: true }],
    userRating: null,
    playCount: opts.playCount ?? 0,
    // Keep the two consistent so playcount rules behave like the real scanner data.
    watched: opts.watched ?? (opts.playCount ?? 0) > 0,
    lastPlayed: null,
    dateAdded: '2026-01-01T00:00:00.000Z',
    artwork: { ...EMPTY_ARTWORK },
    streamDetails: {
      video: [
        {
          codec: opts.codec ?? 'H.264',
          height: opts.height ?? 1080,
          width: (opts.height ?? 1080) * (16 / 9),
          aspect: '1.78',
          durationSeconds: 6000,
          ...(opts.hdr ? { hdrType: opts.hdr } : {}),
        },
      ],
      audio: [{ codec: 'EAC3', channels: 6, language: 'eng' }],
      subtitle: [],
    },
    subtitles: subs.map((lang, idx) => ({
      id: idx + 1,
      mediaType: 'movie' as const,
      mediaId: 0,
      filePath: `${folder}/${title}.${lang}.srt`,
      fileName: `${title}.${lang}.srt`,
      language: lang,
      format: 'srt' as const,
      forced: false,
      sdh: false,
      sizeBytes: 100,
      cueCount: 10,
    })),
    parsedInfo: PARSED(title, opts.resolution ?? null),
    updatedAt: new Date().toISOString(),
  };
}

const rule = (field: SmartPlaylistRule['field'], operator: SmartPlaylistRule['operator'], value: string): SmartPlaylistRule => ({
  id: `${field}-${operator}-${value}`,
  field,
  operator,
  value,
});

const definition = (partial: Partial<SmartPlaylistDefinition> = {}): SmartPlaylistDefinition => ({
  name: 'Test Playlist',
  type: 'movies',
  match: 'all',
  rules: [],
  order: { by: 'title', direction: 'ascending' },
  limit: null,
  ...partial,
});

describe('Smart playlist engine', () => {
  let db: MediaDatabase;
  let movieRows: ReturnType<MediaDatabase['listMovies']>;

  beforeEach(() => {
    db = new MediaDatabase(':memory:');
    // Seed a tiny deterministic library so assertions don't depend on the sample data.
    const source = db.addSource({ name: 'Movies', path: '/tmp/kv-playlist-movies', mediaKind: 'movie' });
    const seed = (title: string, opts: Omit<Parameters<typeof makeMovieRecord>[2], 'title'>) => {
      const movie = db.upsertMovie(makeMovieRecord(source.id, '/tmp/kv-playlist-movies', { title, ...opts }));
      db.replaceSubtitlesForMedia(
        'movie',
        movie.id,
        (opts.subtitles ?? []).map((lang, idx) => ({
          mediaType: 'movie' as const,
          mediaId: movie.id,
          filePath: `${movie.folderPath}/${title}.${lang}.${idx}.srt`,
          fileName: `${title}.${lang}.srt`,
          language: lang,
          format: 'srt' as const,
          forced: false,
          sdh: false,
          sizeBytes: 100,
          cueCount: 10,
        }))
      );
      return movie;
    };

    seed('Dune', { year: 2021, genres: ['Science Fiction'], height: 2160, codec: 'HEVC', hdr: 'Dolby Vision', runtimeMinutes: 155, subtitles: ['en'], rating: 8.1 });
    seed('Arrival', { year: 2016, genres: ['Science Fiction'], height: 1080, codec: 'H.264', runtimeMinutes: 116, subtitles: [], rating: 7.9 });
    seed('Spirited Away', { year: 2001, genres: ['Animation', 'Family'], height: 1080, codec: 'H.264', runtimeMinutes: 125, subtitles: ['ja'], playCount: 2, rating: 8.6 });
    seed('Parasite', { year: 2019, genres: ['Thriller'], height: 2160, codec: 'HEVC', runtimeMinutes: 132, subtitles: ['ko'] });
    // Started but not finished — exercises the "In Progress" preset (playcount 1).
    seed('Oppenheimer', { year: 2023, genres: ['Drama'], runtimeMinutes: 181, playCount: 1, watched: true });
    movieRows = db.listMovies();
  });

  it('exposes a field catalogue with operators limited to each field kind', () => {
    const rating = SMART_PLAYLIST_FIELDS.find((f) => f.field === 'rating')!;
    expect(rating.kind).toBe('number');
    expect(rating.operators).toContain('greaterthan');
    expect(rating.operators).not.toContain('contains');

    const season = SMART_PLAYLIST_FIELDS.find((f) => f.field === 'season')!;
    expect(season.supports).toEqual(['episodes']);
  });

  it('matches numeric, enum, list and negated rules', () => {
    const items = buildPlaylistItems('movies', movieRows, [], []);
    const byTitle = (t: string) => items.find((i) => i.preview.title === t)!;

    expect(evaluateRule(byTitle('Dune'), rule('videoresolution', 'greaterthan', '1080'))).toBe(true);
    expect(evaluateRule(byTitle('Arrival'), rule('videoresolution', 'greaterthan', '1080'))).toBe(false);
    // Codec aliasing: stored "HEVC" must match a user typing h265.
    expect(evaluateRule(byTitle('Dune'), rule('videocodec', 'is', 'h265'))).toBe(true);
    // HDR normalisation.
    expect(evaluateRule(byTitle('Dune'), rule('hdr', 'is', 'dolbyvision'))).toBe(true);
    expect(evaluateRule(byTitle('Parasite'), rule('hdr', 'is', 'dolbyvision'))).toBe(false);
    // Genre list membership, case-insensitive.
    expect(evaluateRule(byTitle('Dune'), rule('genre', 'contains', 'science fiction'))).toBe(true);
    // Negation on a list field.
    expect(evaluateRule(byTitle('Parasite'), rule('genre', 'doesnotcontain', 'science fiction'))).toBe(true);
    // Subtitle language normalisation: library stores ISO 639-1, playlist asks 639-2.
    expect(evaluateRule(byTitle('Arrival'), rule('subtitlelanguage', 'doesnotcontain', 'eng'))).toBe(true);
    expect(evaluateRule(byTitle('Dune'), rule('subtitlelanguage', 'doesnotcontain', 'eng'))).toBe(false);
    // Runtime range.
    expect(evaluateRule(byTitle('Arrival'), rule('runtime', 'lessthan', '150'))).toBe(true);
    expect(evaluateRule(byTitle('Dune'), rule('runtime', 'lessthan', '150'))).toBe(false);
  });

  it('honours match=all vs match=one and reports per-rule counts', () => {
    const all = previewDefinition(
      definition({ rules: [rule('genre', 'contains', 'animation'), rule('playcount', 'greaterthan', '1')] }),
      movieRows,
      [],
      []
    );
    expect(all.preview.totalCount).toBe(1);
    expect(all.preview.items[0].title).toBe('Spirited Away');

    const any = previewDefinition(
      definition({ match: 'one', rules: [rule('genre', 'contains', 'animation'), rule('videoresolution', 'greaterthan', '1080')] }),
      movieRows,
      [],
      []
    );
    // Spirited Away (animation) + Dune + Parasite (both >1080p).
    expect(any.preview.totalCount).toBe(3);
    expect(any.preview.rules.find((r) => r.label.includes('Genre'))?.matchedCount).toBe(1);
    expect(any.preview.rules.find((r) => r.label.includes('Resolution'))?.matchedCount).toBe(2);
  });

  it('flags the blocking rule when an AND playlist matches nothing', () => {
    const { preview } = previewDefinition(
      definition({ rules: [rule('genre', 'contains', 'horror'), rule('videoresolution', 'greaterthan', '1080')] }),
      movieRows,
      [],
      []
    );
    expect(preview.totalCount).toBe(0);
    const blocker = preview.rules.find((r) => r.blocking);
    expect(blocker).toBeDefined();
    expect(blocker!.label.toLowerCase()).toContain('horror');
    expect(blocker!.matchedCount).toBe(0);
  });

  it('applies sort order and limit', () => {
    const sorted = previewDefinition(definition({ order: { by: 'runtime', direction: 'descending' } }), movieRows, [], []);
    expect(sorted.preview.items[0].title).toBe('Oppenheimer'); // 181 min

    const limited = previewDefinition(definition({ limit: 2 }), movieRows, [], []);
    expect(limited.preview.totalCount).toBe(2);
    expect(limited.preview.warnings.some((w) => w.includes('Limited to the first 2'))).toBe(true);
  });

  it('warns when a playlist has no rules and therefore matches everything', () => {
    const { preview } = previewDefinition(definition(), movieRows, [], []);
    expect(preview.totalCount).toBe(movieRows.length);
    expect(preview.warnings.some((w) => w.includes('entire library'))).toBe(true);
  });

  it('serialises Kodi v21 .xsp with match, rules, order and limit', () => {
    const xml = serializeSmartPlaylist(
      definition({
        name: '4K & HDR <Sci-Fi>',
        match: 'one',
        rules: [rule('videoresolution', 'greaterthan', '1080'), rule('genre', 'contains', 'Science Fiction')],
        order: { by: 'rating', direction: 'descending' },
        limit: 25,
      })
    );
    expect(xml).toContain('<smartplaylist type="movies">');
    expect(xml).toContain('<name>4K &amp; HDR &lt;Sci-Fi&gt;</name>');
    expect(xml).toContain('<match>one</match>');
    expect(xml).toContain('<rule field="videoresolution" operator="greaterthan">');
    expect(xml).toContain('<order direction="descending">rating</order>');
    expect(xml).toContain('<limit>25</limit>');
    expect(xml.trim().endsWith('</smartplaylist>')).toBe(true);
  });

  it('drops blank rules from the serialised output', () => {
    const xml = serializeSmartPlaylist(definition({ rules: [rule('genre', 'contains', 'drama'), rule('tag', 'is', '')] }));
    expect(xml).toContain('field="genre"');
    expect(xml).not.toContain('field="tag"');
  });

  it('sanitises hostile input instead of throwing', () => {
    const { definition: clean, warnings } = sanitizeDefinition({
      name: '  ',
      type: 'bogus' as never,
      match: 'neither' as never,
      rules: [
        { id: 'a', field: 'notafield', operator: 'is', value: 'x' } as never,
        { id: 'b', field: 'rating', operator: 'greaterthan', value: 'abc' } as never,
        { id: 'c', field: 'season', operator: 'is', value: '1' } as never, // episode-only field
        { id: 'd', field: 'genre', operator: 'greaterthan', value: 'x' } as never, // bad operator
        { id: 'e', field: 'genre', operator: 'contains', value: '  ' } as never, // blank
        { id: 'f', field: 'year', operator: 'greaterthan', value: '2010' } as never,
      ],
      order: { by: 'nonsense', direction: 'up' } as never,
      limit: -3,
    });
    expect(clean.name).toBe('Smart Playlist');
    expect(clean.type).toBe('movies');
    expect(clean.match).toBe('all');
    expect(clean.rules).toHaveLength(1);
    expect(clean.rules[0].field).toBe('year');
    expect(clean.order).toEqual({ by: 'title', direction: 'descending' });
    expect(clean.limit).toBeNull();
    expect(warnings.length).toBeGreaterThanOrEqual(5);
    expect(warnings.join(' ')).toContain('notafield');
  });

  it('builds filesystem-safe Kodi playlist names', () => {
    expect(toKodiPlaylistFileName('4K: Best/Worst <Films>?')).toBe('4K Best Worst Films');
    expect(toKodiPlaylistFileName('   ')).toBe('Smart Playlist');
  });

  it('marks a definition stale when its rules change after export', () => {
    const before = definition({ rules: [rule('rating', 'greaterthan', '7')] });
    const after = definition({ rules: [rule('rating', 'greaterthan', '8')] });
    expect(hashPlaylistDefinition(before)).toBe(hashPlaylistDefinition({ ...before, rules: [...before.rules] }));
    expect(hashPlaylistDefinition(before)).not.toBe(hashPlaylistDefinition(after));
    // Rule order and blank rules must not affect the hash.
    const reordered = definition({ rules: [rule('year', 'greaterthan', '2000'), ...after.rules] });
    expect(hashPlaylistDefinition(reordered)).not.toBe(hashPlaylistDefinition(after));
  });

  it('ships usable presets for every content type', () => {
    const ids = ['top-rated', 'unwatched-4k', 'recently-added', 'in-progress', 'missing-subtitles', 'unwatched-episodes', 'kids-animation', 'continuing-shows'] as const;
    for (const id of ids) {
      const preset = presetDefinition(id)!;
      expect(preset.rules.length).toBeGreaterThan(0);
      // Every preset rule must be valid for its playlist type.
      const { definition: clean } = sanitizeDefinition(preset);
      expect(clean.rules).toHaveLength(preset.rules.length);
    }
    // Presets all produce at least one match against this fixture library.
    for (const id of ids) {
      const preset = presetDefinition(id)!;
      const { preview } = previewDefinition(preset, movieRows, db.listAllEpisodes(), db.listTvShows(), 3);
      if (id === 'top-rated' || id === 'in-progress' || id === 'kids-animation') {
        expect(preview.totalCount, `${id} should match something`).toBeGreaterThan(0);
      }
    }
  });

  it('evaluates episode playlists against show metadata and episode numbers', () => {
    const sourceId = db.listSources()[0].id;
    const show = db.upsertTvShow({
      sourceId,
      folderPath: '/tmp/kv-playlist-tv/Andor',
      nfoPath: null,
      hasNfo: false,
      nfoValid: false,
      nfoWarnings: [],
      scraped: true,
      scrapedSource: 'tmdb',
      title: 'Andor',
      originalTitle: 'Andor',
      sortTitle: 'Andor',
      year: 2022,
      premiered: '2022-09-21',
      status: 'Continuing',
      plot: 'Rebel spy thriller.',
      mpaa: 'TV-14',
      studio: 'Disney+',
      genres: ['Drama'],
      tags: [],
      actors: [],
      episodeOrder: 'aired',
      uniqueIds: {},
      ratings: [],
      userRating: null,
      dateAdded: new Date().toISOString(),
      artwork: { ...EMPTY_ARTWORK },
      updatedAt: new Date().toISOString(),
    });
    const mk = (episodeNumber: number, watched: boolean) =>
      db.upsertTvEpisode({
        showId: show.id,
        seasonNumber: 1,
        episodeNumber,
        displaySeason: null,
        displayEpisode: null,
        multiEpisodeEnd: null,
        multiEpisodeParts: [],
        folderPath: '/tmp/kv-playlist-tv/Andor/S01',
        filePath: `/tmp/kv-playlist-tv/Andor/S01/E${episodeNumber}.mkv`,
        fileName: `E${episodeNumber}.mkv`,
        fileSizeBytes: 1000,
        movieHash: null,
        nfoPath: null,
        hasNfo: false,
        nfoValid: false,
        nfoWarnings: [],
        scraped: true,
        title: `Episode ${episodeNumber}`,
        showTitle: 'Andor',
        aired: '2022-09-21',
        plot: '',
        runtimeMinutes: 45,
        directors: [],
        writers: [],
        actors: [],
        uniqueIds: {},
        ratings: [],
        userRating: null,
        playCount: watched ? 1 : 0,
        watched,
        lastPlayed: null,
        thumbPath: null,
        streamDetails: {
          video: [{ codec: 'HEVC', height: 1080, width: 1920, aspect: '1.78', durationSeconds: 2700 }],
          audio: [],
          subtitle: [],
        },
        parsedInfo: {
          cleanTitle: `Episode ${episodeNumber}`,
          year: 2022,
          mediaKind: 'episode',
          seasonNumber: 1,
          episodeNumber,
          multiEpisodeEnd: null,
          resolution: '1080p',
          source: null,
          videoCodec: null,
          audioCodec: null,
          audioChannels: null,
          hdr: null,
          edition: null,
          releaseGroup: null,
        },
      });
    mk(1, true);
    mk(2, false);
    mk(3, false);

    const eps = db.listAllEpisodes();
    const shows = db.listTvShows();
    const unwatched = previewDefinition(presetDefinition('unwatched-episodes')!, [], eps, shows);
    expect(unwatched.preview.totalCount).toBe(2);
    expect(unwatched.preview.items.map((i) => i.title)).toEqual(['S01E02 — Episode 2', 'S01E03 — Episode 3']);

    const byShow = previewDefinition(
      definition({ type: 'episodes', rules: [rule('tvshowtitle', 'is', 'andor'), rule('studio', 'is', 'Disney+')] }),
      [],
      eps,
      shows
    );
    expect(byShow.preview.totalCount).toBe(3);

    const continuing = previewDefinition(presetDefinition('continuing-shows')!, [], eps, shows);
    expect(continuing.preview.totalCount).toBe(1);
  });
});

describe('Smart playlist API', () => {
  let db: MediaDatabase;
  let app: ReturnType<typeof createApiApp>;
  let tmpDir: string;

  beforeEach(() => {
    db = new MediaDatabase(':memory:');
    app = createApiApp(db);
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-playlists-'));
    const source = db.addSource({ name: 'Movies', path: tmpDir, mediaKind: 'movie' });
    for (const [title, height, playCount] of [
      ['Dune', 2160, 0],
      ['Arrival', 1080, 1],
      ['Parasite', 2160, 1],
    ] as const) {
      db.upsertMovie(
        makeMovieRecord(source.id, tmpDir, {
          title,
          height,
          codec: 'HEVC',
          genres: ['Science Fiction'],
          playCount,
          watched: playCount > 0,
        })
      );
    }
  });

  it('serves the field catalogue and presets', async () => {
    const fieldsRes = await request(app).get('/api/playlists/fields').expect(200);
    expect(fieldsRes.body.fields.some((f: { field: string }) => f.field === 'videoresolution')).toBe(true);

    const presetsRes = await request(app).get('/api/playlists/presets').expect(200);
    expect(presetsRes.body.presets.length).toBeGreaterThan(5);

    const presetRes = await request(app).get('/api/playlists/presets/unwatched-4k').expect(200);
    expect(presetRes.body.definition.type).toBe('movies');
    await request(app).get('/api/playlists/presets/nope').expect(404);
  });

  it('previews a draft definition with live counts and diagnostics', async () => {
    const res = await request(app)
      .post('/api/playlists/preview')
      .send({
        definition: {
          name: 'Unwatched 4K',
          type: 'movies',
          match: 'all',
          rules: [
            { id: 'a', field: 'videoresolution', operator: 'greaterthan', value: '1080' },
            { id: 'b', field: 'playcount', operator: 'is', value: '0' },
          ],
          order: { by: 'title', direction: 'ascending' },
        },
      })
      .expect(200);
    expect(res.body.matchedCount).toBe(1);
    expect(res.body.preview.items[0].title).toBe('Dune');
    expect(res.body.preview.kodiFileName).toBe('Unwatched 4K');
    expect(res.body.preview.xml).toContain('<match>all</match>');
    expect(res.body.preview.rules).toHaveLength(2);
  });

  it('keeps the legacy /api/export/smartplaylist endpoint working', async () => {
    const res = await request(app)
      .post('/api/export/smartplaylist')
      .send({ name: '4K Sci-Fi', type: 'movies', genre: 'Science Fiction', resolution: '2160p' })
      .expect(200);
    expect(res.body.xml).toContain('<smartplaylist type="movies">');
    expect(res.body.xml).toContain('field="genre"');
    expect(res.body.xml).toContain('field="videoresolution"');
  });

  it('creates, lists, updates, duplicates and deletes saved playlists with stale tracking', async () => {
    const created = await request(app)
      .post('/api/playlists')
      .send({ name: 'My 4K', type: 'movies', match: 'all', rules: [{ id: 'a', field: 'videoresolution', operator: 'greaterthan', value: '1080' }] })
      .expect(201);
    const id = created.body.playlist.id as number;
    expect(created.body.playlist.stale).toBe(false);

    const list = await request(app).get('/api/playlists').expect(200);
    expect(list.body.playlists).toHaveLength(1);
    expect(list.body.playlists[0].lastKnownCount).toBe(2);

    const single = await request(app).get(`/api/playlists/${id}`).expect(200);
    expect(single.body.playlist.name).toBe('My 4K');

    // Editing the rules after an export must flip the stale flag.
    await request(app)
      .put(`/api/playlists/${id}`)
      .send({ name: 'My 4K', type: 'movies', match: 'all', rules: [{ id: 'a', field: 'playcount', operator: 'is', value: '0' }] })
      .expect(200);
    db.markSmartPlaylistExported(id, 1);
    const fresh = await request(app).get(`/api/playlists/${id}`).expect(200);
    expect(fresh.body.playlist.stale).toBe(false);

    await request(app).get(`/api/playlists/${id}`).expect(200);
    const dup = await request(app).post(`/api/playlists/${id}/duplicate`).expect(201);
    expect(dup.body.playlist.name).toBe('My 4K (copy)');
    expect(dup.body.playlist.id).not.toBe(id);

    await request(app).delete(`/api/playlists/${id}`).expect(200);
    await request(app).get(`/api/playlists/${id}`).expect(404);
    await request(app).delete(`/api/playlists/${id}`).expect(404);
  });

  it('downloads a saved playlist as an .xsp attachment', async () => {
    const created = await request(app)
      .post('/api/playlists')
      .send({ name: 'Download Me', type: 'movies', rules: [{ id: 'a', field: 'rating', operator: 'greaterthan', value: '5' }] })
      .expect(201);
    const id = created.body.playlist.id as number;

    const res = await request(app).get(`/api/playlists/${id}/download`).expect(200);
    expect(res.headers['content-disposition']).toContain('Download Me.xsp');
    expect(res.headers['content-type']).toContain('xml');
    expect(res.text).toContain('<smartplaylist type="movies">');

    const after = await request(app).get(`/api/playlists/${id}`).expect(200);
    expect(after.body.playlist.stale).toBe(false);
    expect(after.body.playlist.lastExportedAt).not.toBeNull();
  });

  it('reports a clear error when Kodi is unreachable and no profile mapping exists', async () => {
    const created = await request(app)
      .post('/api/playlists')
      .send({ name: 'Push Me', type: 'movies', rules: [{ id: 'a', field: 'rating', operator: 'greaterthan', value: '5' }] })
      .expect(201);
    const id = created.body.playlist.id as number;

    const res = await request(app).post(`/api/playlists/${id}/push`).expect(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toContain('special://profile');
    expect(res.body.xml).toContain('<smartplaylist');
  }, 20_000);

  it('falls back to a mapped local profile folder when Kodi is offline', async () => {
    const profileDir = fs.mkdtempSync(path.join(tmpDir, 'profile-'));
    db.setSetting('kodi_rpc', {
      ...db.getSetting('kodi_rpc', {}),
      host: '127.0.0.1',
      port: 9,
      pathMappings: [{ localPrefix: profileDir, kodiPrefix: 'special://profile' }],
    });
    const created = await request(app)
      .post('/api/playlists')
      .send({ name: 'Local Push', type: 'movies', rules: [{ id: 'a', field: 'year', operator: 'greaterthan', value: '1900' }] })
      .expect(201);

    const res = await request(app).post(`/api/playlists/${created.body.playlist.id}/push`).expect(200);
    expect(res.body.method).toBe('local-file');
    const written = path.join(profileDir, 'playlists', 'video', 'Local Push.xsp');
    expect(fs.existsSync(written)).toBe(true);
    expect(fs.readFileSync(written, 'utf8')).toContain('<smartplaylist type="movies">');
  }, 20_000);

  it('scopes saved playlists per content type', async () => {
    const res = await request(app)
      .post('/api/playlists')
      .send({ name: 'Films Only', type: 'movies', rules: [{ id: 'a', field: 'genre', operator: 'contains', value: 'science fiction' }] })
      .expect(201);
    const preview = await request(app).post(`/api/playlists/${res.body.playlist.id}/preview`).send({}).expect(200);
    expect(preview.body.matchedCount).toBe(3);

    // An episode-only field in a movie playlist is rejected with a warning.
    const bad = await request(app)
      .post('/api/playlists')
      .send({ name: 'Bad', type: 'movies', rules: [{ id: 'a', field: 'season', operator: 'is', value: '1' }] })
      .expect(201);
    expect(bad.body.validationWarnings.join(' ')).toContain('does not apply to movies');
    expect(bad.body.playlist.rules).toHaveLength(0);
  });
});
