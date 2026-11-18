/**
 * Path display rules.
 *
 * Two requirements: hovering any path shows the whole thing, and the visible text is
 * left-truncated against the source root (`../Andor/Season 01/x.mp4`) rather than
 * clipped on the right, which hides the filename — the part that identifies the file.
 */
import { describe, expect, it } from 'vitest';
import {
  shortenPath,
  abbreviatePath,
  looksLikePath,
  baseNameOf,
  dirNameOf,
  splitForDisplay,
} from '../src/client/lib/pathDisplay.js';

const TV_ROOT = '/home/user/mediamanager/sample-library/TV Shows';
const MOVIE_ROOT = '/home/user/mediamanager/sample-library/Movies';
const ROOTS = [TV_ROOT, MOVIE_ROOT];

describe('looksLikePath', () => {
  it('recognises absolute and Windows paths', () => {
    expect(looksLikePath('/a/b/c.mkv')).toBe(true);
    expect(looksLikePath('C:\\Media\\film.mkv')).toBe(true);
    expect(looksLikePath('\\\\nas\\share\\film.mkv')).toBe(true);
  });

  it('does not treat a URL as a library path', () => {
    expect(looksLikePath('https://example.com/a.mkv')).toBe(false);
  });

  it('leaves an already-relative path alone rather than shortening it twice', () => {
    // shortenPath uses looksLikePath as its guard, so a value that is already in
    // display form must come back unchanged.
    expect(looksLikePath('../TV/x.mkv')).toBe(false);
    expect(shortenPath('../TV/x.mkv', ROOTS)).toBe('../TV/x.mkv');
  });

  it('rejects plain titles and empty values', () => {
    expect(looksLikePath('Andor')).toBe(false);
    expect(looksLikePath('')).toBe(false);
    expect(looksLikePath(null)).toBe(false);
    expect(looksLikePath(undefined)).toBe(false);
  });
});

describe('shortenPath', () => {
  it('rewrites a file under a source root as ../<rest>', () => {
    expect(shortenPath(`${TV_ROOT}/Andor/Season 01/Andor.S01E01.mkv`, ROOTS)).toBe(
      '../Andor/Season 01/Andor.S01E01.mkv',
    );
  });

  it('keeps the filename visible, which right-clipping would destroy', () => {
    const out = shortenPath(`${TV_ROOT}/Andor/Season 01/Andor.S01E01.mkv`, ROOTS);
    expect(out.endsWith('Andor.S01E01.mkv')).toBe(true);
  });

  it('picks the longest matching root when sources nest', () => {
    const nested = ['/lib', '/lib/TV Shows', '/lib/TV Shows/Andor'];
    expect(shortenPath('/lib/TV Shows/Andor/Season 01/e.mkv', nested)).toBe('../Season 01/e.mkv');
  });

  it('falls back to an ellipsis form when no root matches', () => {
    const out = shortenPath('/elsewhere/deep/Season 01/e.mkv', ROOTS);
    expect(out.startsWith('…')).toBe(true);
    expect(out.endsWith('e.mkv')).toBe(true);
    // Never returns the bare absolute path when it was asked to shorten.
    expect(out).not.toBe('/elsewhere/deep/Season 01/e.mkv');
  });

  it('shows a path equal to the root as the root itself', () => {
    // A show can sit directly in a source folder; `../` would imply a parent that
    // does not exist.
    expect(shortenPath(TV_ROOT, ROOTS)).toBe('.');
  });

  it('handles trailing slashes on roots', () => {
    expect(shortenPath(`${TV_ROOT}/Andor/e.mkv`, [`${TV_ROOT}/`])).toBe('../Andor/e.mkv');
  });

  it('is unaffected by a root that merely shares a prefix', () => {
    // "/lib/TV Shows 2" must not match the root "/lib/TV Shows".
    expect(shortenPath('/lib/TV Shows 2/Andor/e.mkv', ['/lib/TV Shows'])).not.toBe('../Andor/e.mkv');
  });

  it('normalises Windows separators in both root and path', () => {
    expect(shortenPath('C:\\Media\\TV\\Andor\\e.mkv', ['C:\\Media\\TV'])).toBe('../Andor/e.mkv');
  });
});

describe('abbreviatePath', () => {
  it('keeps the last two segments and marks the elision', () => {
    // Two segments identifies a file ("Season 01/e.mkv") without eating the name.
    expect(abbreviatePath('/a/b/c/d/e.mkv')).toBe('…/d/e.mkv');
  });

  it('leaves short paths untouched', () => {
    expect(abbreviatePath('/a/e.mkv')).toBe('/a/e.mkv');
  });

  it('returns an empty string for a missing path', () => {
    expect(abbreviatePath('')).toBe('');
    expect(abbreviatePath(null)).toBe('');
  });
});

describe('baseNameOf / dirNameOf', () => {
  it('splits on both separators', () => {
    expect(baseNameOf('/a/b/e.mkv')).toBe('e.mkv');
    expect(baseNameOf('C:\\a\\b\\e.mkv')).toBe('e.mkv');
    expect(dirNameOf('/a/b/e.mkv')).toBe('/a/b');
  });
});

describe('splitForDisplay', () => {
  it('splits into a dimmable prefix and the filename', () => {
    const { prefix, name } = splitForDisplay(`${TV_ROOT}/Andor/Season 01/e.mkv`, ROOTS);
    expect(prefix).toBe('../Andor/Season 01/');
    expect(name).toBe('e.mkv');
  });

  it('returns an empty split for an empty path', () => {
    expect(splitForDisplay(null, ROOTS)).toEqual({ prefix: '', name: '' });
  });
});
