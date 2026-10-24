// All of Orbit's data lives here, in IndexedDB on the user's device.
// Nothing in this file (or anywhere else) sends it over the network.

const DB_NAME = 'orbit';
const DB_VERSION = 1;
const STORE = 'entries';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      // One entry per day, keyed by ISO date: { date: '2026-10-24', flow, symptoms, mood, note }
      req.result.createObjectStore(STORE, { keyPath: 'date' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const result = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(result.result ?? result);
    tx.onerror = () => reject(tx.error);
  });
}

export const getAll = () => run('readonly', (s) => s.getAll());
export const put = (entry) => run('readwrite', (s) => s.put(entry));
export const remove = (date) => run('readwrite', (s) => s.delete(date));
export const clearAll = () => run('readwrite', (s) => s.clear());

// Ask the browser not to auto-delete our data when the phone is low on space.
export async function requestPersistence() {
  if (navigator.storage?.persist) return navigator.storage.persist();
  return false;
}

// Export is the only backup, since there's no server. Downloads a JSON file.
export async function exportData() {
  const data = { app: 'orbit', version: DB_VERSION, exportedAt: new Date().toISOString(), entries: await getAll() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `orbit-backup-${data.exportedAt.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Merges a backup file into the current data. Same-day entries are overwritten.
export async function importData(file) {
  const data = JSON.parse(await file.text());
  if (data.app !== 'orbit' || !Array.isArray(data.entries)) throw new Error('Not an Orbit backup file');
  for (const entry of data.entries) {
    if (typeof entry.date === 'string') await put(entry);
  }
  return data.entries.length;
}
