import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The runner is the one place a task descriptor turns into a request. These tests
 * pin the mapping so a restored task cannot drift from a freshly enqueued one.
 */
const calls = vi.hoisted(() => ({ list: [] as Array<{ op: string; args: unknown[] }> }));

const rec = (op: string) => async (...args: unknown[]) => {
  calls.list.push({ op, args });
  return { validation: { valid: true }, updatedCount: 3 };
};

vi.mock('../src/client/lib/api.js', () => ({
  api: {
    applyEpisodeScrape: vi.fn(rec('applyEpisodeScrape')),
    applyMovieBundle: vi.fn(rec('applyMovieBundle')),
    applyShowBundle: vi.fn(rec('applyShowBundle')),
    updateMovie: vi.fn(rec('updateMovie')),
    saveNfo: vi.fn(rec('saveNfo')),
    setMovieArtwork: vi.fn(rec('setMovieArtwork')),
    setShowArtwork: vi.fn(rec('setShowArtwork')),
    setSeasonArtwork: vi.fn(rec('setSeasonArtwork')),
    updateEpisodeOrder: vi.fn(rec('updateEpisodeOrder')),
  },
}));

describe('File operation runner', () => {
  beforeEach(() => {
    calls.list = [];
    vi.resetModules();
  });

  async function loadRunner() {
    const mod = await import('../src/client/lib/fileOperationRunner.js');
    mod.registerFileOperationRunner();
    return mod;
  }

  it('routes each task kind to the matching endpoint', async () => {
    const { runFileOperationTask } = await loadRunner();
    const bundle = { title: 'X' } as never;

    await runFileOperationTask({
      kind: 'episodeScrape',
      episodeId: 11,
      payload: { parts: [], writeNfo: true },
    });
    await runFileOperationTask({ kind: 'movieBundle', movieId: 22, bundle, artwork: { poster: 'u' } });
    await runFileOperationTask({ kind: 'showBundle', showId: 33, bundle });
    await runFileOperationTask({ kind: 'movieUpdate', movieId: 44, patch: { title: 'T' } });
    await runFileOperationTask({ kind: 'nfo', mediaType: 'movie', mediaId: 55, xml: '<x/>' });
    await runFileOperationTask({ kind: 'movieArtwork', movieId: 66, artKind: 'poster', url: 'u' });
    await runFileOperationTask({ kind: 'showArtwork', showId: 77, artKind: 'fanart', url: 'u' });
    await runFileOperationTask({ kind: 'seasonArtwork', seasonId: 88, artKind: 'poster', url: 'u' });
    await runFileOperationTask({
      kind: 'episodeOrder',
      showId: 99,
      mode: 'display',
      items: [{ episodeId: 1, targetSeason: 1, targetEpisode: 2 }],
    });

    expect(calls.list.map((c) => c.op)).toEqual([
      'applyEpisodeScrape',
      'applyMovieBundle',
      'applyShowBundle',
      'updateMovie',
      'saveNfo',
      'setMovieArtwork',
      'setShowArtwork',
      'setSeasonArtwork',
      'updateEpisodeOrder',
    ]);
  });

  it('passes the persisted arguments through unchanged', async () => {
    const { runFileOperationTask } = await loadRunner();
    await runFileOperationTask({ kind: 'nfo', mediaType: 'tvshow', mediaId: 5, xml: '<episode/>' });
    expect(calls.list[0].args).toEqual(['tvshow', 5, '<episode/>']);
  });

  it('reports the number of rewritten NFOs in the detail line', async () => {
    const { runFileOperationTask } = await loadRunner();
    const res = await runFileOperationTask({
      kind: 'episodeOrder',
      showId: 1,
      mode: 'display',
      items: [],
    });
    expect(res.detail).toContain('3 NFO file(s)');
  });

  it('is idempotent so a double registration does not double-run', async () => {
    const mod = await loadRunner();
    mod.registerFileOperationRunner();
    mod.registerFileOperationRunner();
    await mod.runFileOperationTask({ kind: 'nfo', mediaType: 'movie', mediaId: 1, xml: '<x/>' });
    expect(calls.list).toHaveLength(1);
  });
});
