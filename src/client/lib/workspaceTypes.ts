import type {
  MissingEpisodeRecord,
  TvEpisodeRecord,
  TvSeasonRecord,
  TvShowRecord,
  UnmatchedVideoFile,
} from '../../shared/types.js';

export type LeftLibraryTab = 'movies' | 'tvshows' | 'sets';

export type RibbonTool =
  | 'overview'
  | 'renamer'
  | 'playlists'
  | 'audit'
  | 'scrapers'
  | 'settings';

export type InspectorFocusTab = 'nfo' | 'subtitles' | 'artwork' | 'cast';

export type SelectedMedia =
  | { kind: 'movie'; movieId: number; focusTab?: InspectorFocusTab }
  | { kind: 'show'; showId: number; seasonNumber?: number | null; focusTab?: InspectorFocusTab }
  | { kind: 'episode'; showId: number; episodeId: number; focusTab?: InspectorFocusTab }
  | { kind: 'set'; setId: number }
  | null;

export interface ShowTreeNode {
  show: TvShowRecord;
  seasons: TvSeasonRecord[];
  episodes: TvEpisodeRecord[];
  missingEpisodes?: MissingEpisodeRecord[];
  /** Video files in the series folder that could not be identified as episodes. */
  unmatchedFiles?: UnmatchedVideoFile[];
}
