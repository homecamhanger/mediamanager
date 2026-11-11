import type { TvEpisodeRecord } from '../../shared/types.js';

/**
 * Display helpers for the TV episode list.
 *
 * The list used to render `plot || fileName`, so a scraped description *replaced*
 * the file identity instead of sitting beside it. Once an episode was scraped you
 * could no longer see which file it came from, which is exactly the case where you
 * need that information (spotting a mis-named or mis-ordered file).
 */

/** The full path for a hover tooltip, using the episode's folder + file name. */
export function episodeFilePath(ep: Pick<TvEpisodeRecord, 'folderPath' | 'fileName'>): string {
  const sep = ep.folderPath.includes('\\') ? '\\' : '/';
  const base = ep.folderPath.replace(/[\\/]+$/, '');
  return `${base}${sep}${ep.fileName}`;
}

/** Secondary line under the title: the file name itself, always shown. */
export function episodeFileLabel(ep: Pick<TvEpisodeRecord, 'fileName'>): string {
  return ep.fileName;
}

/** Whether the episode has a description worth showing as its own line. */
export function hasPlot(ep: Pick<TvEpisodeRecord, 'plot'>): boolean {
  return Boolean(ep.plot && ep.plot.trim().length > 0);
}

export interface EpisodeDisplay {
  /** Title line — scraped title, falling back to the file name. */
  title: string;
  /** Description line, or null when there is nothing to show. */
  plot: string | null;
  /** File name line — always present. */
  fileName: string;
  /** Full path for tooltips. */
  filePath: string;
}

/**
 * Everything the row needs, in one place. The file name is never omitted and never
 * substituted by the plot.
 */
export function episodeDisplay(
  ep: Pick<TvEpisodeRecord, 'title' | 'plot' | 'fileName' | 'folderPath'>
): EpisodeDisplay {
  return {
    title: ep.title && ep.title.trim() ? ep.title : ep.fileName,
    plot: hasPlot(ep) ? ep.plot.trim() : null,
    fileName: episodeFileLabel(ep),
    filePath: episodeFilePath(ep),
  };
}
