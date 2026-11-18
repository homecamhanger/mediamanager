// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ShowTreeNode } from '../src/client/lib/workspaceTypes.js';
import type { TvEpisodeRecord, TvShowRecord } from '../src/shared/types.js';

/**
 * Same regression as the movie panel, for shows and episodes: a selection must paint
 * *itself* immediately, never the item selected before it.
 *
 * Episodes add a wrinkle worth pinning down. Every episode reads the same
 * `GET /api/shows/:id` payload, so the cache key is the show, not the episode. That
 * means one request has to serve a whole click-through of a season — but it must
 * still resolve the *newly clicked* episode out of that payload, not the cached one.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const getShow = vi.fn<(id: number) => Promise<unknown>>();
const readNfo = vi.fn(async (_kind: string, _id: number) => ({ xml: '', validation: null }));

vi.mock('../src/client/lib/api.js', () => ({
  api: {
    getShow: (id: number) => getShow(id),
    readNfo: (kind: string, id: number) => readNfo(kind, id),
    updateShow: vi.fn(),
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

const { TvShowDetailPanel } = await import('../src/client/components/TvShowDetailPanel.js');
const { EpisodeDetailPanel } = await import('../src/client/components/EpisodeDetailPanel.js');
const { detailCache } = await import('../src/client/lib/detailCache.js');
const { REFRESH_TIMING } = await import('../src/client/lib/useRefreshStatus.js');
const { seedEpisodeFromTree, seedShowFromTree } = await import('../src/client/lib/detailSeed.js');

function show(id: number, title: string): TvShowRecord {
  return {
    id,
    title,
    year: 2005,
    plot: `Plot of ${title}`,
    artwork: { poster: `/poster/${id}`, fanart: null, banner: null, clearlogo: null, clearart: null, disc: null, landscape: null, thumb: null },
    artworkCandidates: {},
    genres: [],
    tags: [],
    actors: [],
    ratings: [],
    uniqueIds: {},
    studios: [],
    status: 'Continuing',
    mpaa: '',
    network: '',
    premiered: null,
    runtimeMinutes: 22,
    watched: false,
    userRating: null,
    seasonCount: 1,
    episodeCount: 2,
    episodeFileCount: 2,
    missingEpisodeCount: 0,
    hasNfo: false,
    nfoValid: null,
    sourceId: 0,
    folderPath: '',
    dateAdded: '2024-01-01',
    updatedAt: '2024-01-02',
  } as unknown as TvShowRecord;
}

function episode(id: number, showId: number, title: string): TvEpisodeRecord {
  return {
    id,
    showId,
    title,
    seasonNumber: 1,
    episodeNumber: id,
    displaySeason: 1,
    displayEpisode: id,
    aired: '2005-03-24',
    runtimeMinutes: 22,
    plot: `Plot of ${title}`,
    hasNfo: false,
    nfoValid: null,
    watched: false,
    artwork: { poster: null, fanart: null, banner: null, clearlogo: null, clearart: null, disc: null, landscape: null, thumb: null },
    artworkCandidates: {},
    parsedInfo: {},
    streamDetails: { video: [], audio: [], subtitle: [] },
    actors: [],
    ratings: [],
    uniqueIds: {},
    subtitles: [],
    multiEpisodeParts: [],
  } as unknown as TvEpisodeRecord;
}

const office = show(3, 'The Office');
const pilot = episode(1, 3, 'Pilot');
const diversityDay = episode(2, 3, 'Diversity Day');
const officeNode: ShowTreeNode = { show: office, seasons: [], episodes: [pilot, diversityDay] };

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  // Fake clocks so the indicator's timing is deterministic; the panels' own
  // promises still resolve through microtasks, which `advanceTimersByTimeAsync` flushes.
  vi.useFakeTimers();
  detailCache.clear();
  getShow.mockReset();
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

/** Lets the indicator's announce threshold pass; quick refreshes stay silent. */
async function untilAnnounced() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(REFRESH_TIMING.appearAfterMs + 10);
  });
}

describe('TvShowDetailPanel responsiveness', () => {
  it('paints the newly selected show from its seed before the request resolves', async () => {
    getShow.mockImplementation(() => new Promise(() => {}));

    await render(
      <TvShowDetailPanel
        showId={3}
        seed={seedShowFromTree(officeNode)}
        onUpdated={() => {}}
      />,
    );

    expect(container.textContent).toContain('The Office');
    await untilAnnounced();
    expect(container.textContent).toContain('Updating');
  });

  it('never shows the previous show after switching selection', async () => {
    getShow.mockImplementation(() => new Promise(() => {}));
    const other = show(4, 'Parks and Recreation');
    const otherNode: ShowTreeNode = { show: other, seasons: [], episodes: [] };

    await render(
      <TvShowDetailPanel showId={3} seed={seedShowFromTree(officeNode)} onUpdated={() => {}} />,
    );
    expect(container.textContent).toContain('The Office');

    await render(
      <TvShowDetailPanel showId={4} seed={seedShowFromTree(otherNode)} onUpdated={() => {}} />,
    );

    expect(container.textContent).toContain('Parks and Recreation');
    expect(container.textContent).not.toContain('The Office');
  });
});

describe('EpisodeDetailPanel responsiveness', () => {
  it('paints the newly selected episode from its seed before the request resolves', async () => {
    getShow.mockImplementation(() => new Promise(() => {}));

    await render(
      <EpisodeDetailPanel
        showId={3}
        episodeId={2}
        seed={seedEpisodeFromTree(officeNode, 2)}
        onSelectShow={() => {}}
        onUpdated={() => {}}
      />,
    );

    expect(container.textContent).toContain('Diversity Day');
    expect(container.textContent).not.toContain('Pilot');
    await untilAnnounced();
    expect(container.textContent).toContain('Updating');
  });

  it('never shows the previously selected episode after switching', async () => {
    getShow.mockImplementation(() => new Promise(() => {}));

    await render(
      <EpisodeDetailPanel
        showId={3}
        episodeId={1}
        seed={seedEpisodeFromTree(officeNode, 1)}
        onSelectShow={() => {}}
        onUpdated={() => {}}
      />,
    );
    expect(container.textContent).toContain('Pilot');

    await render(
      <EpisodeDetailPanel
        showId={3}
        episodeId={2}
        seed={seedEpisodeFromTree(officeNode, 2)}
        onSelectShow={() => {}}
        onUpdated={() => {}}
      />,
    );

    expect(container.textContent).toContain('Diversity Day');
    expect(container.textContent).not.toContain('Pilot');
  });

  it('serves a whole season click-through from one series request', async () => {
    const payload = {
      show: office,
      seasons: [],
      episodes: [pilot, diversityDay],
      missingEpisodes: [],
      unmatchedFiles: [],
    };
    getShow.mockResolvedValue(payload);

    await render(
      <EpisodeDetailPanel
        showId={3}
        episodeId={1}
        seed={seedEpisodeFromTree(officeNode, 1)}
        onSelectShow={() => {}}
        onUpdated={() => {}}
      />,
    );
    await act(async () => {});
    expect(getShow).toHaveBeenCalledTimes(1);

    await render(
      <EpisodeDetailPanel
        showId={3}
        episodeId={2}
        seed={seedEpisodeFromTree(officeNode, 2)}
        onSelectShow={() => {}}
        onUpdated={() => {}}
      />,
    );
    await act(async () => {});

    // Still one: the second episode was resolved out of the shared payload.
    expect(getShow).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Diversity Day');
  });

  it('does not paint a stale response for an episode the user already left', async () => {
    // Episode 1's request hangs; episode 2's resolves. When 1 finally lands it must
    // be discarded, or the panel would jump back to the wrong episode.
    let resolveFirst: (v: unknown) => void = () => {};
    getShow.mockImplementationOnce(
      () => new Promise((r) => { resolveFirst = r; }),
    );

    await render(
      <EpisodeDetailPanel
        showId={3}
        episodeId={1}
        seed={seedEpisodeFromTree(officeNode, 1)}
        onSelectShow={() => {}}
        onUpdated={() => {}}
      />,
    );

    getShow.mockResolvedValue({
      show: office,
      seasons: [],
      episodes: [pilot, diversityDay],
      missingEpisodes: [],
      unmatchedFiles: [],
    });
    await render(
      <EpisodeDetailPanel
        showId={3}
        episodeId={2}
        seed={seedEpisodeFromTree(officeNode, 2)}
        onSelectShow={() => {}}
        onUpdated={() => {}}
      />,
    );
    await act(async () => {});

    // Now the abandoned request lands.
    await act(async () => {
      resolveFirst({
        show: office,
        seasons: [],
        episodes: [pilot, diversityDay],
        missingEpisodes: [],
        unmatchedFiles: [],
      });
    });

    expect(container.textContent).toContain('Diversity Day');
  });
});
