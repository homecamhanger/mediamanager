import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileOperationQueue, fileOperations } from '../src/client/lib/fileOperations.js';

/**
 * A deferrable promise lets tests advance an operation's completion deliberately,
 * which is what makes the sequential-drain behaviour observable.
 */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('File operation queue', () => {
  let queue: FileOperationQueue;

  beforeEach(() => {
    queue = new FileOperationQueue();
  });

  it('runs an operation and records success with its detail', async () => {
    const id = queue.enqueue({ label: 'Write NFO', run: async () => 'saved' });
    await vi.waitFor(() => expect(queue.snapshot()[0].status).toBe('done'));
    const op = queue.snapshot().find((o) => o.id === id)!;
    expect(op.status).toBe('done');
    expect(op.detail).toBe('saved');
    expect(op.error).toBeNull();
    expect(op.finishedAt).not.toBeNull();
  });

  it('runs operations one at a time, in order', async () => {
    const gate = deferred();
    const order: string[] = [];

    queue.enqueue({
      label: 'first',
      run: async () => {
        order.push('first-start');
        await gate.promise;
        order.push('first-end');
      },
    });
    queue.enqueue({
      label: 'second',
      run: async () => {
        order.push('second-start');
      },
    });

    // Let the first start; the second must not have begun.
    await vi.waitFor(() => expect(order).toContain('first-start'));
    expect(order).not.toContain('second-start');

    gate.resolve();
    await vi.waitFor(() => expect(order).toContain('second-start'));
    expect(order).toEqual(['first-start', 'first-end', 'second-start']);
  });

  it('marks a rejected operation as failed and keeps the message', async () => {
    queue.enqueue({
      label: 'Write NFO',
      run: async () => {
        throw new Error('EACCES: permission denied');
      },
    });
    await vi.waitFor(() => expect(queue.snapshot()[0].status).toBe('error'));
    expect(queue.snapshot()[0].error).toBe('EACCES: permission denied');
  });

  it('keeps a failure queued for retry and can succeed on the second attempt', async () => {
    let attempts = 0;
    const id = queue.enqueue({
      label: 'Write NFO',
      run: async () => {
        attempts++;
        if (attempts === 1) throw new Error('network drive asleep');
        return 'saved on retry';
      },
    });

    await vi.waitFor(() => expect(queue.snapshot()[0].status).toBe('error'));
    expect(queue.snapshot()[0].error).toBe('network drive asleep');

    queue.retry(id);
    await vi.waitFor(() => expect(queue.snapshot()[0].status).toBe('done'));
    expect(attempts).toBe(2);
    expect(queue.snapshot()[0].detail).toBe('saved on retry');
  });

  it('has no effect retrying something that did not fail', async () => {
    const id = queue.enqueue({ label: 'ok', run: async () => 'done' });
    await vi.waitFor(() => expect(queue.snapshot()[0].status).toBe('done'));
    queue.retry(id);
    expect(queue.snapshot()[0].status).toBe('done');
  });

  it('counts queued and running operations as active', async () => {
    const gate = deferred();
    queue.enqueue({ label: 'a', run: () => gate.promise });
    queue.enqueue({ label: 'b', run: async () => {} });
    expect(queue.activeCount()).toBe(2);
    gate.resolve();
    await vi.waitFor(() => expect(queue.activeCount()).toBe(0));
  });

  it('dismisses an operation and prevents a dismissed queued job from running', async () => {
    const gate = deferred();
    const ran: string[] = [];
    queue.enqueue({
      label: 'blocker',
      run: async () => {
        await gate.promise;
      },
    });
    const queuedId = queue.enqueue({
      label: 'queued',
      run: async () => {
        ran.push('queued');
      },
    });

    queue.dismiss(queuedId);
    gate.resolve();
    await vi.waitFor(() => expect(queue.snapshot()).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(ran).toEqual([]);
  });

  it('notifies subscribers with immutable snapshots', async () => {
    const seen: number[] = [];
    const unsubscribe = queue.subscribe((ops) => seen.push(ops.length));
    queue.enqueue({ label: 'one', run: async () => {} });
    await vi.waitFor(() => expect(seen.length).toBeGreaterThan(1));
    unsubscribe();
    const before = seen.length;
    queue.enqueue({ label: 'two', run: async () => {} });
    await new Promise((r) => setTimeout(r, 20));
    expect(seen.length).toBe(before);
  });

  it('auto-clears a completed operation', async () => {
    vi.useFakeTimers();
    try {
      queue.enqueue({ label: 'quick', run: async () => 'ok' });
      await vi.waitFor(() => expect(queue.snapshot()[0]?.status).toBe('done'));
      expect(queue.snapshot()).toHaveLength(1);
      vi.advanceTimersByTime(6000);
      expect(queue.snapshot()).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears only finished operations', async () => {
    // Sequential execution means a pending job cannot fail while an earlier one
    // still runs, so finish the failure first and leave a second one queued.
    queue.enqueue({ label: 'failed', run: async () => { throw new Error('x'); } });
    await vi.waitFor(() => expect(queue.snapshot().some((o) => o.status === 'error')).toBe(true));

    const id = queue.enqueue({ label: 'done', run: async () => 'ok' });
    await vi.waitFor(() => expect(queue.snapshot().find((o) => o.id === id)?.status).toBe('done'));

    queue.clearFinished();
    const labels = queue.snapshot().map((o) => o.label);
    // Failures survive a clear; successes are removed.
    expect(labels).toEqual(['failed']);
  });

  it('exposes a shared singleton for the app', () => {
    expect(fileOperations).toBeInstanceOf(FileOperationQueue);
  });
});
