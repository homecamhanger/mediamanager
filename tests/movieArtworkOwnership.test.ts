import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * Artwork ownership when a folder holds more than one film.
 *
 * The bug: two films in one folder were each given the folder's single `poster.jpg`,
 * so the list drew the same image for both and each detail panel reported the
 * other's poster. The cause was a boolean that only asked "is this a subfolder of
 * the source?" rather than "does this folder belong to this film alone?".
 *
 * These tests pin the rule that fixes it: bare artwork names (`poster.jpg`) belong
 * to a folder with exactly one film; a shared folder only offers filename-scoped
 * artwork (`<video>-poster.jpg`), and anything ambiguous resolves to nothing rather
 * than to the wrong film.
 *
 * Scans run against real temp directories with real files, because the behaviour
 * under test is filesystem discovery.
 */

const {
  discoverMovieArtwork,
} = await import('../src/server/scanner/libraryScanner.js');

const created: string[] = [];

function tempSource(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-artwork-'));
  created.push(root);
  return root;
}

function touch(file: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.alloc(64, 7));
}

afterEach(() => {
  for (const dir of created.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('discoverMovieArtwork ownership', () => {
  it('gives a dedicated folder’s bare poster to its single film', () => {
    const dir = tempSource();
    touch(path.join(dir, 'poster.jpg'));
    touch(path.join(dir, 'fanart.jpg'));

    const art = discoverMovieArtwork(dir, 'Ant-Man (2015)', true);

    expect(art.poster).toBe(path.join(dir, 'poster.jpg'));
    expect(art.fanart).toBe(path.join(dir, 'fanart.jpg'));
  });

  it('prefers filename-scoped art over the bare name in a dedicated folder', () => {
    const dir = tempSource();
    touch(path.join(dir, 'poster.jpg'));
    touch(path.join(dir, 'Ant-Man (2015)-poster.jpg'));

    const art = discoverMovieArtwork(dir, 'Ant-Man (2015)', true);

    expect(art.poster).toBe(path.join(dir, 'Ant-Man (2015)-poster.jpg'));
  });

  it('never gives a shared folder’s bare poster to either film', () => {
    // The reported case: one poster.jpg, two films.
    const dir = tempSource();
    touch(path.join(dir, 'poster.jpg'));

    const one = discoverMovieArtwork(dir, 'Movie One (2010)', false);
    const two = discoverMovieArtwork(dir, 'Movie Two (2011)', false);

    // The old behaviour handed both films this same path, which is what crossed them.
    const sharedPoster = path.join(dir, 'poster.jpg');
    expect(one.poster).toBeNull();
    expect(two.poster).toBeNull();
    expect(one.poster).not.toBe(sharedPoster);
    expect(two.poster).not.toBe(sharedPoster);
  });

  it('still honours filename-scoped art inside a shared folder', () => {
    const dir = tempSource();
    touch(path.join(dir, 'poster.jpg'));
    touch(path.join(dir, 'Movie One (2010)-poster.jpg'));
    touch(path.join(dir, 'Movie Two (2011)-poster.jpg'));

    const one = discoverMovieArtwork(dir, 'Movie One (2010)', false);
    const two = discoverMovieArtwork(dir, 'Movie Two (2011)', false);

    // Unambiguous per-film art survives; the shared bare name does not.
    expect(one.poster).toBe(path.join(dir, 'Movie One (2010)-poster.jpg'));
    expect(two.poster).toBe(path.join(dir, 'Movie Two (2011)-poster.jpg'));
    expect(one.poster).not.toBe(two.poster);
  });

  it('resolves every artwork kind the same way, not just the poster', () => {
    const dir = tempSource();
    for (const kind of ['poster', 'fanart', 'banner', 'clearlogo', 'clearart', 'disc', 'landscape', 'thumb']) {
      touch(path.join(dir, `${kind}.jpg`));
    }

    const shared = discoverMovieArtwork(dir, 'A', false);
    const dedicated = discoverMovieArtwork(dir, 'A', true);

    expect(Object.values(shared).every((v) => v === null)).toBe(true);
    expect(Object.values(dedicated).every((v) => v !== null)).toBe(true);
  });

  it('accepts discart as a dedicated-folder alias for disc', () => {
    const dir = tempSource();
    touch(path.join(dir, 'discart.png'));

    expect(discoverMovieArtwork(dir, 'A', true).disc).toBe(path.join(dir, 'discart.png'));
    // A shared folder must not pick it up, for the same reason as any bare name.
    expect(discoverMovieArtwork(dir, 'A', false).disc).toBeNull();
  });

  it('returns nothing when the folder has no artwork at all', () => {
    const dir = tempSource();
    const art = discoverMovieArtwork(dir, 'A', true);

    expect(Object.values(art).every((v) => v === null)).toBe(true);
  });
});
