import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { MediaSource, MovieRecord } from '../src/shared/types.js';
import { buildFolderProposals, collectOwnSidecars, proposalToPreview } from '../src/server/renamer/folderProposals.js';

/**
 * Proposals for films that cannot own a folder.
 *
 * This is the analysis behind a destructive action, so the tests care most about the
 * cases where it must *not* propose something: a film already alone in its folder, a
 * film whose destination is occupied, and — critically — sidecars that cannot be
 * attributed to one film. Moving a shared `poster.jpg` into a new folder would carry
 * the original bug forward rather than fixing it.
 */

const created: string[] = [];

function tempRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-proposals-'));
  created.push(dir);
  return dir;
}

function touch(file: string, bytes = 64) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.alloc(bytes, 7));
}

afterEach(() => {
  for (const dir of created.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const source = (root: string): MediaSource =>
  ({ id: 1, name: 'Movies', path: root, mediaKind: 'movie' }) as MediaSource;

function movie(over: Partial<MovieRecord> & { filePath: string; id: number }): MovieRecord {
  const base = path.basename(over.filePath, path.extname(over.filePath));
  return {
    folderPath: path.dirname(over.filePath),
    fileName: path.basename(over.filePath),
    title: base,
    year: 2010,
    sourceId: 1,
    nfoPath: null,
    subtitles: [],
    artwork: {
      poster: null,
      fanart: null,
      banner: null,
      clearlogo: null,
      clearart: null,
      disc: null,
      landscape: null,
      thumb: null,
    },
    ...over,
  } as unknown as MovieRecord;
}

/** Renders exactly like the default rename patterns would. */
const render = (m: MovieRecord) => ({
  folderName: `${m.title} (${m.year})`,
  fileBase: `${m.title} (${m.year})`,
});

function db(movies: MovieRecord[], src: MediaSource | null = source('/movies')) {
  return {
    listMovies: () => movies,
    getSource: (id: number) => (src && src.id === id ? src : null),
  };
}

describe('folder proposals', () => {
  it('flags a film sitting loose in the source root', () => {
    const root = tempRoot();
    const loose = movie({ id: 1, filePath: path.join(root, 'Dune.2021.mkv'), title: 'Dune', year: 2021 });
    touch(loose.filePath);

    const report = buildFolderProposals(db([loose], source(root)), render);

    expect(report.proposals).toHaveLength(1);
    const [p] = report.proposals;
    expect(p.problem).toBe('loose-in-root');
    expect(p.targetFolder).toBe(path.join(root, 'Dune (2021)'));
    expect(p.targetFilePath).toBe(path.join(root, 'Dune (2021)', 'Dune (2021).mkv'));
    expect(p.conflict).toBeNull();
    expect(report.summary.looseInRoot).toBe(1);
  });

  it('flags both films in a shared folder, and says how many share it', () => {
    const root = tempRoot();
    const dir = path.join(root, 'Shared (2010)');
    const one = movie({ id: 1, filePath: path.join(dir, 'One.mkv'), title: 'One' });
    const two = movie({ id: 2, filePath: path.join(dir, 'Two.mkv'), title: 'Two' });
    touch(one.filePath);
    touch(two.filePath);
    touch(path.join(dir, 'poster.jpg'));

    const report = buildFolderProposals(db([one, two], source(root)), render);

    expect(report.proposals).toHaveLength(2);
    expect(report.proposals.every((p) => p.problem === 'shared-folder')).toBe(true);
    expect(report.proposals.every((p) => p.filmsInFolder === 2)).toBe(true);
    expect(report.summary.sharedFolder).toBe(2);
  });

  it('never proposes anything for a film already alone in its own folder', () => {
    const root = tempRoot();
    const dir = path.join(root, 'Dune (2021)');
    const alone = movie({ id: 1, filePath: path.join(dir, 'Dune (2021).mkv'), title: 'Dune', year: 2021 });
    touch(alone.filePath);

    const report = buildFolderProposals(db([alone], source(root)), render);

    expect(report.proposals).toHaveLength(0);
  });

  it('reports a conflict when the destination is already occupied', () => {
    const root = tempRoot();
    // Loose film whose proposed folder name is already taken by a different film.
    const occupant = path.join(root, 'Dune (2021)');
    touch(path.join(occupant, 'Something Else.mkv'));
    const loose = movie({ id: 1, filePath: path.join(root, 'Dune.2021.mkv'), title: 'Dune', year: 2021 });
    touch(loose.filePath);

    const report = buildFolderProposals(db([loose], source(root)), render);

    const [p] = report.proposals;
    expect(p.conflict).toBe('Target folder already exists and is not empty');
    // Counted, but not offered as a safe one-click action.
    expect(report.summary.actionable).toBe(0);
  });

  it('gives a film with no surviving source a skip reason instead of a destination', () => {
    const root = tempRoot();
    const loose = movie({ id: 1, filePath: path.join(root, 'X.mkv'), title: 'X' });
    touch(loose.filePath);

    const report = buildFolderProposals(db([loose], null), render);

    expect(report.proposals).toHaveLength(0);
    expect(report.skipped[0]).toMatchObject({ movieId: 1, reason: 'Source no longer exists' });
  });

  it('orders root cases before shared-folder cases for review', () => {
    const root = tempRoot();
    const dir = path.join(root, 'Shared (2010)');
    const a = movie({ id: 1, filePath: path.join(dir, 'A.mkv'), title: 'A' });
    const b = movie({ id: 2, filePath: path.join(dir, 'B.mkv'), title: 'B' });
    const loose = movie({ id: 3, filePath: path.join(root, 'Loose.mkv'), title: 'Loose' });
    for (const m of [a, b, loose]) touch(m.filePath);

    const report = buildFolderProposals(db([a, b, loose], source(root)), render);

    expect(report.proposals[0].problem).toBe('loose-in-root');
    expect(report.proposals.slice(1).every((p) => p.problem === 'shared-folder')).toBe(true);
  });
});

describe('sidecar attribution', () => {
  it('takes only sidecars named after the video', () => {
    const root = tempRoot();
    const dir = path.join(root, 'Shared (2010)');
    const film = movie({ id: 1, filePath: path.join(dir, 'One (2010).mkv'), title: 'One' });
    touch(film.filePath);
    const ownNfo = path.join(dir, 'One (2010).nfo');
    const ownSub = path.join(dir, 'One (2010).en.srt');
    const ownArt = path.join(dir, 'One (2010)-poster.jpg');
    const sharedPoster = path.join(dir, 'poster.jpg');
    for (const f of [ownNfo, ownSub, ownArt, sharedPoster]) touch(f);

    film.nfoPath = ownNfo;
    film.subtitles = [{ filePath: ownSub, fileName: path.basename(ownSub), language: 'en', format: 'srt' }] as never;
    film.artwork.poster = ownArt;

    const sidecars = collectOwnSidecars(film);

    expect(sidecars.map((s) => s.kind).sort()).toEqual(['artwork', 'nfo', 'subtitle']);
    // The shared poster is exactly what caused the ambiguity — it must not travel.
    expect(sidecars.some((s) => s.oldPath === sharedPoster)).toBe(false);
    // A bare-name poster assigned to this film is equally ambiguous.
    film.artwork.poster = sharedPoster;
    expect(collectOwnSidecars(film).some((s) => s.oldPath === sharedPoster)).toBe(false);
  });

  it('ignores sidecars that are missing from disk', () => {
    const root = tempRoot();
    const dir = path.join(root, 'Shared (2010)');
    const film = movie({ id: 1, filePath: path.join(dir, 'One.mkv'), title: 'One' });
    touch(film.filePath);
    film.nfoPath = path.join(dir, 'One.nfo'); // never created

    expect(collectOwnSidecars(film)).toEqual([]);
  });
});

describe('proposal → rename preview', () => {
  it('renames sidecars alongside the video into the new folder', () => {
    const p = {
      movieId: 1,
      title: 'One',
      year: 2010,
      filePath: '/movies/Shared/One (2010).mkv',
      currentFolder: '/movies/Shared',
      sourceId: 1,
      sourceName: 'Movies',
      problem: 'shared-folder' as const,
      filmsInFolder: 2,
      targetFolder: '/movies/One (2010)',
      targetFilePath: '/movies/One (2010)/One (2010) [1080p].mkv',
      conflict: null,
      sidecars: [{ kind: 'subtitle' as const, oldPath: '/movies/Shared/One (2010).en.srt', newPath: '' }],
      blockedReason: null,
    };

    const preview = proposalToPreview(p);

    expect(preview.mediaType).toBe('movie');
    expect(preview.hasChanges).toBe(true);
    expect(preview.conflict).toBeNull();
    expect(preview.newPath).toBe(p.targetFilePath);
    expect(preview.sidecars[0]).toMatchObject({
      kind: 'subtitle',
      newPath: '/movies/One (2010)/One (2010) [1080p].en.srt',
    });
  });

  it('carries a conflict through so the executor skips it', () => {
    const preview = proposalToPreview({
      movieId: 1,
      title: 'One',
      year: 2010,
      filePath: '/movies/X.mkv',
      currentFolder: '/movies',
      sourceId: 1,
      sourceName: 'Movies',
      problem: 'loose-in-root',
      filmsInFolder: 1,
      targetFolder: '/movies/One (2010)',
      targetFilePath: '/movies/One (2010)/One.mkv',
      conflict: 'Target file already exists on disk',
      sidecars: [],
      blockedReason: null,
    });

    expect(preview.conflict).toBe('Target file already exists on disk');
  });
});
