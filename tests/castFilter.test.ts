import { describe, expect, it } from 'vitest';
import type {
  ArtworkKind,
  MovieRecord,
  MovieSetRecord,
  ParsedFilenameInfo,
  TvEpisodeRecord,
  TvSeasonRecord,
  TvShowRecord,
} from '../src/shared/types.js';
import {
  filterMoviesByActorAndQuery,
  filterSetsByActorAndQuery,
  filterShowTreeByActorAndQuery,
  findActorMatch,
} from '../src/client/lib/castFilter.js';
import type { ShowTreeNode } from '../src/client/lib/workspaceTypes.js';

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

function makeParsed(
  cleanTitle: string,
  mediaKind: 'movie' | 'episode',
  seasonNumber: number | null = null,
  episodeNumber: number | null = null
): ParsedFilenameInfo {
  return {
    cleanTitle,
    year: 2024,
    mediaKind,
    seasonNumber,
    episodeNumber,
    multiEpisodeEnd: null,
    resolution: '1080p',
    source: 'WEB-DL',
    videoCodec: 'H265',
    audioCodec: 'EAC3',
    audioChannels: 6,
    hdr: null,
    edition: null,
    releaseGroup: null,
  };
}

function makeMovie(id: number, title: string, actors: Array<{ name: string; role: string }>): MovieRecord {
  return {
    id,
    sourceId: 1,
    folderPath: `/media/movies/${title}`,
    filePath: `/media/movies/${title}.mkv`,
    fileName: `${title}.mkv`,
    fileSizeBytes: 1000,
    movieHash: '0000000000000000',
    nfoPath: `/media/movies/${title}.nfo`,
    hasNfo: true,
    nfoValid: true,
    nfoWarnings: [],
    scraped: true,
    scrapedSource: 'tmdb',
    title,
    originalTitle: title,
    sortTitle: title,
    year: 2024,
    premiered: '2024-01-01',
    tagline: '',
    plot: '',
    outline: '',
    runtimeMinutes: 120,
    mpaa: 'PG-13',
    country: 'USA',
    studios: [],
    genres: [],
    tags: [],
    directors: [],
    writers: [],
    actors: actors.map((a, order) => ({ ...a, order })),
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
    dateAdded: '2024-01-01',
    artwork: { ...EMPTY_ARTWORK },
    streamDetails: { video: [], audio: [], subtitle: [] },
    subtitles: [],
    parsedInfo: makeParsed(title, 'movie'),
    updatedAt: '2024-01-01',
  };
}

function makeShowNode(
  id: number,
  title: string,
  showActors: Array<{ name: string; role: string }>,
  episodes: Array<{ id: number; seasonNumber: number; episodeNumber: number; title: string; actors?: Array<{ name: string; role: string }> }>
): ShowTreeNode {
  const show: TvShowRecord = {
    id,
    sourceId: 2,
    folderPath: `/media/tv/${title}`,
    nfoPath: `/media/tv/${title}/tvshow.nfo`,
    hasNfo: true,
    nfoValid: true,
    nfoWarnings: [],
    scraped: true,
    scrapedSource: 'tmdb',
    title,
    originalTitle: title,
    sortTitle: title,
    year: 2023,
    premiered: '2023-05-05',
    status: 'Continuing',
    plot: '',
    mpaa: 'TV-MA',
    studio: 'Apple TV+',
    genres: [],
    tags: [],
    actors: showActors.map((a, order) => ({ ...a, order })),
    episodeOrder: 'aired',
    uniqueIds: {},
    ratings: [],
    userRating: null,
    dateAdded: '2023-05-05',
    artwork: { ...EMPTY_ARTWORK },
    seasonsCount: 2,
    episodesCount: episodes.length,
    watchedEpisodesCount: 0,
    missingSubtitlesCount: 0,
    missingNfoCount: 0,
    updatedAt: '2023-05-05',
  };

  const seasonNumbers = Array.from(new Set(episodes.map((e) => e.seasonNumber))).sort((a, b) => a - b);
  const seasons: TvSeasonRecord[] = seasonNumbers.map((seasonNumber, i) => ({
    id: id * 100 + i,
    showId: id,
    seasonNumber,
    name: `Season ${seasonNumber}`,
    overview: '',
    folderPath: `/media/tv/${title}/Season ${seasonNumber}`,
    nfoPath: null,
    hasNfo: false,
    posterPath: null,
    bannerPath: null,
    episodesCount: episodes.filter((ep) => ep.seasonNumber === seasonNumber).length,
  }));

  const epRecords: TvEpisodeRecord[] = episodes.map((e) => ({
    id: e.id,
    showId: id,
    seasonNumber: e.seasonNumber,
    episodeNumber: e.episodeNumber,
    displaySeason: null,
    displayEpisode: null,
    multiEpisodeEnd: null,
    folderPath: `/media/tv/${title}/Season ${e.seasonNumber}`,
    filePath: `/media/tv/${title}/S0${e.seasonNumber}E0${e.episodeNumber}.mkv`,
    fileName: `S0${e.seasonNumber}E0${e.episodeNumber}.mkv`,
    fileSizeBytes: 500,
    movieHash: '0000000000000000',
    nfoPath: `/media/tv/${title}/S0${e.seasonNumber}E0${e.episodeNumber}.nfo`,
    hasNfo: true,
    nfoValid: true,
    nfoWarnings: [],
    scraped: true,
    title: e.title,
    showTitle: title,
    aired: '2023-05-05',
    plot: '',
    runtimeMinutes: 45,
    directors: [],
    writers: [],
    actors: (e.actors ?? []).map((a, order) => ({ ...a, order })),
    uniqueIds: {},
    ratings: [],
    userRating: null,
    playCount: 0,
    watched: false,
    lastPlayed: null,
    thumbPath: null,
    streamDetails: { video: [], audio: [], subtitle: [] },
    subtitles: [],
    parsedInfo: makeParsed(e.title, 'episode', e.seasonNumber, e.episodeNumber),
  }));

  return { show, seasons, episodes: epRecords };
}

describe('castFilter cross-library cast & role filtering', () => {
  const movies: MovieRecord[] = [
    makeMovie(1, 'Dune', [
      { name: 'Timothee Chalamet', role: 'Paul Atreides' },
      { name: 'Rebecca Ferguson', role: 'Lady Jessica' },
    ]),
    makeMovie(2, 'Mission Impossible: Fallout', [
      { name: 'Tom Cruise', role: 'Ethan Hunt' },
      { name: 'Rebecca Ferguson', role: 'Ilsa Faust' },
    ]),
    makeMovie(3, 'Blade Runner 2049', [{ name: 'Ryan Gosling', role: 'K' }]),
  ];

  const showTree: ShowTreeNode[] = [
    makeShowNode(
      10,
      'Silo',
      [{ name: 'Rebecca Ferguson', role: 'Juliette Nichols' }],
      [
        { id: 101, seasonNumber: 1, episodeNumber: 1, title: 'Freedom Day' },
        { id: 102, seasonNumber: 1, episodeNumber: 2, title: "Holston's Pick" },
      ]
    ),
    makeShowNode(
      20,
      'Severance',
      [{ name: 'Adam Scott', role: 'Mark Scout' }],
      [
        { id: 201, seasonNumber: 1, episodeNumber: 1, title: 'Good News About Hell' },
        {
          id: 202,
          seasonNumber: 2,
          episodeNumber: 3,
          title: 'Who Is Alive?',
          actors: [{ name: 'Rebecca Ferguson', role: 'Mystery Guest' }],
        },
      ]
    ),
  ];

  it('filters movies by exact cast name (case-insensitive) and resolves character role context', () => {
    const matches = filterMoviesByActorAndQuery(movies, 'rebecca ferguson', '');
    expect(matches.map((m) => m.title)).toEqual(['Dune', 'Mission Impossible: Fallout']);
    expect(findActorMatch(matches[0].actors, 'Rebecca Ferguson')?.role).toBe('Lady Jessica');
    expect(findActorMatch(matches[1].actors, 'Rebecca Ferguson')?.role).toBe('Ilsa Faust');
  });

  it('matches both series cast and episode-only guest stars in TV shows and scopes guest-only trees', () => {
    const results = filterShowTreeByActorAndQuery(showTree, 'Rebecca Ferguson', '');
    expect(results).toHaveLength(2);

    // Silo matches at series level -> preserves all seasons & episodes
    expect(results[0].node.show.title).toBe('Silo');
    expect(results[0].showActorMatch?.role).toBe('Juliette Nichols');
    expect(results[0].guestEpisodeMatchCount).toBe(0);
    expect(results[0].node.episodes).toHaveLength(2);

    // Severance matches only via S02E03 guest credit -> scopes seasons/episodes directly to S02E03
    expect(results[1].node.show.title).toBe('Severance');
    expect(results[1].showActorMatch).toBeNull();
    expect(results[1].guestEpisodeMatchCount).toBe(1);
    expect(results[1].node.seasons.map((s) => s.seasonNumber)).toEqual([2]);
    expect(results[1].node.episodes.map((e) => e.title)).toEqual(['Who Is Alive?']);
    expect(findActorMatch(results[1].node.episodes[0].actors, 'Rebecca Ferguson')?.role).toBe('Mystery Guest');
  });

  it('supports actor matching inside sidebar text search and actor: prefix', () => {
    expect(filterMoviesByActorAndQuery(movies, null, 'Gosling').map((m) => m.title)).toEqual(['Blade Runner 2049']);
    expect(filterMoviesByActorAndQuery(movies, null, 'actor:Ilsa Faust').map((m) => m.title)).toEqual([
      'Mission Impossible: Fallout',
    ]);
    expect(filterShowTreeByActorAndQuery(showTree, null, 'actor:Mystery Guest').map((r) => r.node.show.title)).toEqual([
      'Severance',
    ]);
  });

  it('filters movie sets and nested movies by active actor filter', () => {
    const sets: MovieSetRecord[] = [
      {
        id: 1,
        name: 'Sci-Fi Collection',
        overview: '',
        posterPath: null,
        fanartPath: null,
        clearlogoPath: null,
        movies: [movies[0], movies[2]],
      },
      {
        id: 2,
        name: 'Action Classics',
        overview: '',
        posterPath: null,
        fanartPath: null,
        clearlogoPath: null,
        movies: [movies[2]],
      },
    ];
    const filtered = filterSetsByActorAndQuery(sets, 'Rebecca Ferguson', '');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('Sci-Fi Collection');
    expect(filtered[0].movies.map((m) => m.title)).toEqual(['Dune']);
  });
});
