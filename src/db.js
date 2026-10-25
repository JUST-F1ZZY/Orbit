// everything is stored locally in IndexedDB, nothing leaves the device

import { today } from './dates.js';

const DB_NAME = 'orbit';
const DB_VERSION = 2;
const ENTRIES = 'entries';
const SETTINGS = 'settings';

export const DEFAULT_SETTINGS = { cycleLength: 28, periodLength: 5, onboarded: false };

let dbPromise;
function open() {
  dbPromise ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // { date: '2026-10-24', flow, symptoms: { cramps: 2 }, mood, energy, note }
      if (!db.objectStoreNames.contains(ENTRIES)) db.createObjectStore(ENTRIES, { keyPath: 'date' });
      if (!db.objectStoreNames.contains(SETTINGS)) db.createObjectStore(SETTINGS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}

export const getAll = () => run(ENTRIES, 'readonly', (s) => s.getAll());
export const put = (entry) => run(ENTRIES, 'readwrite', (s) => s.put(entry));
export const remove = (date) => run(ENTRIES, 'readwrite', (s) => s.delete(date));

export async function getSettings() {
  const saved = await run(SETTINGS, 'readonly', (s) => s.get('main'));
  return { ...DEFAULT_SETTINGS, ...saved };
}
export const saveSettings = (settings) => run(SETTINGS, 'readwrite', (s) => s.put(settings, 'main'));

export async function deleteEverything() {
  await run(ENTRIES, 'readwrite', (s) => s.clear());
  await run(SETTINGS, 'readwrite', (s) => s.clear());
}

export async function requestPersistence() {
  if (navigator.storage?.persist) return navigator.storage.persist();
  return false;
}

// iOS can't download files from a home screen app, so phones use the share sheet
export async function exportData() {
  const data = {
    app: 'orbit',
    version: DB_VERSION,
    exportedAt: new Date().toISOString(),
    settings: { ...(await getSettings()), pin: undefined },
    entries: await getAll(),
  };
  const name = `orbit-backup-${data.exportedAt.slice(0, 10)}.json`;
  const file = new File([JSON.stringify(data, null, 2)], name, { type: 'application/json' });

  const touch = window.matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Orbit backup' });
    } catch (err) {
      if (err.name === 'AbortError') return false;
      throw err;
    }
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  await saveSettings({ ...(await getSettings()), lastBackup: today() });
  return true;
}

export async function importData(file) {
  const data = JSON.parse(await file.text());
  if (data.app !== 'orbit' || !Array.isArray(data.entries)) throw new Error('Not an Orbit backup file');
  for (const entry of data.entries) {
    if (typeof entry.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.date)) await put(entry);
  }
  if (data.settings) {
    const { pin, lastBackup, ...rest } = data.settings;
    await saveSettings({ ...(await getSettings()), ...rest, onboarded: true });
  }
  return data.entries.length;
}
