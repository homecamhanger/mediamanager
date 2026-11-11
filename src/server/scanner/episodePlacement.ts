import path from 'node:path';

/**
 * Placement rules for TV episode files.
 *
 * The scanner used to fall back to *season 1, episode 1* whenever a filename
 * carried no `SxxExx`/`1x02` marker. In a series folder that also contains an
 * `Extras/` or `ScreenShots/` directory this silently invented episodes: every
 * loose video became a second S01E01, and the first one to be indexed won. That
 * is worse than dropping the file, because it corrupts the episode list with
 * entries that cannot be corrected by editing the file names alone.
 *
 * The rule now is: an episode must be *positively identified*. A file is only
 * placed in the library when its name (or, failing that, a season folder it sits
 * in) says which episode it is. Everything else is reported as unmatched so the
 * user can see it and decide.
 */

/** Folders whose contents are never episodes, whatever the filenames say. */
const NON_EPISODE_DIRS = new Set([
  'extras',
  'extra',
  'featurettes',
  'behind the scenes',
  'behindthescenes',
  'deleted scenes',
  'deleted',
  'interviews',
  'screenshots',
  'screencaps',
  'sample',
  'samples',
  'trailers',
  'bonus',
  'bonus features',
  'making of',
  'other',
  'misc',
  'artwork',
  'subs',
  'subtitles',
  'extrafanart',
  'extrathumbs',
]);

/** Folder names that mark a season directory and the season number they imply. */
const SEASON_DIR_PATTERNS: Array<{ test: RegExp; season: number | 'specials' }> = [
  { test: /^specials?$/i, season: 'specials' },
  { test: /^season\s*00$/i, season: 'specials' },
  { test: /^season\s*(\d{1,2})$/i, season: 0 },
  { test: /^series\s*(\d{1,2})$/i, season: 0 },
  { test: /^s(\d{1,2})$/i, season: 0 },
];

export function isNonEpisodeDirectory(dirName: string): boolean {
  return NON_EPISODE_DIRS.has(dirName.trim().toLowerCase());
}

/**
 * Season number implied by a season folder name, or null when the directory is
 * not a season folder. `'specials'` maps to season 0.
 */
export function seasonFromDirectoryName(dirName: string): number | null {
  const name = dirName.trim();
  for (const { test, season } of SEASON_DIR_PATTERNS) {
    const m = name.match(test);
    if (!m) continue;
    if (season === 'specials') return 0;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export interface EpisodePlacement {
  seasonNumber: number;
  episodeNumber: number;
  /** How the placement was decided, for progress/telemetry. */
  reason: 'filename' | 'season-folder';
}

/**
 * A file whose name *starts* with a bare number, e.g. `01 - Serenity.mkv`.
 * Common in TV libraries that omit the `SxxExx` prefix.
 */
const BARE_NUMBER_PREFIX = /^(\d{1,3})(?:[\s._-]|$)/;

/**
 * Decide where a video file belongs, or return null when it cannot be identified
 * as a specific episode.
 *
 * - An `SxxExx`-style marker in the filename always wins.
 * - A bare leading number is only trusted inside a recognised season folder (or
 *   directly in the series folder, which Kodi treats as season 1) — there the
 *   number is the only sensible reading.
 * - Otherwise the file is *not* an episode. Guessing S01E01 is what turned
 *   `disk3_2.mp4` into a duplicate episode, so it is refused.
 */
export function placeEpisode(params: {
  filePath: string;
  parsedSeason: number | null;
  parsedEpisode: number | null;
}): EpisodePlacement | null {
  const { filePath, parsedSeason, parsedEpisode } = params;

  // Identified by the filename itself.
  if (parsedEpisode != null) {
    return {
      seasonNumber: parsedSeason ?? seasonForFileFromFolders(filePath) ?? 1,
      episodeNumber: parsedEpisode,
      reason: 'filename',
    };
  }

  // No episode number anywhere: only a season folder can supply context, and even
  // then the episode number itself must come from the filename.
  const folderSeason = seasonForFileFromFolders(filePath);
  if (folderSeason == null) return null;

  const base = path.basename(filePath, path.extname(filePath));
  const bareNumber = base.match(BARE_NUMBER_PREFIX);
  if (!bareNumber) return null;

  const episodeNumber = Number(bareNumber[1]);
  if (!Number.isFinite(episodeNumber) || episodeNumber < 1) return null;

  return { seasonNumber: folderSeason, episodeNumber, reason: 'season-folder' };
}

/** Walk up the path looking for a season folder, stopping at the series folder. */
function seasonForFileFromFolders(filePath: string): number | null {
  let dir = path.dirname(filePath);
  for (let depth = 0; depth < 3; depth++) {
    const name = path.basename(dir);
    if (isNonEpisodeDirectory(name)) return null;
    const season = seasonFromDirectoryName(name);
    if (season != null) return season;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Files inside a non-episode folder (Extras, ScreenShots, ...) are never episodes,
 * even when the filename happens to contain something that looks like `SxxExx`.
 */
export function isInsideNonEpisodeDirectory(filePath: string, showFolder?: string): boolean {
  const stopAt = showFolder ? path.resolve(showFolder) : null;
  let dir = path.dirname(path.resolve(filePath));
  for (let depth = 0; depth < 6; depth++) {
    if (stopAt && path.resolve(dir) === stopAt) break;
    if (isNonEpisodeDirectory(path.basename(dir))) return true;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return false;
}

export interface UnmatchedFile {
  filePath: string;
  fileName: string;
  reason: 'no-episode-marker' | 'non-episode-folder';
}

/**
 * Partition a show's video files into identifiable episodes and the rest.
 * Deterministic ordering keeps progress telemetry stable across scans.
 */
export function classifyShowVideos(
  files: Array<{ filePath: string; parsedSeason: number | null; parsedEpisode: number | null }>,
  showFolder: string
): { episodes: Array<EpisodePlacement & { filePath: string }>; unmatched: UnmatchedFile[] } {
  const episodes: Array<EpisodePlacement & { filePath: string }> = [];
  const unmatched: UnmatchedFile[] = [];

  for (const file of files) {
    const fileName = path.basename(file.filePath);
    if (isInsideNonEpisodeDirectory(file.filePath, showFolder)) {
      unmatched.push({ filePath: file.filePath, fileName, reason: 'non-episode-folder' });
      continue;
    }
    const placement = placeEpisode(file);
    if (!placement) {
      unmatched.push({ filePath: file.filePath, fileName, reason: 'no-episode-marker' });
      continue;
    }
    episodes.push({ ...placement, filePath: file.filePath });
  }

  return { episodes, unmatched };
}
