import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileOperationQueue, fileOperations } from '../src/client/lib/fileOperations.js';
import { setTaskRunner } from '../src/client/lib/fileOperationTasks.js';

/**
 * Tests drive effects through the task runner rather than closures, mirroring how
 * the app builds operations: a serializable task plus a registry entry.
 */
type Impl = (task: { kind: string; key?: string }) => Promise<{ detail: string } | void>;
let impl: Impl = async () => ({ detail: 'ok' });

/** A tiny task whose meaning is defined by the current `impl`. */
const task = (key: string) => ({ kind: 'movieUpdate', movieId: 1, patch: { key } } as never);

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
    impl = async () => ({ detail: 'ok' });
    setTaskRunner((t) => impl(t as never) as Promise<{ detail: string } | void> as never);
  });

  afterEach(() => {
    setTaskRunner(null);
  });

  beforeEach(() => {
    queue = new FileOperationQueue();
  });

  it('runs an operation and records success with its detail', async () => {
    impl = async () => ({ detail: 'saved' });
    const id = queue.enqueue({ label: 'Write NFO', task: task('a') });
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

    impl = async () => {
      if (order.length === 0) {
        order.push('first-start');
        await gate.promise;
        order.push('first-end');
      } else {
        order.push('second-start');
      }
      return { detail: 'ok' };
    };
    queue.enqueue({ label: 'first', task: task('a') });
    queue.enqueue({ label: 'second', task: task('b') });

    // Let the first start; the second must not have begun.
    await vi.waitFor(() => expect(order).toContain('first-start'));
    expect(order).not.toContain('second-start');

    gate.resolve();
    await vi.waitFor(() => expect(order).toContain('second-start'));
    expect(order).toEqual(['first-start', 'first-end', 'second-start']);
  });

  it('marks a rejected operation as failed and keeps the message', async () => {
    impl = async () => {
      throw new Error('EACCES: permission denied');
    };
    queue.enqueue({ label: 'Write NFO', task: task('a') });
    await vi.waitFor(() => expect(queue.snapshot()[0].status).toBe('error'));
    expect(queue.snapshot()[0].error).toBe('EACCES: permission denied');
  });

  it('keeps a failure queued for retry and can succeed on the second attempt', async () => {
    let attempts = 0;
    impl = async () => {
      attempts++;
      if (attempts === 1) throw new Error('network drive asleep');
      return { detail: 'saved on retry' };
    };
    const id = queue.enqueue({ label: 'Write NFO', task: task('a') });

    await vi.waitFor(() => expect(queue.snapshot()[0].status).toBe('error'));
    expect(queue.snapshot()[0].error).toBe('network drive asleep');

    queue.retry(id);
    await vi.waitFor(() => expect(queue.snapshot()[0].status).toBe('done'));
    expect(attempts).toBe(2);
    expect(queue.snapshot()[0].detail).toBe('saved on retry');
  });

  it('has no effect retrying something that did not fail', async () => {
    impl = async () => ({ detail: 'done' });
    const id = queue.enqueue({ label: 'ok', task: task('a') });
    await vi.waitFor(() => expect(queue.snapshot()[0].status).toBe('done'));
    queue.retry(id);
    expect(queue.snapshot()[0].status).toBe('done');
  });

  it('counts queued and running operations as active', async () => {
    const gate = deferred();
    impl = async () => {
      await gate.promise;
      return { detail: 'a' };
    };
    queue.enqueue({ label: 'a', task: task('a') });
    impl = async () => ({ detail: 'b' });
    queue.enqueue({ label: 'b', task: task('b') });
    expect(queue.activeCount()).toBe(2);
    gate.resolve();
    await vi.waitFor(() => expect(queue.activeCount()).toBe(0));
  });

  it('dismisses an operation and prevents a dismissed queued job from running', async () => {
    const gate = deferred();
    const ran: string[] = [];
    impl = async () => {
      await gate.promise;
      return { detail: 'blocker' };
    };
    queue.enqueue({ label: 'blocker', task: task('a') });
    impl = async () => {
      ran.push('queued');
      return { detail: 'queued' };
    };
    const queuedId = queue.enqueue({ label: 'queued', task: task('b') });

    queue.dismiss(queuedId);
    gate.resolve();
    await vi.waitFor(() => expect(queue.snapshot()).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(ran).toEqual([]);
  });

  it('notifies subscribers with immutable snapshots', async () => {
    const seen: number[] = [];
    const unsubscribe = queue.subscribe((ops) => seen.push(ops.length));
    queue.enqueue({ label: 'one', task: task('a') });
    await vi.waitFor(() => expect(seen.length).toBeGreaterThan(1));
    unsubscribe();
    const before = seen.length;
    queue.enqueue({ label: 'two', task: task('b') });
    await new Promise((r) => setTimeout(r, 20));
    expect(seen.length).toBe(before);
  });

  it('auto-clears a completed operation', async () => {
    vi.useFakeTimers();
    try {
      impl = async () => ({ detail: 'ok' });
      queue.enqueue({ label: 'quick', task: task('a') });
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
    impl = async () => {
      throw new Error('x');
    };
    queue.enqueue({ label: 'failed', task: task('a') });
    await vi.waitFor(() => expect(queue.snapshot().some((o) => o.status === 'error')).toBe(true));

    impl = async () => ({ detail: 'ok' });
    const id = queue.enqueue({ label: 'done', task: task('b') });
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
