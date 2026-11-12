/**
 * Serializable descriptions of queued file operations.
 *
 * The queue runs closures, which cannot survive a page refresh. Instead of
 * persisting closures, callers describe the write (`FileOperationTask`) and a
 * runner is looked up by `kind`. That keeps the queue's in-memory API unchanged
 * while making pending work reconstructible from IndexedDB.
 *
 * Every task carries exactly the arguments needed to replay the request, so a
 * restored operation performs the same write it would have before the refresh.
 */

import type { ArtworkKind, ScrapedEpisodePart, ScrapedMetadataBundle, UniqueIds } from '../../shared/types.js';

export type FileOperationTask =
  | {
      kind: 'episodeScrape';
      episodeId: number;
      payload: {
        parts: ScrapedEpisodePart[];
        showUniqueIds?: UniqueIds;
        seasonNumber?: number;
        episodeNumber?: number;
        multiEpisodeEnd?: number | null;
        writeNfo?: boolean;
      };
    }
  | {
      kind: 'movieBundle';
      movieId: number;
      bundle: ScrapedMetadataBundle;
      artwork?: Partial<Record<ArtworkKind, string>>;
    }
  | { kind: 'showBundle'; showId: number; bundle: ScrapedMetadataBundle }
  | { kind: 'movieUpdate'; movieId: number; patch: Record<string, unknown> }
  | { kind: 'nfo'; mediaType: 'movie' | 'tvshow' | 'episode'; mediaId: number; xml: string }
  | { kind: 'movieArtwork'; movieId: number; artKind: ArtworkKind; url?: string; dataBase64?: string }
  | { kind: 'showArtwork'; showId: number; artKind: ArtworkKind; url?: string; dataBase64?: string }
  | { kind: 'seasonArtwork'; seasonId: number; artKind: 'poster' | 'banner'; url?: string; dataBase64?: string }
  | {
      kind: 'episodeOrder';
      showId: number;
      mode: 'display' | 'canonical' | 'reset';
      items: Array<{ episodeId: number; targetSeason: number; targetEpisode: number }>;
    };

export type FileOperationTaskKind = FileOperationTask['kind'];

export interface TaskRunResult {
  /** Row subtext shown in the toast. */
  detail: string;
  /** Optional follow-up for callers that need to react (e.g. reload a panel). */
  refresh?: () => void;
}

export type TaskRunner = (task: FileOperationTask) => Promise<TaskRunResult>;

let runner: TaskRunner | null = null;

/**
 * Registers the function that turns a task into a request. Called once at app
 * startup so this module stays free of API imports and remains unit-testable.
 */
export function setTaskRunner(next: TaskRunner | null): void {
  runner = next;
}

/** Runs a task, or throws if no runner has been registered yet. */
export async function runFileOperationTask(task: FileOperationTask): Promise<TaskRunResult> {
  if (!runner) throw new Error('No file-operation runner registered');
  return runner(task);
}
