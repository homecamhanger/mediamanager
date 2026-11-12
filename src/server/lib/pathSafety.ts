/**
 * Filesystem path confinement.
 *
 * Every route that touches the disk from a client-supplied value has to answer one
 * question: is this path still inside a directory the user configured? Getting the
 * answer subtly wrong turns a media manager into a file server for the whole host,
 * so the check lives here once instead of being re-implemented per route.
 *
 * Three mistakes this guards against, all of which appeared in the codebase:
 *
 *  1. **Prefix confusion.** `"/media".startsWith("/media")` is true for
 *     `/media-evil/secret`, so comparing raw strings lets a sibling directory
 *     through. A separator is required after the root.
 *  2. **Traversal.** `../` segments must be resolved *before* comparing, not after.
 *  3. **Symlinks.** A file that legitimately sits under the root can be a symlink
 *     pointing anywhere. Lexical resolution alone accepts it, so the real path is
 *     checked too.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * True when `candidate`, once resolved, is `root` itself or nested inside it.
 *
 * Purely lexical: use it when the path does not exist yet (e.g. a destination
 * that is about to be written) or when symlink resolution is handled elsewhere.
 */
export function isPathInsideRoot(candidate: string, root: string): boolean {
  if (!candidate || !root) return false;
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  if (resolvedCandidate === resolvedRoot) return true;
  return resolvedCandidate.startsWith(resolvedRoot + path.sep);
}

/**
 * True when any of `roots` confines the candidate, lexically and through symlinks.
 *
 * `realpathSync` throws for paths that do not exist; that is treated as "not
 * inside" rather than an error, because callers use this as an allow check and a
 * missing path should fail closed.
 */
export function isPathInsideAnyRoot(candidate: string, roots: readonly string[]): boolean {
  if (!candidate || roots.length === 0) return false;
  const resolvedCandidate = path.resolve(candidate);
  if (!roots.some((root) => isPathInsideRoot(resolvedCandidate, root))) return false;

  // Lexically contained, but a symlink could still point outside. Compare real
  // paths: the deepest existing ancestor, so a not-yet-created destination inside
  // a linked directory is still caught.
  const realCandidate = realpathOfNearestExisting(resolvedCandidate);
  if (!realCandidate) return false;
  return roots.some((root) => {
    const realRoot = realpathOfNearestExisting(path.resolve(root));
    return Boolean(realRoot) && isPathInsideRoot(realCandidate, realRoot!);
  });
}

/**
 * `fs.realpathSync` for a path that may not exist yet: resolves the longest
 * existing ancestor and re-joins the remainder.
 */
export function realpathOfNearestExisting(target: string): string | null {
  let current = path.resolve(target);
  const trailing: string[] = [];
  for (;;) {
    try {
      const real = fs.realpathSync(current);
      return trailing.length === 0 ? real : path.join(real, ...trailing.reverse());
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return null;
      trailing.push(path.basename(current));
      current = parent;
    }
  }
}

/**
 * Rejects a value that would escape a directory when used as a *filename*.
 *
 * Client-supplied identifiers get interpolated into filenames (`poster.jpg`). A
 * value containing a separator or `..` would write outside the intended folder, so
 * anything but a plain name is refused.
 */
export function isSafeFileNameSegment(value: string): boolean {
  if (!value) return false;
  if (value.includes('/') || value.includes('\\')) return false;
  if (value === '.' || value === '..') return false;
  // Null bytes truncate paths in some layers; reject outright.
  return !value.includes('\0');
}
