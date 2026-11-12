/**
 * The single implementation of file-operation side effects.
 *
 * `fileOperations` (the queue) and `fileOperationTasks` (the descriptors) stay
 * free of API imports so both are testable in isolation; this module is where a
 * descriptor actually becomes a request. Registering it once at startup means a
 * task restored from IndexedDB after a refresh runs exactly the same code as one
 * enqueued live.
 */

import type { MovieRecord } from '../../shared/types.js';
import { api } from './api.js';
import { runFileOperationTask, setTaskRunner } from './fileOperationTasks.js';

let registered = false;

/** Idempotent: safe to call from module scope or a component effect. */
export function registerFileOperationRunner(): void {
  if (registered) return;
  registered = true;

  setTaskRunner(async (task) => {
    switch (task.kind) {
      case 'episodeScrape': {
        await api.applyEpisodeScrape(task.episodeId, task.payload);
        return { detail: 'Episode metadata & NFO saved' };
      }
      case 'movieBundle': {
        await api.applyMovieBundle(task.movieId, task.bundle, task.artwork);
        return { detail: 'Metadata, artwork & NFO saved' };
      }
      case 'showBundle': {
        await api.applyShowBundle(task.showId, task.bundle);
        return { detail: 'Metadata, artwork & NFO saved' };
      }
      case 'movieUpdate': {
        await api.updateMovie(task.movieId, task.patch as Partial<MovieRecord> & { writeNfo?: boolean });
        return { detail: 'Metadata & NFO saved' };
      }
      case 'nfo': {
        const res = await api.saveNfo(task.mediaType, task.mediaId, task.xml);
        return { detail: res.validation?.valid === false ? 'NFO written (validation warnings)' : 'NFO validated and written to disk' };
      }
      case 'movieArtwork': {
        await api.setMovieArtwork(task.movieId, task.artKind, task.url, task.dataBase64);
        return { detail: `${task.artKind} saved` };
      }
      case 'showArtwork': {
        await api.setShowArtwork(task.showId, task.artKind, task.url, task.dataBase64);
        return { detail: `${task.artKind} saved` };
      }
      case 'seasonArtwork': {
        await api.setSeasonArtwork(task.seasonId, task.artKind, task.url, task.dataBase64);
        return { detail: `${task.artKind} saved` };
      }
      case 'episodeOrder': {
        const res = await api.updateEpisodeOrder(task.showId, { mode: task.mode, items: task.items });
        const modeLabel = task.mode === 'display' ? 'display' : 'episode';
        return { detail: `Custom ${modeLabel} order written to ${res.updatedCount} NFO file(s)` };
      }
      default: {
        // Exhaustiveness guard: a new task kind must add a runner here.
        const never: never = task;
        throw new Error(`Unhandled file operation: ${JSON.stringify(never)}`);
      }
    }
  });
}

/** Convenience for callers that just want the effect. */
export { runFileOperationTask };
