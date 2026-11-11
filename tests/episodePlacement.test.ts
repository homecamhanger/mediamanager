import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MediaDatabase } from '../src/server/db/database.js';
import { LibraryScanner } from '../src/server/scanner/libraryScanner.js';
import { createMinimalValidMp4 } from '../src/server/scanner/mediaProbe.js';
import {
  classifyShowVideos,
  isInsideNonEpisodeDirectory,
  isNonEpisodeDirectory,
  placeEpisode,
  seasonFromDirectoryName,
} from '../src/server/scanner/episodePlacement.js';

const tmpDirs: string[] = [];

afterEach(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
});

const made = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-placement-'));
  tmpDirs.push(dir);
  return dir;
};

const video = (filePath: string) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, createMinimalValidMp4({ width: 1920, height: 1080, durationSeconds: 600 }));
};

/** Parse like the scanner does, so the tests exercise the real inputs. */
const asParsed = (filePath: string) => {
  const m = path.basename(filePath).match(/S(\d{1,2})E(\d{1,3})/i);
  return {
    filePath,
    parsedSeason: m ? Number(m[1]) : null,
    parsedEpisode: m ? Number(m[2]) : null,
  };
};

describe('Episode placement rules', () => {
  it('treats Extras / ScreenShots / Featurettes folders as non-episode folders', () => {
    for (const name of ['Extras', 'extras', 'ScreenShots', 'Screenshots', 'Featurettes', 'Bonus Features', 'Trailers']) {
      expect(isNonEpisodeDirectory(name)).toBe(true);
    }
    expect(isNonEpisodeDirectory('Season 1')).toBe(false);
    expect(isNonEpisodeDirectory('Specials')).toBe(false);
  });

  it('reads a season number from season folder names', () => {
    expect(seasonFromDirectoryName('Season 1')).toBe(1);
    expect(seasonFromDirectoryName('season 02')).toBe(2);
    expect(seasonFromDirectoryName('Specials')).toBe(0);
    expect(seasonFromDirectoryName('Season 00')).toBe(0);
    expect(seasonFromDirectoryName('S03')).toBe(3);
    expect(seasonFromDirectoryName('Extras')).toBeNull();
    expect(seasonFromDirectoryName('Firefly (2002)')).toBeNull();
  });

  it('refuses to guess an episode number for an unmarked file', () => {
    // The reported bug: these all became S01E01.
    expect(placeEpisode({ filePath: '/tv/Firefly/Extras/disk3_2.mp4', parsedSeason: null, parsedEpisode: null })).toBeNull();
    expect(
      placeEpisode({
        filePath: "/tv/Firefly/Extras/01_Here's How It Was_Making Of Firefly.mp4",
        parsedSeason: null,
        parsedEpisode: null,
      })
    ).toBeNull();
    expect(placeEpisode({ filePath: '/tv/Firefly/Firefly - Pilot.mp4', parsedSeason: null, parsedEpisode: null })).toBeNull();
  });

  it('places a filename-identified episode, using the folder only for the season', () => {
    expect(
      placeEpisode({ filePath: '/tv/Firefly/Season 1/Firefly - S01E01 - Serenity.mkv', parsedSeason: 1, parsedEpisode: 1 })
    ).toEqual({ seasonNumber: 1, episodeNumber: 1, reason: 'filename' });

    // Season missing from the name but present in the folder.
    expect(
      placeEpisode({ filePath: '/tv/Firefly/Season 3/Some Show - E07 - Title.mkv', parsedSeason: null, parsedEpisode: 7 })
    ).toEqual({ seasonNumber: 3, episodeNumber: 7, reason: 'filename' });
  });

  it('accepts bare-numbered files only inside a real season folder', () => {
    expect(
      placeEpisode({ filePath: '/tv/Firefly/Season 1/01 - Serenity.mkv', parsedSeason: null, parsedEpisode: null })
    ).toEqual({ seasonNumber: 1, episodeNumber: 1, reason: 'season-folder' });

    expect(
      placeEpisode({ filePath: '/tv/Firefly/Specials/02 - Gag Reel.mkv', parsedSeason: null, parsedEpisode: null })
    ).toEqual({ seasonNumber: 0, episodeNumber: 2, reason: 'season-folder' });
  });

  it('does not treat an Extras file as an episode even when numbered', () => {
    // `01_...` looks like a bare number, but the folder disqualifies it.
    expect(
      placeEpisode({
        filePath: "/tv/Firefly/Extras/01_Here's How It Was_Making Of Firefly.mp4",
        parsedSeason: null,
        parsedEpisode: null,
      })
    ).toBeNull();
  });

  it('detects nesting inside a non-episode folder below the series folder', () => {
    const show = '/tv/Firefly (2002)';
    expect(isInsideNonEpisodeDirectory(`${show}/Extras/making/disk3_2.mp4`, show)).toBe(true);
    expect(isInsideNonEpisodeDirectory(`${show}/Season 1/Firefly - S01E01.mkv`, show)).toBe(false);
    // A show whose own folder happens to be called "Extras" is not disqualified
    // by its own name, only by folders beneath it.
    expect(isInsideNonEpisodeDirectory('/tv/Extras/Firefly - S01E01.mkv', '/tv/Extras')).toBe(false);
  });

  it('partitions the Firefly library without inventing episodes', () => {
    const show = '/tv/Firefly (2002)';
    const files = [
      `${show}/Season 1/Firefly - S01E01 - Serenity.mkv`,
      `${show}/Season 1/Firefly - S01E02 - The Train Job.mkv`,
      `${show}/Extras/disk3_2.mp4`,
      `${show}/Extras/disk3_4.mp4`,
      `${show}/ScreenShots/disk1_1.mp4`,
      `${show}/Extras/01_Here's How It Was_Making Of Firefly.mp4`,
    ].map(asParsed);

    const { episodes, unmatched } = classifyShowVideos(files, show);

    expect(episodes.map((e) => `${e.seasonNumber}x${e.episodeNumber}`)).toEqual(['1x1', '1x2']);
    expect(unmatched).toHaveLength(4);
    expect(unmatched.every((u) => u.reason === 'non-episode-folder')).toBe(true);
  });
});

describe('Scanning a series folder with Extras and ScreenShots', () => {
  it('indexes only real episodes and reports the skipped files', async () => {
    const root = made();
    const tvRoot = path.join(root, 'TV');
    const show = path.join(tvRoot, 'Firefly (2002)');

    video(path.join(show, 'Season 1', 'Firefly - S01E01 - Serenity.mkv'));
    video(path.join(show, 'Season 1', 'Firefly - S01E02 - The Train Job.mkv'));
    video(path.join(show, 'Extras', 'disk3_2.mp4'));
    video(path.join(show, 'Extras', 'disk3_4.mp4'));
    video(path.join(show, 'ScreenShots', 'disk1_1.mp4'));
    video(path.join(show, 'Extras', "01_Here's How It Was_Making Of Firefly.mp4"));

    const db = new MediaDatabase(path.join(root, 'test.db'));
    const source = db.addSource({ name: 'TV', path: tvRoot, mediaKind: 'tvshow' });
    const scanner = new LibraryScanner(db);

    const result = await scanner.scanSource(source);
    expect(result.showsScanned).toBe(1);
    expect(result.episodesScanned).toBe(2);

    const showRecord = db.listTvShows().find((s) => s.folderPath === show)!;
    const episodes = db.listEpisodesForShow(showRecord.id);

    // The regression: previously four junk files all appeared as S01E01/E02 and
    // displaced the real episodes.
    expect(episodes).toHaveLength(2);
    expect(episodes.map((e) => `${e.seasonNumber}x${e.episodeNumber}`).sort()).toEqual(['1x1', '1x2']);
    expect(episodes.map((e) => e.fileName)).not.toContain('disk3_2.mp4');

    // The skip is recorded rather than hidden.
    const activity = db.getRecentActivity(20);
    const warning = activity.find((a) => a.message.includes('no episode marker'));
    expect(warning).toBeTruthy();
    expect(warning!.status).toBe('warning');
    expect(warning!.message).toContain('4 files');
  });

  it('keeps seasons correct for bare-numbered files in a season folder', async () => {
    const root = made();
    const tvRoot = path.join(root, 'TV');
    const show = path.join(tvRoot, 'The Expanse (2015)');

    video(path.join(show, 'Season 2', '01 - Safe.mkv'));
    video(path.join(show, 'Season 2', '02 - Doors & Corners.mkv'));
    video(path.join(show, 'Specials', '01 - Blooper Reel.mkv'));

    const db = new MediaDatabase(path.join(root, 'test.db'));
    const source = db.addSource({ name: 'TV', path: tvRoot, mediaKind: 'tvshow' });
    const scanner = new LibraryScanner(db);
    await scanner.scanSource(source);

    const showRecord = db.listTvShows()[0];
    const episodes = db.listEpisodesForShow(showRecord.id);
    expect(episodes.map((e) => `${e.seasonNumber}x${e.episodeNumber}`).sort()).toEqual(['0x1', '2x1', '2x2']);
  });

  it('prunes records left behind by the old S01E01 fallback on rescan', async () => {
    const root = made();
    const tvRoot = path.join(root, 'TV');
    const show = path.join(tvRoot, 'Firefly (2002)');
    video(path.join(show, 'Season 1', 'Firefly - S01E01 - Serenity.mkv'));

    const db = new MediaDatabase(path.join(root, 'test.db'));
    const source = db.addSource({ name: 'TV', path: tvRoot, mediaKind: 'tvshow' });
    const scanner = new LibraryScanner(db);
    await scanner.scanSource(source);

    const showRecord = db.listTvShows()[0];
    expect(db.listEpisodesForShow(showRecord.id)).toHaveLength(1);

    // Simulate a stale record pointing at a junk file that is no longer indexed.
    db.upsertTvEpisode({
      showId: showRecord.id,
      seasonNumber: 1,
      episodeNumber: 1,
      displaySeason: null,
      displayEpisode: null,
      multiEpisodeEnd: null,
      multiEpisodeParts: [],
      folderPath: path.join(show, 'Extras'),
      filePath: path.join(show, 'Extras', 'disk3_2.mp4'),
      fileName: 'disk3_2.mp4',
      fileSizeBytes: 1,
      movieHash: 'deadbeef',
      nfoPath: null,
      hasNfo: false,
      nfoValid: false,
      nfoWarnings: [],
      scraped: false,
      title: 'disk3_2',
      showTitle: 'Firefly',
      aired: null,
      plot: '',
      runtimeMinutes: null,
      directors: [],
      writers: [],
      actors: [],
      uniqueIds: {},
      ratings: [],
      userRating: null,
      playCount: 0,
      watched: false,
      lastPlayed: null,
      thumbPath: null,
      streamDetails: {} as never,
      parsedInfo: {
        cleanTitle: 'disk3_2',
        year: null,
        mediaKind: 'episode',
        seasonNumber: null,
        episodeNumber: null,
        multiEpisodeEnd: null,
        resolution: null,
        source: null,
        videoCodec: null,
        audioCodec: null,
        audioChannels: null,
        hdr: null,
        edition: null,
        releaseGroup: null,
      },
    });
    expect(db.listEpisodesForShow(showRecord.id)).toHaveLength(2);

    await scanner.scanSource(source);

    // The stale junk row is gone; the real episode survives.
    const after = db.listEpisodesForShow(showRecord.id);
    expect(after).toHaveLength(1);
    expect(after[0].fileName).toBe('Firefly - S01E01 - Serenity.mkv');
  });
});
