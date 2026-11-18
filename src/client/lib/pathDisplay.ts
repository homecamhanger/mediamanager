/**
 * Shortening file paths for display without losing them.
 *
 * Media paths are long — a show's episode can easily be 120 characters — and they
 * appear in list rows, audit panels and detail headers where horizontal space is the
 * scarce resource. Truncating the *end* (browser default) hides the filename, which is
 * the part a person is actually reading for. So paths are shortened from the left:
 * the part below the source root is what matters, and the source itself is implied by
 * the library it belongs to.
 *
 *   source: /home/user/mediamanager/sample-library/TV Shows
 *   path:   /home/user/mediamanager/sample-library/TV Shows/Andor/Season 01/E01.mp4
 *   shown:  ../Andor/Season 01/E01.mp4
 *
 * The full path always remains available as a tooltip, so nothing is lost — only
 * deferred. These helpers are pure so the abbreviation rules can be tested directly.
 */

/** Separators that may appear; media libraries are routinely scanned over SMB. */
const SEP = /[\\/]/;

/** True when the string looks like an absolute path rather than a URL or plain text. */
export function looksLikePath(value: string | null | undefined): boolean {
  if (!value) return false;
  if (/^(https?:|data:|blob:|mailto:)/i.test(value)) return false;
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\');
}

/** Normalises separators so comparison works across Windows and POSIX paths. */
function normalize(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '');
}

function isWithin(child: string, parent: string): boolean {
  const c = normalize(child).toLowerCase();
  const p = normalize(parent).toLowerCase();
  if (!p) return false;
  return c === p || c.startsWith(`${p}/`);
}

/**
 * Path relative to a source root, prefixed with `../`.
 *
 * The prefix is deliberate: `../Andor/Season 01/E01.mp4` still reads as "outside this
 * view" rather than as a path rooted at nothing, and it cannot be mistaken for a
 * relative path the user could type.
 *
 * Falls back to `abbreviatePath` when the path is not inside any source, so a file
 * from an unmounted or removed source is still readable rather than shown in full.
 */
export function shortenPath(
  fullPath: string | null | undefined,
  sourcePaths: Array<string | null | undefined>,
): string {
  if (!fullPath) return '';
  if (!looksLikePath(fullPath)) return fullPath;

  // Longest matching root wins, so nested sources shorten by the most specific one.
  const match = sourcePaths
    .filter((root): root is string => Boolean(root) && isWithin(fullPath, root as string))
    .sort((a, b) => normalize(b).length - normalize(a).length)[0];

  if (!match) return abbreviatePath(fullPath);

  const root = normalize(match);
  const rest = normalize(fullPath).slice(root.length);
  // The path *is* the source root — a show can sit directly in it. `../` would claim a
  // parent that does not exist; `.` says "the root itself", which is true.
  if (!rest) return '.';
  // Rest always begins with '/', so the join keeps a single separator.
  return `..${rest}`;
}

/**
 * Last-resort shortening: keeps the final two segments and elides the rest.
 *
 * Used only when no source root is known. Two segments is enough to identify a file
 * (`Season 01/E01.mp4`) while staying short.
 */
export function abbreviatePath(fullPath: string | null | undefined): string {
  if (!fullPath) return '';
  const parts = normalize(fullPath).split('/').filter(Boolean);
  if (parts.length <= 2) return fullPath;
  return `…/${parts.slice(-2).join('/')}`;
}

/**
 * Splits a path into an elided prefix and the surviving tail, for rendering the
 * prefix dimmer than the filename.
 */
export function splitForDisplay(
  fullPath: string | null | undefined,
  sourcePaths: Array<string | null | undefined> = [],
): { prefix: string; name: string } {
  const shortened = shortenPath(fullPath, sourcePaths);
  if (!shortened) return { prefix: '', name: '' };
  const idx = shortened.lastIndexOf('/');
  if (idx < 0) return { prefix: '', name: shortened };
  return { prefix: shortened.slice(0, idx + 1), name: shortened.slice(idx + 1) };
}

/** The filename portion of a path, for compact rows. */
export function baseNameOf(fullPath: string | null | undefined): string {
  if (!fullPath) return '';
  const parts = normalize(fullPath).split('/');
  return parts[parts.length - 1] || fullPath;
}

/** Directory portion of a path, shown when a row is about a folder rather than a file. */
export function dirNameOf(fullPath: string | null | undefined): string {
  if (!fullPath) return '';
  const normalized = normalize(fullPath);
  const idx = normalized.lastIndexOf('/');
  return idx > 0 ? normalized.slice(0, idx) : normalized;
}

export { SEP };
