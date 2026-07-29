// persistence/localStorageAdapter.js
// THE ONLY FILE IN THE APP THAT MAY MENTION `localStorage`.
//
// It implements the storage-adapter contract described in layoutRepository.js: five async
// per-record operations. Per-record rather than "load/save the whole collection" precisely
// because that is what a REST/Mongo backend can implement one-to-one — `writeOne` becomes
// PUT /api/layouts/:id, `readAll` becomes GET /api/layouts. Reading the whole collection to
// write one record is a localStorage implementation detail and stays behind this boundary.
//
// The methods are async even though localStorage is synchronous. That is the entire point:
// callers already await, so nothing above changes when the awaited thing becomes a network
// round trip.
import { LayoutStorageError } from './LayoutStorageError';

const STORAGE_KEY = 'kscrash.layouts.v1';

function readCollection() {
  let raw;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch (cause) {
    // Safari private mode and blocked third-party storage both throw on ACCESS, not just write.
    throw new LayoutStorageError('Browser storage is unavailable.', { cause });
  }
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    // Anything can end up under a localStorage key — another tab, an older build, a user
    // poking at devtools. Treat a non-object as an empty collection rather than crashing the
    // editor; a corrupt value would otherwise make the tab permanently unusable.
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    console.warn(`localStorageAdapter: ignoring unreadable "${STORAGE_KEY}"`);
    return {};
  }
}

function writeCollection(collection) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(collection));
  } catch (cause) {
    const quota = cause?.name === 'QuotaExceededError';
    throw new LayoutStorageError(
      quota ? 'Out of browser storage — delete a layout and try again.' : 'Could not save to browser storage.',
      { cause },
    );
  }
}

export const localStorageAdapter = {
  name: 'localStorage',

  async readAll() {
    return Object.values(readCollection());
  },

  async readOne(id) {
    return readCollection()[id] ?? null;
  },

  async writeOne(doc) {
    const collection = readCollection();
    collection[doc.id] = doc;
    writeCollection(collection);
    return doc;
  },

  async removeOne(id) {
    const collection = readCollection();
    if (!(id in collection)) return false;
    delete collection[id];
    writeCollection(collection);
    return true;
  },
};
