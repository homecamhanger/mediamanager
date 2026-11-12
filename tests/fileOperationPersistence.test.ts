import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileOperationQueue } from '../src/client/lib/fileOperations.js';
import { runFileOperationTask, setTaskRunner } from '../src/client/lib/fileOperationTasks.js';

/**
 * Persistence and restore behaviour for the file-operation queue.
 *
 * IndexedDB is not available under the test runner, so `fileOperationStorage` is
 * mocked with an in-memory array. That is deliberate: it exercises the real
 * hydrate/persist code paths in the queue while letting the test inspect exactly
 * what would have been written to disk.
 */
const store = vi.hoisted(() => ({ rows: [] as unknown[] }));

vi.mock('../src/client/lib/fileOperationStorage.js', () => ({
  FILE_OPS_SCHEMA: 1,
  readPersistedOperations: async () => store.rows as never[],
  writePersistedOperations: async (rows: unknown[]) => {
    store.rows = JSON.parse(JSON.stringify(rows));
  },
}));

describe('File operation persistence', () => {
  beforeEach(() => {
    store.rows = [];
    setTaskRunner(async () => ({ detail: 'ok' }));
  });

  it('persists a queued task in serializable form', async () => {
    const queue = new FileOperationQueue();
    const gate = new Promise(() => {}); // never resolves: stays queued
    setTaskRunner(async () => {
      await gate;
      return { detail: 'never' };
    });

    queue.enqueue({
      label: 'Write NFO · Movie',
      task: { kind: 'movieUpdate', movieId: 7, patch: { title: 'X' } },
    });

    await vi.waitFor(() => expect(store.rows.length).toBe(1));
    const row = store.rows[0] as Record<string, unknown>;
    expect(row.label).toBe('Write NFO · Movie');
    // The task must be plain data: no functions anywhere.
    expect(JSON.stringify(row.task)).toBe('{"kind":"movieUpdate","movieId":7,"patch":{"title":"X"}}');
    expect(row.schema).toBe(1);
  });

  it('drops finished operations from storage', async () => {
    const queue = new FileOperationQueue();
    setTaskRunner(async () => ({ detail: 'written' }));
    queue.enqueue({ label: 'Write', task: { kind: 'nfo', mediaType: 'movie', mediaId: 1, xml: '<x/>' } });

    await vi.waitFor(() => expect(queue.snapshot()[0]?.status).toBe('done'));
    await vi.waitFor(() => expect(store.rows.length).toBe(0));
  });

  it('keeps failures in storage so they survive a reload', async () => {
    const queue = new FileOperationQueue();
    setTaskRunner(async () => {
      throw new Error('permission denied');
    });
    queue.enqueue({ label: 'Write', task: { kind: 'nfo', mediaType: 'movie', mediaId: 1, xml: '<x/>' } });

    await vi.waitFor(() => expect(queue.snapshot()[0]?.status).toBe('error'));
    await vi.waitFor(() => expect(store.rows.length).toBe(1));
    const row = store.rows[0] as Record<string, unknown>;
    expect(row.status).toBe('error');
    expect(row.error).toBe('permission denied');
  });

  it('restores queued work after a reload and runs it', async () => {
    store.rows = [
      {
        schema: 1,
        id: 'op-4',
        label: 'Write NFO · Restored',
        task: { kind: 'movieUpdate', movieId: 3, patch: {} },
        status: 'queued',
        error: null,
        queuedAt: Date.now(),
      },
    ];

    const ran: string[] = [];
    setTaskRunner(async (t) => {
      ran.push((t as { kind: string }).kind);
      return { detail: 'ok' };
    });

    const queue = new FileOperationQueue();
    const restored = await queue.hydrate();

    expect(restored).toBe(1);
    await vi.waitFor(() => expect(queue.snapshot()[0]?.status).toBe('done'));
    expect(ran).toEqual(['movieUpdate']);
    expect(queue.snapshot()[0].restored).toBe(true);
  });

  it('re-runs an operation that was mid-flight when the page went away', async () => {
    // "running" cannot be assumed complete: the request may never have been sent.
    store.rows = [
      {
        schema: 1,
        id: 'op-9',
        label: 'Artwork · Poster',
        task: { kind: 'movieArtwork', movieId: 2, artKind: 'poster', url: 'https://x/p.jpg' },
        status: 'running',
        error: null,
        queuedAt: Date.now(),
      },
    ];
    const ran: string[] = [];
    setTaskRunner(async (t) => {
      ran.push((t as { kind: string }).kind);
      return { detail: 'ok' };
    });

    const queue = new FileOperationQueue();
    await queue.hydrate();
    await vi.waitFor(() => expect(queue.snapshot()[0]?.status).toBe('done'));
    expect(ran).toEqual(['movieArtwork']);
  });

  it('restores a previously failed operation without retrying it automatically', async () => {
    store.rows = [
      {
        schema: 1,
        id: 'op-12',
        label: 'Write NFO · Failed',
        task: { kind: 'nfo', mediaType: 'movie', mediaId: 5, xml: '<x/>' },
        status: 'error',
        error: 'disk full',
        queuedAt: Date.now(),
      },
    ];
    const ran: string[] = [];
    setTaskRunner(async () => {
      ran.push('ran');
      return { detail: 'ok' };
    });

    const queue = new FileOperationQueue();
    await queue.hydrate();
    await new Promise((r) => setTimeout(r, 20));

    // Still failed, still visible, not silently retried.
    expect(ran).toEqual([]);
    expect(queue.snapshot()[0].status).toBe('error');
    expect(queue.snapshot()[0].error).toBe('disk full');
  });

  it('never reuses an id that a restored operation already occupies', async () => {
    store.rows = [
      {
        schema: 1,
        id: 'op-50',
        label: 'Old',
        task: { kind: 'nfo', mediaType: 'movie', mediaId: 1, xml: '<x/>' },
        status: 'error',
        error: 'x',
        queuedAt: Date.now(),
      },
    ];
    const queue = new FileOperationQueue();
    await queue.hydrate();
    const fresh = queue.enqueue({ label: 'New', task: { kind: 'nfo', mediaType: 'movie', mediaId: 2, xml: '<y/>' } });
    expect(fresh).not.toBe('op-50');
    expect(queue.snapshot().filter((o) => o.id === fresh)).toHaveLength(1);
  });

  it('hydrates only once', async () => {
    store.rows = [
      {
        schema: 1,
        id: 'op-2',
        label: 'One',
        task: { kind: 'nfo', mediaType: 'movie', mediaId: 1, xml: '<x/>' },
        status: 'error',
        error: 'x',
        queuedAt: Date.now(),
      },
    ];
    const queue = new FileOperationQueue();
    expect(await queue.hydrate()).toBe(1);
    expect(await queue.hydrate()).toBe(0);
    expect(queue.snapshot()).toHaveLength(1);
  });

  it('throws a clear error when a task runs with no registered runner', async () => {
    setTaskRunner(null);
    await expect(
      runFileOperationTask({ kind: 'nfo', mediaType: 'movie', mediaId: 1, xml: '<x/>' })
    ).rejects.toThrow('No file-operation runner registered');
  });
});
