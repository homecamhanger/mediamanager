/**
 * Background file-operation queue.
 *
 * Several actions write to disk — NFO files, artwork, scraped metadata — and the
 * UI used to block on them: modals sat on a spinner with only "Cancel" available,
 * and artwork did not appear until the write finished. On a network drive with
 * slow spin-up that meant staring at a modal, or thinking the click did nothing.
 *
 * Now the UI updates immediately and the write is handed to this queue, which:
 *  - runs operations **one at a time** (sequential), because these are disk writes
 *    against the same share and parallel bursts make latency worse;
 *  - reports state through a subscribable snapshot so a toast can render it;
 *  - keeps failures visible until dismissed, with a retry, instead of losing them
 *    when a dialog closes;
 *  - auto-clears successes after a short delay.
 *
 * The logic here is deliberately framework-free so it can be tested directly.
 *
 * Persistence: operations now carry a serializable `FileOperationTask` rather
 * than a closure, so anything still queued is written to IndexedDB and rebuilt
 * on the next load. Before that, a refresh silently stranded pending writes.
 */

import { FILE_OPS_SCHEMA, readPersistedOperations, writePersistedOperations } from './fileOperationStorage.js';
import { runFileOperationTask, type FileOperationTask } from './fileOperationTasks.js';

export type FileOperationStatus = 'queued' | 'running' | 'done' | 'error';

export interface FileOperation {
  id: string;
  label: string;
  status: FileOperationStatus;
  error: string | null;
  /** Epoch ms when the operation entered the queue. */
  queuedAt: number;
  /** Epoch ms when it finished (done or error). */
  finishedAt: number | null;
  /** Non-fatal notes, e.g. "updated 4 episodes". */
  detail: string | null;
  /** True when this operation was restored from a previous page load. */
  restored?: boolean;
}

export interface FileOperationInput {
  label: string;
  /** What to write. Serializable, so it survives a refresh. */
  task: FileOperationTask;
  /**
   * Optional in-page follow-up (reload a panel, notify a parent). Runs after the
   * write succeeds. Deliberately not persisted: after a refresh the panel that
   * wanted it is gone, and the shared `onUpdated` refresh covers the list.
   */
  onApplied?: () => void;
}

type Listener = (ops: FileOperation[]) => void;

const AUTO_CLEAR_SUCCESS_MS = 6000;

let nextId = 1;

export class FileOperationQueue {
  private ops: FileOperation[] = [];
  private pending: string[] = [];
  private tasks = new Map<string, FileOperationTask>();
  private hooks = new Map<string, (() => void) | undefined>();
  private running = false;
  private listeners = new Set<Listener>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private hydrated = false;
  private persisting: Promise<void> = Promise.resolve();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  snapshot(): FileOperation[] {
    return this.ops.map((o) => ({ ...o }));
  }

  /** Operations still queued or running. */
  activeCount(): number {
    return this.ops.filter((o) => o.status === 'queued' || o.status === 'running').length;
  }

  enqueue(input: FileOperationInput): string {
    const id = `op-${nextId++}`;
    this.ops = [
      ...this.ops,
      {
        id,
        label: input.label,
        status: 'queued',
        error: null,
        queuedAt: Date.now(),
        finishedAt: null,
        detail: null,
      },
    ];
    this.tasks.set(id, input.task);
    this.hooks.set(id, input.onApplied);
    this.pending.push(id);
    this.emit();
    this.persist();
    void this.drain();
    return id;
  }

  /** Re-run a failed operation. Its label and runner are retried as-is. */
  retry(id: string): void {
    const op = this.ops.find((o) => o.id === id);
    if (!op || op.status !== 'error' || !this.tasks.has(id)) return;
    this.update(id, { status: 'queued', error: null, finishedAt: null });
    this.pending.push(id);
    this.persist();
    void this.drain();
  }

  dismiss(id: string): void {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    this.ops = this.ops.filter((o) => o.id !== id);
    this.tasks.delete(id);
    this.hooks.delete(id);
    this.emit();
    this.persist();
  }

  /** Remove all finished operations (used by "Clear" in the toast). */
  clearFinished(): void {
    for (const op of this.ops) {
      if (op.status === 'done') {
        clearTimeout(this.timers.get(op.id));
        this.timers.delete(op.id);
      }
    }
    this.ops = this.ops.filter((o) => o.status !== 'done');
    this.emit();
  }

  /** Test/maintenance hook: drop everything, including queued work. */
  reset(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    this.ops = [];
    this.pending = [];
    this.tasks.clear();
    this.hooks.clear();
    this.running = false;
    this.emit();
    this.persist();
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.pending.length > 0) {
        const id = this.pending.shift()!;
        // A dismissed operation must not run.
        const task = this.tasks.get(id);
        if (!this.ops.some((o) => o.id === id) || !task) continue;
        this.update(id, { status: 'running' });
        this.persist();
        try {
          const result = await runFileOperationTask(task);
          this.hooks.get(id)?.();
          this.update(id, {
            status: 'done',
            finishedAt: Date.now(),
            detail: result?.detail ?? null,
          });
          this.scheduleAutoClear(id);
        } catch (err) {
          this.update(id, {
            status: 'error',
            error: err instanceof Error ? err.message : String(err),
            finishedAt: Date.now(),
          });
        }
        this.persist();
      }
    } finally {
      this.running = false;
    }
  }

  /**
   * Rebuilds queued work saved by a previous page load.
   *
   * Restored operations that were `running` when the page went away are re-queued
   * rather than assumed complete: the request may never have reached the server,
   * and these writes are idempotent. Safe to call more than once.
   */
  async hydrate(): Promise<number> {
    if (this.hydrated) return 0;
    this.hydrated = true;
    const saved = await readPersistedOperations();
    if (saved.length === 0) return 0;

    let restored = 0;
    for (const row of saved) {
      // Never resurrect something already live (e.g. hydrate raced an enqueue).
      if (this.ops.some((o) => o.id === row.id)) continue;
      const task = row.task as FileOperationTask;
      this.tasks.set(row.id, task);
      // A write that was mid-flight is queued again; a failure stays failed so it
      // is visible with its retry button instead of silently retrying on every load.
      const wasError = row.status === 'error';
      this.ops = [
        ...this.ops,
        {
          id: row.id,
          label: row.label,
          status: wasError ? 'error' : 'queued',
          error: wasError ? row.error : null,
          queuedAt: row.queuedAt,
          finishedAt: wasError ? Date.now() : null,
          detail: null,
          restored: true,
        },
      ];
      // Keep the numeric suffix ahead of restored ids so new ids never collide.
      const suffix = Number(row.id.replace(/^op-/, ''));
      if (Number.isFinite(suffix) && suffix >= nextId) nextId = suffix + 1;
      restored += 1;
    }

    if (restored > 0) {
      // Re-queue in original order; failed rows stay failed until retried.
      for (const row of saved) {
        const op = this.ops.find((o) => o.id === row.id);
        if (op && op.status === 'queued' && !this.pending.includes(row.id)) this.pending.push(row.id);
      }
      this.emit();
      this.persist();
      void this.drain();
    }
    return restored;
  }

  /** Writes the not-yet-finished operations to IndexedDB. */
  private persist(): void {
    const rows = this.ops
      .filter((o) => o.status === 'queued' || o.status === 'running' || o.status === 'error')
      .map((o) => ({
        schema: FILE_OPS_SCHEMA,
        id: o.id,
        label: o.label,
        task: this.tasks.get(o.id)!,
        status: o.status as 'queued' | 'running' | 'error',
        error: o.error,
        queuedAt: o.queuedAt,
      }))
      // A task is mandatory; skip anything in an unexpected state.
      .filter((r) => Boolean(r.task));
    // Serialize writes so overlapping persists cannot interleave.
    this.persisting = this.persisting.then(() => writePersistedOperations(rows));
  }

  private update(id: string, patch: Partial<FileOperation>): void {
    this.ops = this.ops.map((o) => (o.id === id ? { ...o, ...patch } : o));
    this.emit();
  }

  private scheduleAutoClear(id: string): void {
    clearTimeout(this.timers.get(id));
    this.timers.set(
      id,
      setTimeout(() => {
        this.timers.delete(id);
        this.ops = this.ops.filter((o) => !(o.id === id && o.status === 'done'));
        this.emit();
      }, AUTO_CLEAR_SUCCESS_MS)
    );
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const listener of this.listeners) listener(snap);
  }
}

/** Shared queue used by the app. */
export const fileOperations = new FileOperationQueue();
