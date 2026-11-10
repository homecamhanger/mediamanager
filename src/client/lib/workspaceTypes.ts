import type { TvEpisodeRecord, TvSeasonRecord, TvShowRecord } from '../../shared/types.js';

export type LeftLibraryTab = 'movies' | 'tvshows' | 'sets';

export type RibbonTool =
  | 'overview'
  | 'renamer'
  | 'subtitles'
  | 'nfo'
  | 'audit'
  | 'scrapers'
  | 'settings';

export type SelectedMedia =
  | { kind: 'movie'; movieId: number }
  | { kind: 'show'; showId: number; seasonNumber?: number | null }
  | { kind: 'episode'; showId: number; episodeId: number }
  | { kind: 'set'; setId: number }
  | null;

export interface ShowTreeNode {
  show: TvShowRecord;
  seasons: TvSeasonRecord[];
  episodes: TvEpisodeRecord[];
}
