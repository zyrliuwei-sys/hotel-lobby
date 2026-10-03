/**
 * Tiny IndexedDB key-value store for unsent form drafts (e.g. photos picked
 * before a sign-in redirect). Values are structured-cloned, so Blobs/Files
 * are stored as-is — no base64 and no 5 MB localStorage ceiling.
 *
 * Every call is best-effort: private mode, blocked storage or a missing
 * IndexedDB resolve to `undefined` / no-op instead of throwing.
 */

const DB_NAME = 'drafts';
const STORE = 'kv';

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest | void
): Promise<T | undefined> {
  const db = await open();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => {
        db.close();
        resolve(req ? (req.result as T) : undefined);
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        resolve(undefined);
      };
    } catch {
      db.close();
      resolve(undefined);
    }
  });
}

export function draftGet<T>(key: string) {
  return run<T>('readonly', (s) => s.get(key));
}

export function draftSet(key: string, value: unknown) {
  return run<void>('readwrite', (s) => {
    s.put(value, key);
  });
}

export function draftDelete(key: string) {
  return run<void>('readwrite', (s) => {
    s.delete(key);
  });
}
