// Small IndexedDB wrapper. Everything stays on this device.

const DB_NAME = 'ricfit';
const DB_VERSION = 1;
const STORES = ['kv', 'sessions', 'daily', 'photos'];

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('daily')) db.createObjectStore('daily', { keyPath: 'date' });
      if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        let result;
        Promise.resolve(fn(s)).then((r) => { result = r; });
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

const req2p = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const db = {
  get: (store, key) => tx(store, 'readonly', (s) => req2p(s.get(key))),
  put: (store, value, key) => tx(store, 'readwrite', (s) => req2p(key !== undefined ? s.put(value, key) : s.put(value))),
  del: (store, key) => tx(store, 'readwrite', (s) => req2p(s.delete(key))),
  all: (store) => tx(store, 'readonly', (s) => req2p(s.getAll())),
  clear: (store) => tx(store, 'readwrite', (s) => req2p(s.clear())),
  async clearAll() { for (const s of STORES) await this.clear(s); },
  stores: STORES,
};
