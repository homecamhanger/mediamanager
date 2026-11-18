/**
 * Seeds a detail panel from data the list already has.
 *
 * When you click a list item, the panel should immediately show *that* item —
 * its title, year, poster — even before its full record arrives. Previously it kept
 * rendering the previously selected item until the fetch resolved, which reads as
 * the app lagging a beat behind every click.
 *
 * A seed is intentionally sparse: it fills the header and artwork, and the full
 * record replaces it moments later. Anything it cannot know is left absent rather
 * than guessed, so the UI shows a placeholder instead of wrong information.
 */

import type {
  MovieListEntry,
  MovieRecord,
  TvEpisodeRecord,
  TvShowRecord,
} from '../../shared/types.js';
import type { ShowTreeNode } from './workspaceTypes.js';

/**
 * A movie record good enough to paint a header.
 *
 * `null`-filled rather than fabricated: the panel checks `movie.id` and renders
 * fields it has, so a partially known record is safe and honest.
 */
export function seedMovieFromList(entry: MovieListEntry): MovieRecord {
  return {
    id: entry.id,
    title: entry.title,
    sortTitle: entry.sortTitle,
    originalTitle: entry.originalTitle,
    year: entry.year,
    fileName: entry.fileName,
    filePath: '',
    folderPath: '',
    fileSizeBytes: 0,
    movieHash: '',
    nfoPath: null,
    hasNfo: entry.hasNfo,
    nfoValid: entry.nfoValid,
    nfoWarnings: [],
    scraped: entry.scraped,
    scrapedSource: null,
    premiered: null,
    plot: '',
    tagline: '',
    outline: '',
    trailerUrl: '',
    runtimeMinutes: entry.runtimeMinutes,
    mpaa: '',
    country: '',
    studios: [],
    genres: entry.genres,
    tags: entry.tags,
    directors: [],
    writers: [],
    actors: entry.actors.map((a) => ({ name: a.name, role: a.role, order: 0 })),
    ratings: entry.ratings,
    uniqueIds: {},
    userRating: entry.userRating,
    playCount: 0,
    watched: entry.watched,
    lastPlayed: null,
    dateAdded: entry.dateAdded,
    updatedAt: entry.updatedAt,
    setId: entry.setId,
    setName: entry.setName,
    setOverview: null,
    sourceId: 0,
    artwork: {
      poster: entry.poster,
      fanart: entry.fanart,
      banner: null,
      clearlogo: null,
      clearart: null,
      disc: null,
      landscape: null,
      thumb: null,
    },
    artworkCandidates: {},
    streamDetails: { video: [], audio: [], subtitle: [] },
    parsedInfo: {
      cleanTitle: entry.title,
      year: entry.year,
      mediaKind: 'movie',
      seasonNumber: null,
      episodeNumber: null,
      multiEpisodeEnd: null,
      resolution: entry.resolution,
      source: null,
      videoCodec: entry.videoCodec,
      audioCodec: null,
      audioChannels: null,
      hdr: null,
      edition: null,
      releaseGroup: null,
    },
    subtitles: [],
  };
}

/**
 * A show record good enough to paint a header, from the list's tree node.
 *
 * The tree node already carries the whole record, so this is a copy with a helper
 * name: call sites read consistently and the provenance of the seed is obvious.
 */
export function seedShowFromTree(node: ShowTreeNode): TvShowRecord {
  return { ...node.show };
}

/**
 * An episode seed: the show it belongs to plus the episode row itself.
 *
 * Both are already loaded for the tree, so opening an episode can show its number,
 * title and air date with no request at all.
 */
export function seedEpisodeFromTree(
  node: ShowTreeNode,
  episodeId: number,
): { show: TvShowRecord; episode: TvEpisodeRecord } | null {
  const episode = node.episodes.find((e) => e.id === episodeId);
  if (!episode) return null;
  return { show: node.show, episode };
}
