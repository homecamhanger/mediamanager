import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  isPathInsideAnyRoot,
  isPathInsideRoot,
  isSafeFileNameSegment,
  realpathOfNearestExisting,
} from '../src/server/lib/pathSafety.js';

const tmpDirs: string[] = [];

function tmpDir(prefix = 'path-safety-'): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('isPathInsideRoot', () => {
  it('accepts the root itself and nested paths', () => {
    expect(isPathInsideRoot('/media', '/media')).toBe(true);
    expect(isPathInsideRoot('/media/films/a.mkv', '/media')).toBe(true);
    expect(isPathInsideRoot('/media/films/deep/a.mkv', '/media')).toBe(true);
  });

  it('rejects a sibling that shares a name prefix', () => {
    // The bug this function exists to prevent: "/media" is a prefix of "/media-evil".
    expect(isPathInsideRoot('/media-evil/secret', '/media')).toBe(false);
    expect(isPathInsideRoot('/media2/x', '/media')).toBe(false);
  });

  it('rejects traversal out of the root', () => {
    expect(isPathInsideRoot('/media/../etc/passwd', '/media')).toBe(false);
    expect(isPathInsideRoot('/media/a/../../etc/passwd', '/media')).toBe(false);
    expect(isPathInsideRoot('/etc/passwd', '/media')).toBe(false);
  });

  it('normalises redundant separators and dots', () => {
    expect(isPathInsideRoot('/media/./films/../films/a.mkv', '/media')).toBe(true);
    expect(isPathInsideRoot('/media//films//a.mkv', '/media')).toBe(true);
  });

  it('handles a root with a trailing separator', () => {
    expect(isPathInsideRoot('/media/films/a.mkv', '/media/')).toBe(true);
    expect(isPathInsideRoot('/media-evil/a.mkv', '/media/')).toBe(false);
  });

  it('is false for empty inputs', () => {
    expect(isPathInsideRoot('', '/media')).toBe(false);
    expect(isPathInsideRoot('/media', '')).toBe(false);
  });

  it('treats a file whose name starts with the separator as outside', () => {
    expect(isPathInsideRoot('/mediafile', '/media')).toBe(false);
  });
});

describe('isPathInsideAnyRoot', () => {
  it('accepts a real file under a real root', () => {
    const root = tmpDir();
    const file = path.join(root, 'poster.jpg');
    fs.writeFileSync(file, 'x');
    expect(isPathInsideAnyRoot(file, [root])).toBe(true);
  });

  it('accepts one of several roots', () => {
    const a = tmpDir();
    const b = tmpDir();
    const file = path.join(b, 'x.jpg');
    fs.writeFileSync(file, 'x');
    expect(isPathInsideAnyRoot(file, [a, b])).toBe(true);
  });

  it('rejects a symlink that escapes the root', () => {
    const root = tmpDir();
    const outside = tmpDir('outside-');
    const secret = path.join(outside, 'secret.txt');
    fs.writeFileSync(secret, 'top secret');
    const link = path.join(root, 'innocent.jpg');
    fs.symlinkSync(secret, link);

    // Lexically inside the root, but the real file is not.
    expect(isPathInsideRoot(link, root)).toBe(true);
    expect(isPathInsideAnyRoot(link, [root])).toBe(false);
  });

  it('rejects a symlinked directory that escapes the root', () => {
    const root = tmpDir();
    const outside = tmpDir('outside-');
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'x');
    fs.symlinkSync(outside, path.join(root, 'linkdir'));

    expect(isPathInsideAnyRoot(path.join(root, 'linkdir', 'secret.txt'), [root])).toBe(false);
  });

  it('accepts a not-yet-created destination inside the root', () => {
    const root = tmpDir();
    const dest = path.join(root, 'newdir', 'poster.jpg');
    expect(isPathInsideAnyRoot(dest, [root])).toBe(true);
    expect(fs.existsSync(dest)).toBe(false);
  });

  it('rejects a not-yet-created destination that escapes through a symlink', () => {
    const root = tmpDir();
    const outside = tmpDir('outside-');
    fs.symlinkSync(outside, path.join(root, 'linkdir'));
    const dest = path.join(root, 'linkdir', 'evil.jpg');
    expect(isPathInsideAnyRoot(dest, [root])).toBe(false);
  });

  it('rejects traversal sequences', () => {
    const root = tmpDir();
    expect(isPathInsideAnyRoot(path.join(root, '..', 'etc', 'passwd'), [root])).toBe(false);
  });

  it('fails closed with no roots or empty input', () => {
    expect(isPathInsideAnyRoot('/media/a.jpg', [])).toBe(false);
    expect(isPathInsideAnyRoot('', ['/media'])).toBe(false);
  });
});

describe('isSafeFileNameSegment', () => {
  it('accepts ordinary artwork identifiers', () => {
    for (const v of ['poster', 'fanart', 'clearlogo', 'disc', 'thumb']) {
      expect(isSafeFileNameSegment(v)).toBe(true);
    }
  });

  it('rejects traversal and separators', () => {
    // The exact shape that would escape a library folder when joined into a name.
    expect(isSafeFileNameSegment('../../../../etc/cron.d/x')).toBe(false);
    expect(isSafeFileNameSegment('..')).toBe(false);
    expect(isSafeFileNameSegment('.')).toBe(false);
    expect(isSafeFileNameSegment('a/b')).toBe(false);
    expect(isSafeFileNameSegment('a\\b')).toBe(false);
    expect(isSafeFileNameSegment('a\0b')).toBe(false);
    expect(isSafeFileNameSegment('')).toBe(false);
  });
});

describe('realpathOfNearestExisting', () => {
  it('resolves an existing path', () => {
    const root = tmpDir();
    expect(realpathOfNearestExisting(root)).toBe(root);
  });

  it('resolves the existing ancestor and re-joins the rest', () => {
    const root = tmpDir();
    const target = path.join(root, 'a', 'b', 'c.txt');
    expect(realpathOfNearestExisting(target)).toBe(path.join(root, 'a', 'b', 'c.txt'));
  });
});
