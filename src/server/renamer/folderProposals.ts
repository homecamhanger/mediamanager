/**
 * Finds films that do not own a folder, and proposes a folder for each.
 *
 * The shared-folder bug (two films drawing the same `poster.jpg`) has a structural
 * cause: Kodi's bare artwork names — `poster.jpg`, `fanart.jpg`, `movie.nfo` — only
 * mean anything when a folder holds exactly one film. A film sitting loose in the
 * source root, or sharing a folder with another film, has no unambiguous artwork
 * namespace, so any bare-named file beside it is a coin flip.
 *
 * This module answers "which films are in that position, and where should each one
 * go". It is pure with respect to the database and filesystem layout: candidates are
 * derived from records and disk state, destinations from the *existing* rename
 * patterns, so a proposed folder matches what the renamer would already produce.
 *
 * Nothing here writes. Every proposal becomes an ordinary `RenamePreviewItem`, which
 * means the proven move path (sidecars, DB updates, rename history, undo) does the
 * actual work and moves stay reversible.
 */

import fs from 'node:fs';
import path from 'node:path';
import type {
  FolderProblemKind,
  FolderProposal,
  FolderProposalReport,
  MediaSource,
  MovieRecord,
  RenamePreviewItem,
  RenameSidecarMove,
} from '../../shared/types.js';

/** Only the sidecar kinds this module can safely attribute to one film. */
type OwnedSidecarKind = 'nfo' | 'subtitle' | 'artwork';

/** Minimal DB surface this module needs, so it can be tested without SQLite. */
export interface FolderProposalDb {
  listMovies(): MovieRecord[];
  getSource(id: number): MediaSource | null;
}

/**
 * Renders a destination the same way the renamer does.
 *
 * Passed in rather than imported so this module stays free of the renamer's own
 * dependencies and can be unit-tested with a stub. `renderTargets` returns the
 * folder name and file base for one film.
 */
export type RenderTargets = (
  movie: MovieRecord,
  source: MediaSource,
) => { folderName: string; fileBase: string };

/**
 * A film owns its folder only when it is the single film in a subfolder of the
 * source. The root is excluded because a bare `poster.jpg` there could belong to
 * any of its loose films, and a folder with siblings is excluded because the bare
 * names are equally ambiguous.
 */
export function classifyFolderProblem(
  movie: MovieRecord,
  source: MediaSource,
  filmsPerFolder: Map<string, number>,
): FolderProblemKind | null {
  const folder = path.dirname(movie.filePath);
  if (folder === path.resolve(source.path)) return 'loose-in-root';
  const count = filmsPerFolder.get(folder) ?? 1;
  return count > 1 ? 'shared-folder' : null;
}

/**
 * Builds the full list of proposals.
 *
 * Grouping is done on the resolved folder path, so two records that point into the
 * same directory are recognised as sharing it even if their stored `folderPath`
 * differs in trailing slashes or case of separators.
 */
export function buildFolderProposals(
  db: FolderProposalDb,
  renderTargets: RenderTargets,
): FolderProposalReport {
  const movies = db.listMovies();
  const proposals: FolderProposal[] = [];
  const skipped: FolderProposalReport['skipped'] = [];

  const filmsPerFolder = new Map<string, number>();
  for (const m of movies) {
    const folder = path.resolve(path.dirname(m.filePath));
    filmsPerFolder.set(folder, (filmsPerFolder.get(folder) ?? 0) + 1);
  }

  // Destinations are compared case-insensitively on the platforms that are, but a
  // Set of raw paths is enough here: the case-sensitive comparison only ever makes
  // the conflict check *more* permissive, never a lost film.
  const claimedTargets = new Set<string>();

  for (const movie of movies) {
    const source = db.getSource(movie.sourceId);
    if (!source) {
      skipped.push({ movieId: movie.id, title: movie.title, reason: 'Source no longer exists' });
      continue;
    }

    const problem = classifyFolderProblem(movie, source, filmsPerFolder);
    if (!problem) continue;

    const folder = path.resolve(path.dirname(movie.filePath));
    const filmsInFolder = problem === 'shared-folder' ? filmsPerFolder.get(folder) ?? 1 : 1;

    let rendered: { folderName: string; fileBase: string };
    try {
      rendered = renderTargets(movie, source);
    } catch (err) {
      skipped.push({
        movieId: movie.id,
        title: movie.title,
        reason: `Could not build a destination: ${(err as Error).message}`,
      });
      continue;
    }

    const folderName = rendered.folderName.trim();
    if (!folderName) {
      skipped.push({ movieId: movie.id, title: movie.title, reason: 'Rename pattern produced an empty folder name' });
      continue;
    }

    const targetFolder = path.join(path.resolve(source.path), folderName);
    const ext = path.extname(movie.filePath);
    const targetFilePath = path.join(targetFolder, `${rendered.fileBase.trim() || movie.title}${ext}`);

    // A film already sitting in the folder the proposal names needs no move at all;
    // reporting it as actionable would offer a no-op and leave the ambiguity.
    if (targetFolder === folder) {
      skipped.push({
        movieId: movie.id,
        title: movie.title,
        reason: 'Rename patterns would place it back in the same folder',
      });
      continue;
    }

    let conflict: string | null = null;
    if (claimedTargets.has(targetFilePath)) {
      conflict = 'Another proposed film targets the same file';
    } else if (fs.existsSync(targetFilePath)) {
      conflict = 'Target file already exists on disk';
    } else if (fs.existsSync(targetFolder) && fs.readdirSync(targetFolder).some((f) => !f.startsWith('.'))) {
      // The folder exists and is not empty. It may be an unrelated film's folder, or
      // the same film already partly migrated; either way the user should look.
      conflict = 'Target folder already exists and is not empty';
    }
    claimedTargets.add(targetFilePath);

    // Sidecars follow only when they are unambiguously this film's: named after the
    // video file itself. A bare poster.jpg in a shared folder is exactly the file
    // that caused the problem, so it must never be swept along.
    const sidecars = collectOwnSidecars(movie);

    proposals.push({
      movieId: movie.id,
      title: movie.title,
      year: movie.year,
      filePath: movie.filePath,
      currentFolder: folder,
      sourceId: source.id,
      sourceName: source.name,
      problem,
      filmsInFolder,
      targetFolder,
      targetFilePath,
      conflict,
      sidecars,
      blockedReason: null,
    });
  }

  // Stable, predictable order for review: the root cases first (they have no folder
  // at all), then shared folders grouped by folder, then alphabetically.
  const rank = (p: FolderProblemKind) => (p === 'loose-in-root' ? 0 : 1);
  proposals.sort(
    (a, b) =>
      rank(a.problem) - rank(b.problem) ||
      a.currentFolder.localeCompare(b.currentFolder) ||
      a.title.localeCompare(b.title),
  );

  return {
    proposals,
    skipped,
    summary: {
      looseInRoot: proposals.filter((p) => p.problem === 'loose-in-root').length,
      sharedFolder: proposals.filter((p) => p.problem === 'shared-folder').length,
      actionable: proposals.filter((p) => !p.conflict && !p.blockedReason).length,
    },
  };
}

/**
 * Files that are unambiguously this film's, named from the video file's own base.
 *
 * `Dune (2021) [1080p].nfo` travels with `Dune (2021) [1080p].mkv`; `poster.jpg` and
 * `movie.nfo` do not, because in a shared folder they cannot be attributed to one
 * film.
 */
export function collectOwnSidecars(
  movie: MovieRecord,
  fileExists: (p: string) => boolean = (p) => fs.existsSync(p),
): Array<{ kind: OwnedSidecarKind; oldPath: string; newPath: string }> {
  const found: Array<{ kind: OwnedSidecarKind; oldPath: string }> = [];

  if (movie.nfoPath && isOwnedBy(movie.nfoPath, movie) && fileExists(movie.nfoPath)) {
    found.push({ kind: 'nfo', oldPath: movie.nfoPath });
  }
  for (const sub of movie.subtitles) {
    if (isOwnedBy(sub.filePath, movie) && fileExists(sub.filePath)) {
      found.push({ kind: 'subtitle', oldPath: sub.filePath });
    }
  }
  for (const artPath of Object.values(movie.artwork)) {
    if (artPath && isOwnedBy(artPath, movie) && fileExists(artPath)) {
      found.push({ kind: 'artwork', oldPath: artPath });
    }
  }

  // Destinations need the target base name, which is only known once the proposal is
  // built; `proposalToPreview` fills them in.
  return found.map((s) => ({ ...s, newPath: '' }));
}

/** True when `candidate` is named from the video's own base name. */
function isOwnedBy(candidate: string, movie: MovieRecord): boolean {
  const base = path.basename(movie.filePath, path.extname(movie.filePath));
  return path.basename(candidate).startsWith(`${base}.`) || path.basename(candidate).startsWith(`${base}-`);
}

/**
 * Converts one proposal into the renamer's preview shape so the existing, audited
 * move path performs it. Keeping this a pure conversion means the UI and server
 * agree on exactly what will happen before anything touches disk.
 */
export function proposalToPreview(p: FolderProposal): RenamePreviewItem {
  const ext = path.extname(p.targetFilePath);
  const newBase = path.basename(p.targetFilePath, ext);
  const oldBase = path.basename(p.filePath, path.extname(p.filePath));

  const sidecars: RenameSidecarMove[] = p.sidecars.map((s) => {
    const suffix = path.basename(s.oldPath).slice(oldBase.length);
    return {
      kind: s.kind,
      oldPath: s.oldPath,
      newPath: path.join(p.targetFolder, `${newBase}${suffix}`),
    };
  });

  return {
    mediaType: 'movie',
    mediaId: p.movieId,
    title: p.title,
    hasChanges: true,
    conflict: p.conflict ?? p.blockedReason,
    oldPath: p.filePath,
    newPath: p.targetFilePath,
    sidecars,
  };
}
