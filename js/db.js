export const DB_NAME = 'ArdenverseDB';
export const DB_VERSION = 2;
export let db = null;

export function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = e => {
      const d = e.target.result;
      const stores = ['gallery', 'characters', 'planets', 'lore', 'loreCategories', 'tags', 'meta'];
      for (const name of stores) {
        if (!d.objectStoreNames.contains(name)) {
          d.createObjectStore(name, { keyPath: name === 'meta' ? 'key' : 'uuid' });
        }
      }
    };

    req.onsuccess = e => { db = e.target.result; resolve(db); };
    req.onerror = e => reject(e.target.error);
  });
}

export function dbGetAll(store) {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (err) {
      reject(err);
    }
  });
}

export function dbGet(store, key) {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (err) {
      reject(err);
    }
  });
}

export function dbPut(store, obj) {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).put(obj);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    } catch (err) {
      reject(err);
    }
  });
}

export function dbDelete(store, key) {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    } catch (err) {
      reject(err);
    }
  });
}

export function dbDeleteMany(store, keys) {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(store, 'readwrite');
      const os = tx.objectStore(store);
      if (keys.length === 0) { resolve(); return; }
      for (const key of keys) {
        const req = os.delete(key);
        req.onerror = () => reject(req.error);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    } catch (err) {
      reject(err);
    }
  });
}

export function newUuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
