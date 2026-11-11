/**
 * Bootstrap cache for the library snapshot.
 *
 * A page refresh used to start from empty state and refetch five full-library
 * payloads before anything rendered — ~800 ms and ~11 MB on a 1,300-title library.
 * This persists the last successful snapshot in IndexedDB so the list paints from
 * disk immediately, then revalidates against the server.
 *
 * Design notes:
 *  - IndexedDB, not localStorage: snapshots exceed the ~5 MB localStorage quota
 *    once a library is large, and localStorage is synchronous (blocking paint).
 *  - Versioned by `CACHE_SCHEMA`. Bump it when a payload shape changes so stale
 *    entries are ignored rather than crashing a newer client.
 *  - Every failure path resolves to `null` and never throws: a cache miss must be
 *    indistinguishable from a cold start.
 */

const DB_NAME = 'kodivault-bootstrap';
const STORE = 'snapshots';
const DB_VERSION = 1;

/** Bump when the cached payload shape changes incompatibly. */
export const CACHE_SCHEMA = 3;

export interface BootstrapSnapshot {
  schema: number;
  savedAt: number;
  movies: unknown[];
  showTree: unknown[];
  sets: unknown[];
}

export interface BootstrapCache {
  read(): Promise<BootstrapSnapshot | null>;
  write(snapshot: Omit<BootstrapSnapshot, 'schema' | 'savedAt'>): Promise<void>;
  clear(): Promise<void>;
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

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const t = db.transaction(STORE, mode);
          const request = run(t.objectStore(STORE));
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve(null);
          t.oncomplete = () => db.close();
        } catch {
          resolve(null);
        }
      })
  );
}

export const bootstrapCache: BootstrapCache = {
  async read() {
    const raw = await tx<BootstrapSnapshot | undefined>('readonly', (s) => s.get('library'));
    if (!raw || raw.schema !== CACHE_SCHEMA) return null;
    if (!Array.isArray(raw.movies) || !Array.isArray(raw.showTree) || !Array.isArray(raw.sets)) return null;
    return raw;
  },

  async write(snapshot) {
    await tx('readwrite', (s) =>
      s.put({ ...snapshot, schema: CACHE_SCHEMA, savedAt: Date.now() }, 'library')
    );
  },

  async clear() {
    await tx('readwrite', (s) => s.delete('library'));
  },
};
