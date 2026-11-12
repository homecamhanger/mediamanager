import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MediaDatabase } from '../src/server/db/database.js';
import { LibraryScanner } from '../src/server/scanner/libraryScanner.js';
import { FEATURE_SIZE_RATIO, selectFolderFeatures } from '../src/server/scanner/filenameParser.js';

/**
 * Feature-vs-extra selection by file size.
 *
 * Keyword matching was removed deliberately: the vocabulary of extras is unbounded,
 * so every list was both incomplete (extras became bogus movies) and over-broad
 * (films with "interview" in the title were silently deleted). Size needs no
 * vocabulary.
 *
 * The risk this trades for is dropping a real film, so most of these tests are
 * about *not* demoting things.
 */
const tmpDirs: string[] = [];

function tmpDir(): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sizematch-')));
  tmpDirs.push(dir);
  return dir;
}

/** Writes a file of approximately `mb` megabytes. Sparse, so it costs nothing. */
function videoFile(p: string, mb: number) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const fd = fs.openSync(p, 'w');
  fs.ftruncateSync(fd, Math.max(1, Math.round(mb * 1024 * 1024)));
  fs.closeSync(fd);
}

afterEach(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('selectFolderFeatures', () => {
  it('picks the largest file and demotes much smaller siblings', () => {
    const result = selectFolderFeatures([
      { path: '/m/Film (2015)/Film.mkv', sizeBytes: 8_000_000_000 },
      { path: '/m/Film (2015)/Gag Reel.mkv', sizeBytes: 120_000_000 },
      { path: '/m/Film (2015)/Deleted Scenes.mkv', sizeBytes: 300_000_000 },
    ]);
    expect(result.features).toEqual(['/m/Film (2015)/Film.mkv']);
    expect(result.extras).toHaveLength(2);
  });

  it('demotes extras regardless of what they are called', () => {
    // The point of the change: no vocabulary required.
    const names = ['Gag Reel.mkv', 'Funny Bits.mkv', 'Bloopers 2020.mkv', 'An Odd Extra Name.mkv'];
    const result = selectFolderFeatures([
      { path: '/m/F/Film.mkv', sizeBytes: 5_000_000_000 },
      ...names.map((n) => ({ path: `/m/F/${n}`, sizeBytes: 90_000_000 })),
    ]);
    expect(result.features).toEqual(['/m/F/Film.mkv']);
    expect(result.extras).toHaveLength(names.length);
  });

  it('keeps a film whose title contains a former keyword', () => {
    // "The Interview" used to be silently dropped by keyword matching.
    const result = selectFolderFeatures([
      { path: '/m/The Interview (2014)/The Interview (2014).mkv', sizeBytes: 6_000_000_000 },
      { path: '/m/The Interview (2014)/trailer.mkv', sizeBytes: 60_000_000 },
    ]);
    expect(result.features).toEqual(['/m/The Interview (2014)/The Interview (2014).mkv']);
  });

  it('keeps a single file whatever its size', () => {
    // A source pointed straight at one file must still scan, even a tiny one.
    const result = selectFolderFeatures([{ path: '/m/Film.mkv', sizeBytes: 1_000 }]);
    expect(result.features).toEqual(['/m/Film.mkv']);
    expect(result.extras).toEqual([]);
  });

  it('keeps both halves of a split film of similar size', () => {
    // Demoting "cd2" here would lose half the movie.
    const result = selectFolderFeatures([
      { path: '/m/F/cd1.mkv', sizeBytes: 4_000_000_000 },
      { path: '/m/F/cd2.mkv', sizeBytes: 3_900_000_000 },
    ]);
    expect(result.features).toHaveLength(2);
    expect(result.extras).toEqual([]);
  });

  it('keeps a slightly smaller companion, such as a different cut', () => {
    const result = selectFolderFeatures([
      { path: '/m/F/Theatrical.mkv', sizeBytes: 7_000_000_000 },
      { path: '/m/F/Extended.mkv', sizeBytes: 6_500_000_000 },
    ]);
    expect(result.features).toHaveLength(2);
  });

  it('treats exactly the threshold as a feature', () => {
    const largest = 6_000_000_000;
    const result = selectFolderFeatures([
      { path: '/m/F/big.mkv', sizeBytes: largest },
      { path: '/m/F/edge.mkv', sizeBytes: Math.round(largest * FEATURE_SIZE_RATIO) },
    ]);
    expect(result.features).toContain('/m/F/edge.mkv');
  });

  it('keeps everything when sizes are unavailable', () => {
    // A stat failure must not be read as "small file, therefore an extra".
    const result = selectFolderFeatures([
      { path: '/m/F/a.mkv', sizeBytes: 0 },
      { path: '/m/F/b.mkv', sizeBytes: 0 },
    ]);
    expect(result.features).toHaveLength(2);
    expect(result.extras).toEqual([]);
  });

  it('never demotes every file', () => {
    const result = selectFolderFeatures([
      { path: '/m/F/a.mkv', sizeBytes: 5 },
      { path: '/m/F/b.mkv', sizeBytes: 1 },
    ]);
    expect(result.features).toHaveLength(1);
    expect(result.features[0]).toBe('/m/F/a.mkv');
  });

  it('handles an empty folder', () => {
    expect(selectFolderFeatures([])).toEqual({ features: [], extras: [] });
  });
});

describe('Movie scan by size', () => {
  it('indexes only the feature in a folder with extras — the reported bug', async () => {
    const root = tmpDir();
    const moviesRoot = path.join(root, 'Movies');
    const film = path.join(moviesRoot, 'Ant-Man (2015)');
    videoFile(path.join(film, 'Ant-Man (2015).mkv'), 8);
    videoFile(path.join(film, 'Featurettes', 'Gag Reel.mkv'), 0.2);
    videoFile(path.join(film, 'Featurettes', 'An Unhelpfully Named Clip.mkv'), 0.1);
    videoFile(path.join(film, 'sample.mkv'), 0.05);

    const db = new MediaDatabase(path.join(root, 'test.db'));
    const source = db.addSource({ name: 'Movies', path: moviesRoot, mediaKind: 'movie' });
    await new LibraryScanner(db).scanSource(source);

    expect(db.listMovies().map((m) => m.fileName)).toEqual(['Ant-Man (2015).mkv']);
  });

  it('ignores a subfolder even when it holds a larger video', async () => {
    // The rule is structural, not size-based: Featurettes/ is never a film folder.
    // A featurette can easily be bigger than a short film's feature, so size alone
    // must not decide this.
    const root = tmpDir();
    const moviesRoot = path.join(root, 'Movies');
    const film = path.join(moviesRoot, 'Ant-Man (2015)');
    videoFile(path.join(film, 'Ant-Man (2015).mkv'), 2);
    videoFile(path.join(film, 'Featurettes', 'Making Of.mkv'), 5); // larger!
    videoFile(path.join(film, 'Featurettes', 'Gag Reel.mkv'), 1);

    const db = new MediaDatabase(path.join(root, 'test.db'));
    const source = db.addSource({ name: 'Movies', path: moviesRoot, mediaKind: 'movie' });
    await new LibraryScanner(db).scanSource(source);

    const movies = db.listMovies();
    expect(movies).toHaveLength(1);
    expect(movies[0].fileName).toBe('Ant-Man (2015).mkv');
    expect(movies[0].title).not.toMatch(/making of|gag reel/i);
  });

  it('never treats a nested folder as its own film folder', async () => {
    // A film folder containing only subfolders must not promote a grandchild file.
    const root = tmpDir();
    const moviesRoot = path.join(root, 'Movies');
    videoFile(path.join(moviesRoot, 'Deep (2020)', 'disc1', 'movie.mkv'), 8);

    const db = new MediaDatabase(path.join(root, 'test.db'));
    const source = db.addSource({ name: 'Movies', path: moviesRoot, mediaKind: 'movie' });
    await new LibraryScanner(db).scanSource(source);

    // 'Deep (2020)' has no video at its own level, so it contributes nothing.
    expect(db.listMovies()).toHaveLength(0);
  });

  it('does not report movie-side samples as unmatched files', async () => {
    // Samples beside a film are expected; flagging them would bury real problems.
    const root = tmpDir();
    const moviesRoot = path.join(root, 'Movies');
    const film = path.join(moviesRoot, 'Dune (2021)');
    videoFile(path.join(film, 'Dune.mkv'), 9);
    videoFile(path.join(film, 'Dune.sample.mkv'), 0.1);

    const db = new MediaDatabase(path.join(root, 'test.db'));
    const source = db.addSource({ name: 'Movies', path: moviesRoot, mediaKind: 'movie' });
    await new LibraryScanner(db).scanSource(source);

    expect(db.listMovies()).toHaveLength(1);
    expect(db.listUnmatchedVideoFiles()).toHaveLength(0);
  });

  it('indexes the largest video directly in the source root', async () => {
    const root = tmpDir();
    const moviesRoot = path.join(root, 'Movies');
    videoFile(path.join(moviesRoot, 'Film (2020).mkv'), 7);
    videoFile(path.join(moviesRoot, 'Film (2020).sample.mkv'), 0.05);

    const db = new MediaDatabase(path.join(root, 'test.db'));
    const source = db.addSource({ name: 'Movies', path: moviesRoot, mediaKind: 'movie' });
    await new LibraryScanner(db).scanSource(source);

    expect(db.listMovies().map((m) => m.fileName)).toEqual(['Film (2020).mkv']);
  });

  it('handles flat layouts across folders independently', async () => {
    const root = tmpDir();
    const moviesRoot = path.join(root, 'Movies');
    videoFile(path.join(moviesRoot, 'Dune (2021)', 'Dune.mkv'), 10);
    videoFile(path.join(moviesRoot, 'Dune (2021)', 'trailer.mkv'), 0.1);
    // A second folder with only a small file must still be indexed.
    videoFile(path.join(moviesRoot, 'Tiny Film (1999)', 'Tiny.mkv'), 0.3);

    const db = new MediaDatabase(path.join(root, 'test.db'));
    const source = db.addSource({ name: 'Movies', path: moviesRoot, mediaKind: 'movie' });
    await new LibraryScanner(db).scanSource(source);

    expect(db.listMovies().map((m) => m.fileName).sort()).toEqual(['Dune.mkv', 'Tiny.mkv']);
  });

  it('keeps a real film whose title contains a former keyword', async () => {
    const root = tmpDir();
    const moviesRoot = path.join(root, 'Movies');
    videoFile(path.join(moviesRoot, 'The Interview (2014)', 'The Interview (2014).mkv'), 6);
    videoFile(path.join(moviesRoot, 'Trailer Park Boys (2006)', 'Trailer.Park.Boys.2006.mkv'), 5);

    const db = new MediaDatabase(path.join(root, 'test.db'));
    const source = db.addSource({ name: 'Movies', path: moviesRoot, mediaKind: 'movie' });
    await new LibraryScanner(db).scanSource(source);

    expect(db.listMovies()).toHaveLength(2);
  });

  it('removes leftover bogus records on rescan', async () => {
    // Existing libraries still hold featurettes indexed by the old keyword logic.
    const root = tmpDir();
    const moviesRoot = path.join(root, 'Movies');
    const film = path.join(moviesRoot, 'Ant-Man (2015)');
    videoFile(path.join(film, 'Ant-Man (2015).mkv'), 8);
    const extra = path.join(film, 'Featurettes', 'Gag Reel.mkv');
    videoFile(extra, 0.2);

    const db = new MediaDatabase(path.join(root, 'test.db'));
    const source = db.addSource({ name: 'Movies', path: moviesRoot, mediaKind: 'movie' });
    await new LibraryScanner(db).scanSource(source);
    expect(db.listMovies()).toHaveLength(1);

    // Simulate a record left behind by the pre-fix scanner.
    db.upsertMovie({
      ...db.listMovies()[0],
      filePath: extra,
      fileName: 'Gag Reel.mkv',
      folderPath: path.dirname(extra),
    });
    expect(db.listMovies()).toHaveLength(2);

    await new LibraryScanner(db).scanSource(source);
    expect(db.listMovies().map((m) => m.fileName)).toEqual(['Ant-Man (2015).mkv']);
  });

  it('leaves TV alone: extras are flagged, not dropped', async () => {
    const root = tmpDir();
    const tvRoot = path.join(root, 'TV');
    const show = path.join(tvRoot, 'Firefly (2002)');
    videoFile(path.join(show, 'Season 1', 'Firefly - S01E01 - Serenity.mkv'), 4);
    // Far smaller than the episode — the movie rule would discard it.
    videoFile(path.join(show, 'Featurettes', 'Gag Reel.mkv'), 0.1);

    const db = new MediaDatabase(path.join(root, 'test.db'));
    const source = db.addSource({ name: 'TV', path: tvRoot, mediaKind: 'tvshow' });
    await new LibraryScanner(db).scanSource(source);

    const showRecord = db.listTvShows()[0];
    expect(db.listEpisodesForShow(showRecord.id)).toHaveLength(1);
    expect(db.listUnmatchedVideoFiles().map((f) => f.fileName)).toContain('Gag Reel.mkv');
  });
});

describe('Real sample library', () => {
  it('finds every film and no extras', async () => {
    // Guards the most common real layout: one video per release folder, with
    // artwork and subtitles as siblings. Size selection must not disturb it.
    const source = path.resolve(process.cwd(), 'sample-library', 'Movies');
    if (!fs.existsSync(source)) return; // sample library not generated in this checkout

    const root = tmpDir();
    const db = new MediaDatabase(path.join(root, 'test.db'));
    const src = db.addSource({ name: 'Movies', path: source, mediaKind: 'movie' });
    await new LibraryScanner(db).scanSource(src);

    const movies = db.listMovies();
    expect(movies).toHaveLength(11);
    // Each folder's single video is the feature.
    for (const m of movies) expect(m.title).not.toMatch(/gag reel|sample|trailer/i);
  });
});
