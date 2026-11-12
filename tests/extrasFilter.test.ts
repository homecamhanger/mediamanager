import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MediaDatabase } from '../src/server/db/database.js';
import { LibraryScanner } from '../src/server/scanner/libraryScanner.js';
import { isInsideExtraDirectory, isSampleOrExtraFile } from '../src/server/scanner/filenameParser.js';

/**
 * Movie scanning must separate "a feature" from "an extra that lives in the film's
 * folder". Both directions of that judgement matter:
 *
 *  - Missing an extra creates a bogus movie (`Gag Reel` became one).
 *  - Over-matching deletes a real film from the library, silently (`The Interview`).
 */
const tmpDirs: string[] = [];

function tmpDir(): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'extras-')));
  tmpDirs.push(dir);
  return dir;
}

function video(p: string) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, 'not-a-real-video');
}

afterEach(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('isInsideExtraDirectory', () => {
  it('detects the reported path', () => {
    expect(
      isInsideExtraDirectory('/m/Movies/Ant-Man (2015)/Featurettes/Gag Reel.mkv', '/m/Movies')
    ).toBe(true);
  });

  it('detects common extras folder spellings', () => {
    for (const dir of ['Extras', 'Featurettes', 'Deleted Scenes', 'Behind The Scenes', 'Trailers', 'Bonus', 'Shorts', 'Interviews']) {
      expect(isInsideExtraDirectory(`/m/Movies/Film (2020)/${dir}/x.mkv`, '/m/Movies'), dir).toBe(true);
    }
  });

  it('is case-insensitive and tolerant of separators', () => {
    expect(isInsideExtraDirectory('/m/Movies/F/featurettes/a.mkv', '/m/Movies')).toBe(true);
    expect(isInsideExtraDirectory('/m/Movies/F/behind.the.scenes/a.mkv', '/m/Movies')).toBe(true);
  });

  it('finds a nested extras folder, not just the immediate parent', () => {
    expect(isInsideExtraDirectory('/m/Movies/F/Featurettes/Sub/Gag.mkv', '/m/Movies')).toBe(true);
  });

  it('does not flag a normal film folder', () => {
    expect(isInsideExtraDirectory('/m/Movies/Ant-Man (2015)/Ant-Man.mkv', '/m/Movies')).toBe(false);
  });

  it('stops at the scan root, so a source living under "Extras" still scans', () => {
    // The root itself is inside a folder called Extras; everything under it is not
    // an extra just because of where the source was configured.
    expect(isInsideExtraDirectory('/srv/Extras/Movies/Film (2020)/Film.mkv', '/srv/Extras/Movies')).toBe(false);
  });
});

describe('isSampleOrExtraFile', () => {
  it('flags the reported gag reel by name as well as by folder', () => {
    expect(isSampleOrExtraFile('/m/Movies/Ant-Man (2015)/Featurettes/Gag Reel.mkv')).toBe(true);
    expect(isSampleOrExtraFile('/m/Movies/Ant-Man (2015)/Gag Reel.mkv')).toBe(true);
  });

  it('flags the usual extras vocabulary', () => {
    for (const n of ['sample', 'Sample.mkv', 'Trailer.mkv', 'Featurette.mkv', 'Deleted Scenes.mkv', 'Behind the Scenes.mkv', 'Bloopers.mkv', 'Making of.mkv', 'Interviews.mkv']) {
      expect(isSampleOrExtraFile(`/m/Movies/Film/${n}`), n).toBe(true);
    }
  });

  it('does not drop real films whose titles contain a keyword', () => {
    // These were being silently discarded from the library before.
    for (const n of [
      'The Interview (2014).mkv',
      'Interview (2014).mkv',
      'Trailer Park Boys (2006).mkv',
      'The Extras (2019).mkv',
    ]) {
      expect(isSampleOrExtraFile(`/m/Movies/Folder/${n}`), n).toBe(false);
    }
  });

  it('keeps a year-bearing file as a film, but an extras folder still wins', () => {
    // A deliberate trade: a yearless extras name is the common shape, and treating
    // a year as evidence of a real title rescues whole films. The folder check
    // still catches "Featurettes/Gag Reel 2015.mkv".
    expect(isSampleOrExtraFile('/m/Movies/Film (2019)/Trailer 2020.mkv')).toBe(false);
    expect(isSampleOrExtraFile('/m/Movies/Film (2019)/Featurettes/Gag Reel 2015.mkv', '/m/Movies')).toBe(true);
    // "2049" is a title, not a year tag, but it must not be swallowed either way.
    expect(isSampleOrExtraFile('/m/Movies/Blade Runner 2049/Blade Runner 2049.mkv')).toBe(false);
  });

  it('leaves ordinary films alone', () => {
    for (const n of ['Ant-Man.2015.1080p.BluRay.x264.mkv', 'Serenity.mkv', 'Samples Of My Life (2021).mkv']) {
      expect(isSampleOrExtraFile(`/m/Movies/F/${n}`), n).toBe(false);
    }
  });
});

describe('Movie scan', () => {
  it('does not index a featurette as its own movie', async () => {
    const root = tmpDir();
    const moviesRoot = path.join(root, 'Movies');
    const filmDir = path.join(moviesRoot, 'Ant-Man (2015)');
    video(path.join(filmDir, 'Ant-Man (2015).mkv'));
    video(path.join(filmDir, 'Featurettes', 'Gag Reel.mkv'));
    video(path.join(filmDir, 'Featurettes', 'Deleted Scenes.mkv'));
    video(path.join(filmDir, 'sample.mkv'));

    const db = new MediaDatabase(path.join(root, 'test.db'));
    const source = db.addSource({ name: 'Movies', path: moviesRoot, mediaKind: 'movie' });
    await new LibraryScanner(db).scanSource(source);

    const movies = db.listMovies();
    expect(movies).toHaveLength(1);
    expect(movies[0].fileName).toBe('Ant-Man (2015).mkv');
  });

  it('still indexes a real film whose title contains an extras keyword', async () => {
    const root = tmpDir();
    const moviesRoot = path.join(root, 'Movies');
    video(path.join(moviesRoot, 'The Interview (2014)', 'The Interview (2014).mkv'));
    video(path.join(moviesRoot, 'Trailer Park Boys (2006)', 'Trailer.Park.Boys.2006.mkv'));

    const db = new MediaDatabase(path.join(root, 'test.db'));
    const source = db.addSource({ name: 'Movies', path: moviesRoot, mediaKind: 'movie' });
    await new LibraryScanner(db).scanSource(source);

    expect(db.listMovies().map((m) => m.fileName).sort()).toEqual([
      'The Interview (2014).mkv',
      'Trailer.Park.Boys.2006.mkv',
    ]);
  });

  it('keeps TV extras flagged rather than indexed or dropped', async () => {
    // The movie rule must not leak into TV: there, extras are surfaced to the user.
    const root = tmpDir();
    const tvRoot = path.join(root, 'TV');
    const show = path.join(tvRoot, 'Ant-Man (2015)');
    video(path.join(show, 'Season 1', 'Ant-Man - S01E01 - Pilot.mkv'));
    video(path.join(show, 'Featurettes', 'Gag Reel.mkv'));

    const db = new MediaDatabase(path.join(root, 'test.db'));
    const source = db.addSource({ name: 'TV', path: tvRoot, mediaKind: 'tvshow' });
    await new LibraryScanner(db).scanSource(source);

    const showRecord = db.listTvShows()[0];
    expect(db.listEpisodesForShow(showRecord.id)).toHaveLength(1);
    // The extra is reported as unmatched rather than vanishing.
    expect(db.listUnmatchedVideoFiles().map((f) => f.fileName)).toContain('Gag Reel.mkv');
  });
});
