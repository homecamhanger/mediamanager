/**
 * IndexedDB persistence for the background file-operation queue.
 *
 * The queue itself is in-memory, so a page refresh used to strand any work it
 * held: operations still waiting behind a slow write simply vanished. This keeps
 * the unserializable part out of the queue and stores only what can be rebuilt —
 * see `FileOperationTask` in `fileOperationTasks.ts`.
 *
 * Same rules as `bootstrapCache`: IndexedDB (not localStorage), every failure
 * path resolves rather than throwing, and a storage problem must never break the
 * in-memory queue.
 */

const DB_NAME = 'kodivault-file-ops';
const STORE = 'queue';
const DB_VERSION = 1;
const KEY = 'pending';

/** Bump when the persisted shape changes incompatibly. */
export const FILE_OPS_SCHEMA = 1;

export interface PersistedOperation {
  schema: number;
  id: string;
  label: string;
  task: unknown;
  status: 'queued' | 'running' | 'error';
  error: string | null;
  queuedAt: number;
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (!hasIndexedDb()) return resolve(null);
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      return resolve(null);
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

export async function readPersistedOperations(): Promise<PersistedOperation[]> {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const t = db.transaction(STORE, 'readonly');
      const req = t.objectStore(STORE).get(KEY);
      req.onsuccess = () => {
        const raw = req.result as PersistedOperation[] | undefined;
        if (!Array.isArray(raw)) return resolve([]);
        resolve(raw.filter((o) => o && o.schema === FILE_OPS_SCHEMA && o.task));
      };
      req.onerror = () => resolve([]);
      t.oncomplete = () => db.close();
    } catch {
      db.close();
      resolve([]);
    }
  });
}

export async function writePersistedOperations(ops: PersistedOperation[]): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const t = db.transaction(STORE, 'readwrite');
      if (ops.length === 0) t.objectStore(STORE).delete(KEY);
      else t.objectStore(STORE).put(ops, KEY);
      t.oncomplete = () => {
        db.close();
        resolve();
      };
      t.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}
