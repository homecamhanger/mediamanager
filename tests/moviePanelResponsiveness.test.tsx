// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { MovieListEntry, MovieRecord } from '../src/shared/types.js';

/**
 * The regression this guards is a *rendering* one, so it needs a DOM.
 *
 * What the user described: "it's always one step behind". The cause was that detail
 * panels were rendered without a `key`, so React reused one instance across
 * selections. During the two sequential round-trips the *previous* film's title,
 * poster and NFO stayed on screen under the new selection. These tests assert the
 * property that was missing: after a selection changes, nothing from the previous
 * item is still rendered, and the new item is on screen before its request resolves.
 *
 * `api` is mocked at the module boundary so the timing of each request is under the
 * test's control — a real network would make the assertion a race.
 */

const getMovie = vi.fn<(id: number) => Promise<{ movie: MovieRecord }>>();
const readNfo = vi.fn(async (_kind: string, _id: number) => ({ xml: '', validation: null }));

vi.mock('../src/client/lib/api.js', () => ({
  api: {
    getMovie: (id: number) => getMovie(id),
    readNfo: (kind: string, id: number) => readNfo(kind, id),
    // The panel loads none of these on mount, but the module is imported wholesale.
    updateMovie: vi.fn(),
    listSubtitleTracks: vi.fn(async () => ({ tracks: [] })),
  },
  formatBytes: (n: number) => String(n),
  getArtworkUrl: () => '',
}));

vi.mock('../src/client/lib/useLibraryVocabulary.js', () => ({
  useLibraryVocabulary: () => ({
    movie: 'Movie',
    movies: 'Movies',
    tvShow: 'TV Show',
    tvShows: 'TV Shows',
    season: 'Season',
    seasons: 'Seasons',
    episode: 'Episode',
    episodes: 'Episodes',
  }),
}));

const { seedMovieFromList } = await import('../src/client/lib/detailSeed.js');
const { MovieDetailPanel } = await import('../src/client/components/MovieDetailPanel.js');

function entry(id: number, title: string): MovieListEntry {
  return {
    id,
    title,
    sortTitle: title,
    originalTitle: title,
    year: 2015,
    fileName: `${title}.mkv`,
    hasNfo: true,
    nfoValid: true,
    scraped: true,
    runtimeMinutes: 117,
    genres: [],
    tags: [],
    actors: [],
    ratings: [],
    userRating: null,
    watched: false,
    dateAdded: '2024-01-01',
    updatedAt: '2024-01-02',
    setId: null,
    setName: null,
    poster: `/poster/${id}`,
    fanart: null,
    resolution: null,
    videoCodec: null,
  } as unknown as MovieListEntry;
}

function record(e: MovieListEntry): MovieRecord {
  // Build from the seed so `artwork` and the other shaped objects are present;
  // spreading the list entry alone would omit them.
  return {
    ...seedMovieFromList(e),
    folderPath: '',
    filePath: '',
    fileSizeBytes: 0,
    movieHash: '',
    nfoPath: null,
    nfoWarnings: [],
    scrapedSource: null,
    premiered: null,
    plot: `Plot of ${e.title}`,
    tagline: '',
    outline: '',
    trailerUrl: '',
    mpaa: '',
    country: '',
    studios: [],
    directors: [],
    writers: [],
  } as unknown as MovieRecord;
}

const { detailCache } = await import('../src/client/lib/detailCache.js');
const { REFRESH_TIMING } = await import('../src/client/lib/useRefreshStatus.js');

// React needs to know it is in a test environment or `act` warns on every update.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  // Fake clocks so the indicator's timing is deterministic; the panels' own
  // promises still resolve through microtasks, which `advanceTimersByTimeAsync` flushes.
  vi.useFakeTimers();
  detailCache.clear();
  getMovie.mockReset();
  readNfo.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
});

async function render(ui: React.ReactElement) {
  await act(async () => {
    root.render(ui);
  });
}

/**
 * Waits out the indicator's announce threshold.
 *
 * The chip is deliberately not shown for refreshes that finish in a few
 * milliseconds, so an assertion about it has to let that timer pass first.
 */
async function untilAnnounced() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(REFRESH_TIMING.appearAfterMs + 10);
  });
}

describe('MovieDetailPanel responsiveness', () => {
  it('paints the newly selected movie from its seed before the request resolves', async () => {
    // A request that never settles: everything on screen must come from the seed.
    getMovie.mockImplementation(() => new Promise(() => {}));

    const antMan = entry(1, 'Ant-Man');
    await render(
      <MovieDetailPanel
        movieId={1}
        seed={seedMovieFromList(antMan)}
        onUpdated={() => {}}
      />,
    );

    expect(container.textContent).toContain('Ant-Man');
    expect(container.textContent).not.toContain('Loading movie details');
    // A refresh that drags on is announced rather than left implicit.
    await untilAnnounced();
    expect(container.textContent).toContain('Updating');
  });

  it('never shows the previous movie after switching selection', async () => {
    getMovie.mockImplementation(() => new Promise(() => {}));
    const antMan = entry(1, 'Ant-Man');

    await render(
      <MovieDetailPanel movieId={1} seed={seedMovieFromList(antMan)} onUpdated={() => {}} />,
    );
    expect(container.textContent).toContain('Ant-Man');

    // Same component instance, new id — exactly how App switches selection.
    const thor = entry(2, 'Thor');
    await render(
      <MovieDetailPanel movieId={2} seed={seedMovieFromList(thor)} onUpdated={() => {}} />,
    );

    expect(container.textContent).toContain('Thor');
    expect(container.textContent).not.toContain('Ant-Man');
    expect(container.textContent).not.toContain('Plot of Ant-Man');
  });

  it('replaces the seed with the full record when the request lands', async () => {
    let resolve: (v: { movie: MovieRecord }) => void = () => {};
    getMovie.mockImplementation(
      () => new Promise((r) => { resolve = r; }),
    );

    const antMan = entry(1, 'Ant-Man');
    await render(
      <MovieDetailPanel movieId={1} seed={seedMovieFromList(antMan)} onUpdated={() => {}} />,
    );
    // The seed has no plot; the record does.
    expect(container.textContent).not.toContain('Plot of Ant-Man');

    await act(async () => {
      resolve({ movie: record(antMan) });
    });

    expect(container.textContent).toContain('Plot of Ant-Man');
    // And the "Updating" chip is gone once the record is painted.
    expect(container.textContent).not.toContain('Updating');
  });

  it('paints instantly from cache when returning to a previously seen movie', async () => {
    const antMan = entry(1, 'Ant-Man');
    getMovie.mockResolvedValue({ movie: record(antMan) });
    const thor = entry(2, 'Thor');

    await render(
      <MovieDetailPanel movieId={1} seed={seedMovieFromList(antMan)} onUpdated={() => {}} />,
    );
    await act(async () => {});

    // Leave and come back. The second visit must paint the plot from cache while a
    // fresh request is still in flight.
    getMovie.mockImplementation(() => new Promise(() => {}));
    await render(
      <MovieDetailPanel movieId={2} seed={seedMovieFromList(thor)} onUpdated={() => {}} />,
    );
    await render(
      <MovieDetailPanel movieId={1} seed={seedMovieFromList(antMan)} onUpdated={() => {}} />,
    );

    expect(container.textContent).toContain('Plot of Ant-Man');
    await untilAnnounced();
    expect(container.textContent).toContain('Updating');
  });

  it('shows a skeleton rather than the previous item when there is no seed at all', async () => {
    getMovie.mockImplementation(() => new Promise(() => {}));
    const antMan = entry(1, 'Ant-Man');

    await render(
      <MovieDetailPanel movieId={1} seed={seedMovieFromList(antMan)} onUpdated={() => {}} />,
    );
    expect(container.textContent).toContain('Ant-Man');

    await render(<MovieDetailPanel movieId={3} onUpdated={() => {}} />);

    expect(container.textContent).not.toContain('Ant-Man');
    // Skeleton markup, not the old "Loading movie details..." text.
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });
});
