import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MediaDatabase } from '../src/server/db/database.js';
import { renderRenameTemplate, RenamerEngine } from '../src/server/renamer/renamerEngine.js';
import { LibraryScanner } from '../src/server/scanner/libraryScanner.js';
import { createMinimalValidMp4 } from '../src/server/scanner/mediaProbe.js';

const tmpDirs: string[] = [];

afterEach(() => {
  for (const d of tmpDirs) {
    fs.rmSync(d, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

describe('RenamerEngine', () => {
  it('renders templates and drops empty optional blocks cleanly', () => {
    const out = renderRenameTemplate(
      '{title} ({year}){ - {edition}}{ [{resolution} {video_codec}]}',
      { title: 'Arrival: Story', year: 2016, edition: null, resolution: '1080p', video_codec: 'HEVC' },
      { colonReplacement: 'dash', spaceReplacement: 'space' }
    );
    expect(out).toBe('Arrival - Story (2016) [1080p HEVC]');
  });

  it('renames movies + NFO + subtitle + artwork and cleanly reverts via Undo', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-rename-'));
    tmpDirs.push(tmp);

    const moviesDir = path.join(tmp, 'Movies');
    const messyDir = path.join(moviesDir, 'Inception.2010.1080p.WEB-DL');
    fs.mkdirSync(messyDir, { recursive: true });

    const videoFile = path.join(messyDir, 'Inception.2010.1080p.WEB-DL.mp4');
    fs.writeFileSync(videoFile, createMinimalValidMp4({ width: 1920, height: 1080, durationSeconds: 8880 }));
    fs.writeFileSync(path.join(messyDir, 'Inception.2010.1080p.WEB-DL.en.srt'), '1\n00:00:01,000 --> 00:00:03,000\nDream.\n');
    fs.writeFileSync(path.join(messyDir, 'movie.nfo'), '<movie><title>Inception</title><year>2010</year><uniqueid type="imdb" default="true">tt1375666</uniqueid></movie>');

    const db = new MediaDatabase(path.join(tmp, 'test.db'));
    const src = db.addSource({ name: 'Movies', path: moviesDir, mediaKind: 'movie' });
    const scanner = new LibraryScanner(db);
    await scanner.scanSource(src);

    const movie = db.listMovies()[0];
    expect(movie.title).toBe('Inception');
    expect(movie.subtitles).toHaveLength(1);

    const renamer = new RenamerEngine(db);
    const previews = renamer.previewMovieRename([movie.id]);
    expect(previews[0].hasChanges).toBe(true);
    expect(previews[0].newPath).toContain('Inception (2010) [imdbid-tt1375666]');

    const execRes = renamer.executeRename(previews, true);
    expect(execRes.movedCount).toBe(1);
    expect(fs.existsSync(previews[0].newPath)).toBe(true);
    expect(fs.existsSync(videoFile)).toBe(false);

    // Undo should put video, NFO, and subtitle right back
    const undoRes = renamer.revertBatch(execRes.batchId);
    expect(undoRes.revertedFiles).toBeGreaterThanOrEqual(3);
    expect(fs.existsSync(videoFile)).toBe(true);
    expect(fs.existsSync(path.join(messyDir, 'Inception.2010.1080p.WEB-DL.en.srt'))).toBe(true);

    db.close();
  });
});
