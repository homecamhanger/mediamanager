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
 */

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
}

export interface FileOperationInput {
  label: string;
  /** Performs the write. Rejecting marks the operation failed. */
  run: () => Promise<string | void>;
}

type Listener = (ops: FileOperation[]) => void;

const AUTO_CLEAR_SUCCESS_MS = 6000;

let nextId = 1;

export class FileOperationQueue {
  private ops: FileOperation[] = [];
  private pending: Array<{ id: string; run: () => Promise<string | void> }> = [];
  private running = false;
  private listeners = new Set<Listener>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

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
    this.runners.set(id, input.run);
    this.pending.push({ id, run: input.run });
    this.emit();
    void this.drain();
    return id;
  }

  /** Re-run a failed operation. Its label and runner are retried as-is. */
  retry(id: string): void {
    const op = this.ops.find((o) => o.id === id);
    const run = this.runners.get(id);
    if (!op || op.status !== 'error' || !run) return;
    this.update(id, { status: 'queued', error: null, finishedAt: null });
    this.pending.push({ id, run });
    void this.drain();
  }

  dismiss(id: string): void {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    this.ops = this.ops.filter((o) => o.id !== id);
    this.emit();
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
    this.runners.clear();
    this.running = false;
    this.emit();
  }

  // Runners are kept so `retry` can re-invoke the original closure.
  private runners = new Map<string, () => Promise<string | void>>();

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.pending.length > 0) {
        const next = this.pending.shift()!;
        // A dismissed operation must not run.
        if (!this.ops.some((o) => o.id === next.id)) continue;
        this.update(next.id, { status: 'running' });
        try {
          const detail = await next.run();
          this.update(next.id, {
            status: 'done',
            finishedAt: Date.now(),
            detail: typeof detail === 'string' ? detail : null,
          });
          this.scheduleAutoClear(next.id);
        } catch (err) {
          this.update(next.id, {
            status: 'error',
            error: err instanceof Error ? err.message : String(err),
            finishedAt: Date.now(),
          });
        }
      }
    } finally {
      this.running = false;
    }
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
