import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApiApp } from '../src/server/app.js';
import { MediaDatabase } from '../src/server/db/database.js';
import { buildLibraryVocabulary } from '../src/server/library/vocabulary.js';
import { matchSuggestions, splitHighlight } from '../src/client/lib/tagSuggest.js';
import type { ArtworkKind, LibraryVocabulary, MovieRecord, VocabularyTerm } from '../src/shared/types.js';

const term = (value: string, count = 1, mediaTypes: Array<'movie' | 'tvshow'> = ['movie']): VocabularyTerm => ({
  value,
  count,
  mediaTypes,
});

const VOCAB: VocabularyTerm[] = [
  term('4K HDR', 9),
  term('4K SDR', 3),
  term('Dolby Atmos', 6),
  term('Dolby Vision', 7),
  term('Director Cut', 2),
  term('IMAX', 5),
  term('Favorites', 12),
  term('neo-noir', 4),
  term('Space Opera', 3),
  term('anime', 8),
  term('HDR10+', 2),
];

describe('Tag suggestion matching', () => {
  it('returns the whole vocabulary when nothing is typed, most used first', () => {
    const out = matchSuggestions(VOCAB, '', [], 100);
    expect(out).toHaveLength(VOCAB.length);
    expect(out[0].term.value).toBe('Favorites'); // count 12
    expect(out[1].term.value).toBe('4K HDR'); // count 9
  });

  it('narrows as more letters are typed', () => {
    const one = matchSuggestions(VOCAB, 'd');
    const two = matchSuggestions(VOCAB, 'do');
    const three = matchSuggestions(VOCAB, 'dol');
    expect(one.length).toBeGreaterThan(two.length);
    expect(two.length).toBeGreaterThanOrEqual(three.length);
    expect(three.map((m) => m.term.value).sort()).toEqual(['Dolby Atmos', 'Dolby Vision']);
  });

  it('prefers prefix matches over substring matches', () => {
    const out = matchSuggestions(VOCAB, 'hdr');
    // "HDR10+" starts with the query; "4K HDR" only matches at a word boundary.
    expect(out[0].term.value).toBe('HDR10+');
    expect(out[0].matchAt).toBe('start');
    expect(out.find((m) => m.term.value === '4K HDR')?.matchAt).toBe('word');
  });

  it('ranks word-boundary hits above loose substrings', () => {
    // "atmo" follows a space in "Dolby Atmos" -> word boundary, not mid-word.
    const word = matchSuggestions(VOCAB, 'atmo');
    expect(word.map((m) => m.term.value)).toEqual(['Dolby Atmos']);
    expect(word[0].matchAt).toBe('word');

    // "e-no" spans inside "neo-noir" (preceded by a letter) -> substring rank.
    const sub = matchSuggestions(VOCAB, 'eo-no');
    expect(sub.map((m) => m.term.value)).toEqual(['neo-noir']);
    expect(sub[0].matchAt).toBe('substring');
  });

  it('treats hyphenated and spaced terms as word boundaries', () => {
    expect(matchSuggestions(VOCAB, 'noir').map((m) => m.term.value)).toContain('neo-noir');
    expect(matchSuggestions(VOCAB, 'opera').map((m) => m.term.value)).toContain('Space Opera');
  });

  it('is case-insensitive both ways', () => {
    expect(matchSuggestions(VOCAB, 'ima').map((m) => m.term.value)).toContain('IMAX');
    expect(matchSuggestions(VOCAB, 'FAV').map((m) => m.term.value)).toContain('Favorites');
    // Typing a term out in full is an exact match, so it is suppressed rather than
    // offered as a no-op suggestion (the user can still press Enter to add it).
    expect(matchSuggestions(VOCAB, 'imax').map((m) => m.term.value)).not.toContain('IMAX');
  });

  it('never offers a term that is already on the record', () => {
    const out = matchSuggestions(VOCAB, '4k', ['4K HDR']);
    expect(out.map((m) => m.term.value)).toEqual(['4K SDR']);
  });

  it('suppresses an exact duplicate of what was typed', () => {
    expect(matchSuggestions(VOCAB, 'IMAX').map((m) => m.term.value)).not.toContain('IMAX');
  });

  it('works without a vocabulary by falling back to static starters', () => {
    // The component merges static starters in; here we assert the pure matcher
    // still handles plain values wrapped as zero-count terms.
    const starters = [term('Atmos', 0, []), term('IMAX', 0, [])];
    expect(matchSuggestions(starters, 'at').map((m) => m.term.value)).toEqual(['Atmos']);
  });

  it('breaks ties alphabetically so ordering is stable', () => {
    const flat = [term('Zeta', 2), term('Alpha', 2), term('Mike', 2)];
    expect(matchSuggestions(flat, '').map((m) => m.term.value)).toEqual(['Alpha', 'Mike', 'Zeta']);
  });

  it('respects the limit', () => {
    expect(matchSuggestions(VOCAB, '', [], 3)).toHaveLength(3);
  });

  it('splits a value for highlighting', () => {
    expect(splitHighlight('4K HDR', 'hdr')).toEqual({ before: '4K ', hit: 'HDR', after: '' });
    expect(splitHighlight('Dolby Atmos', 'atmo')).toEqual({ before: 'Dolby ', hit: 'Atmo', after: 's' });
    expect(splitHighlight('IMAX', '')).toEqual({ before: '', hit: '', after: 'IMAX' });
    expect(splitHighlight('IMAX', 'zzz')).toEqual({ before: '', hit: '', after: 'IMAX' });
  });
});

describe('Library vocabulary', () => {
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

  const movie = (overrides: Partial<MovieRecord> & { id: number; title: string }): MovieRecord =>
    ({
      sourceId: 1,
      folderPath: `/m/${overrides.id}`,
      filePath: `/m/${overrides.id}/f.mkv`,
      fileName: 'f.mkv',
      fileSizeBytes: 1,
      movieHash: null,
      nfoPath: null,
      hasNfo: false,
      nfoValid: false,
      nfoWarnings: [],
      scraped: true,
      scrapedSource: null,
      originalTitle: overrides.title,
      sortTitle: overrides.title,
      year: 2020,
      premiered: null,
      tagline: '',
      plot: '',
      outline: '',
      runtimeMinutes: 100,
      mpaa: '',
      country: '',
      studios: [],
      genres: [],
      tags: [],
      directors: [],
      writers: [],
      actors: [],
      trailerUrl: '',
      setId: null,
      setName: null,
      setOverview: null,
      uniqueIds: {},
      ratings: [],
      userRating: null,
      playCount: 0,
      watched: false,
      lastPlayed: null,
      dateAdded: '2026-01-01T00:00:00.000Z',
      artwork: { ...EMPTY_ARTWORK },
      streamDetails: { video: [], audio: [], subtitle: [] },
      subtitles: [],
      parsedInfo: {
        cleanTitle: overrides.title,
        year: 2020,
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
      },
      updatedAt: new Date().toISOString(),
      ...overrides,
    }) as MovieRecord;

  it('counts tags across media types and records where they came from', () => {
    const vocab: LibraryVocabulary = buildLibraryVocabulary(
      [
        movie({ id: 1, title: 'A', tags: ['Atmos', '4K'] }),
        movie({ id: 2, title: 'B', tags: ['atmos', 'IMAX'] }),
        movie({ id: 3, title: 'C', tags: ['ATMOS'] }),
      ],
      []
    );
    const atmos = vocab.tags.find((t) => t.value.toLowerCase() === 'atmos')!;
    expect(atmos.count).toBe(3);
    // Casing is preserved from the best-looking occurrence, not lowercased.
    expect(atmos.value).toBe('ATMOS');
  });

  it('dedupes case-insensitively rather than creating duplicate tags', () => {
    const vocab = buildLibraryVocabulary(
      [movie({ id: 1, title: 'A', tags: ['Favorites', 'favorites', 'FAVORITES'] })],
      []
    );
    expect(vocab.tags).toHaveLength(1);
    expect(vocab.tags[0].count).toBe(3);
  });

  it('sorts by usage then alphabetically and skips blanks', () => {
    const vocab = buildLibraryVocabulary(
      [movie({ id: 1, title: 'A', tags: ['rare', 'common', '', '   ', 'common', 'alpha'] })],
      []
    );
    expect(vocab.tags.map((t) => t.value)).toEqual(['common', 'alpha', 'rare']);
  });

  it('collects genres, studios, directors and writers too', () => {
    const vocab = buildLibraryVocabulary(
      [
        movie({
          id: 1,
          title: 'A',
          genres: ['Drama'],
          studios: ['A24'],
          directors: ['Denis Villeneuve'],
          writers: ['Jon Spaihts'],
        }),
      ],
      [
        {
          id: 9,
          title: 'Show',
          studio: 'HBO',
          genres: ['Drama'],
          tags: ['Prestige'],
          actors: [],
        } as never,
      ]
    );
    expect(vocab.genres.find((g) => g.value === 'Drama')?.count).toBe(2);
    expect(vocab.genres.find((g) => g.value === 'Drama')?.mediaTypes.sort()).toEqual(['movie', 'tvshow']);
    expect(vocab.studios.map((s) => s.value).sort()).toEqual(['A24', 'HBO']);
    expect(vocab.directors[0].value).toBe('Denis Villeneuve');
    expect(vocab.writers[0].value).toBe('Jon Spaihts');
    expect(vocab.tags[0].value).toBe('Prestige');
    expect(vocab.tags[0].mediaTypes).toEqual(['tvshow']);
  });

  it('returns empty arrays for an empty library', () => {
    const vocab = buildLibraryVocabulary([], []);
    expect(vocab).toEqual({ tags: [], genres: [], studios: [], directors: [], writers: [] });
  });
});

describe('GET /api/library/vocabulary', () => {
  let db: MediaDatabase;
  let app: ReturnType<typeof createApiApp>;
  let tmpDir: string;

  beforeEach(() => {
    db = new MediaDatabase(':memory:');
    app = createApiApp(db);
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-vocab-'));
  });

  it('serves tag counts harvested from saved media', async () => {
    const source = db.addSource({ name: 'Movies', path: tmpDir, mediaKind: 'movie' });
    const m = db.upsertMovie({
      sourceId: source.id,
      folderPath: path.join(tmpDir, 'Dune'),
      filePath: path.join(tmpDir, 'Dune', 'Dune.mkv'),
      fileName: 'Dune.mkv',
      fileSizeBytes: 1,
      movieHash: null,
      nfoPath: null,
      hasNfo: false,
      nfoValid: false,
      nfoWarnings: [],
      scraped: true,
      scrapedSource: null,
      title: 'Dune',
      originalTitle: 'Dune',
      sortTitle: 'Dune',
      year: 2021,
      premiered: null,
      tagline: '',
      plot: '',
      outline: '',
      runtimeMinutes: 155,
      mpaa: '',
      country: '',
      studios: ['Legendary Pictures'],
      genres: ['Science Fiction'],
      tags: ['epic', 'desert'],
      directors: ['Denis Villeneuve'],
      writers: ['Jon Spaihts'],
      actors: [],
      trailerUrl: '',
      setId: null,
      uniqueIds: {},
      ratings: [],
      userRating: null,
      playCount: 0,
      watched: false,
      lastPlayed: null,
      dateAdded: new Date().toISOString(),
      artwork: { poster: null, fanart: null, banner: null, clearlogo: null, clearart: null, disc: null, landscape: null, thumb: null },
      streamDetails: { video: [], audio: [], subtitle: [] },
      parsedInfo: {
        cleanTitle: 'Dune',
        year: 2021,
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
      },
      subtitles: [],
      updatedAt: new Date().toISOString(),
    } as never);
    expect(m.id).toBeGreaterThan(0);

    const res = await request(app).get('/api/library/vocabulary').expect(200);
    expect(res.body.tags.map((t: VocabularyTerm) => t.value)).toEqual(['desert', 'epic']);
    expect(res.body.genres[0].value).toBe('Science Fiction');
    expect(res.body.studios[0].value).toBe('Legendary Pictures');
    expect(res.body.directors[0].value).toBe('Denis Villeneuve');
    // The whole payload must feed straight into matchSuggestions.
    expect(matchSuggestions(res.body.tags, 'ep').map((m) => m.term.value)).toEqual(['epic']);
  });

  it('serves an empty vocabulary for a fresh database', async () => {
    const res = await request(app).get('/api/library/vocabulary').expect(200);
    expect(res.body).toEqual({ tags: [], genres: [], studios: [], directors: [], writers: [] });
  });

  it('reflects newly saved tags immediately', async () => {
    const source = db.addSource({ name: 'Movies', path: tmpDir, mediaKind: 'movie' });
    const m = db.upsertMovie({
      sourceId: source.id,
      folderPath: path.join(tmpDir, 'A'),
      filePath: path.join(tmpDir, 'A', 'A.mkv'),
      fileName: 'A.mkv',
      fileSizeBytes: 1,
      movieHash: null,
      nfoPath: null,
      hasNfo: false,
      nfoValid: false,
      nfoWarnings: [],
      scraped: true,
      scrapedSource: null,
      title: 'A',
      originalTitle: 'A',
      sortTitle: 'A',
      year: 2020,
      premiered: null,
      tagline: '',
      plot: '',
      outline: '',
      runtimeMinutes: 100,
      mpaa: '',
      country: '',
      studios: [],
      genres: [],
      tags: ['Atmos'],
      directors: [],
      writers: [],
      actors: [],
      trailerUrl: '',
      setId: null,
      uniqueIds: {},
      ratings: [],
      userRating: null,
      playCount: 0,
      watched: false,
      lastPlayed: null,
      dateAdded: new Date().toISOString(),
      artwork: { poster: null, fanart: null, banner: null, clearlogo: null, clearart: null, disc: null, landscape: null, thumb: null },
      streamDetails: { video: [], audio: [], subtitle: [] },
      parsedInfo: {
        cleanTitle: 'A',
        year: 2020,
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
      },
      subtitles: [],
      updatedAt: new Date().toISOString(),
    } as never);

    expect((await request(app).get('/api/library/vocabulary')).body.tags.map((t: VocabularyTerm) => t.value)).toEqual(['Atmos']);

    db.updateMovie(m.id, { tags: ['Atmos', 'IMAX'] } as never);
    expect((await request(app).get('/api/library/vocabulary')).body.tags.map((t: VocabularyTerm) => t.value).sort()).toEqual([
      'Atmos',
      'IMAX',
    ]);
  });
});
