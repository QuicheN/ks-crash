// persistence/layoutRepository.js
// The ONLY layout storage API the rest of the app is allowed to use.
//
// Everything above this line — components, thunks, the scene — talks in terms of layout
// documents and knows nothing about where they live. Everything below it is an adapter.
// Swapping localStorage for the future MongoDB-backed service is one line:
//
//     const adapter = mongoAdapter;   // instead of localStorageAdapter
//
// ...plus writing that adapter against the contract below. No component, slice or selector
// changes, because of four rules this module enforces:
//
//   1. Every method is async. A network round trip is then invisible to callers.
//   2. THE REPOSITORY assigns ids and timestamps, never the UI. Mongo will hand back `_id`;
//      its adapter maps that to `id` here so the domain shape stays identical across
//      backends. A UI that minted its own ids would break the day the server owns them.
//   3. Validation happens here, above the adapter, so no backend can be handed a malformed
//      document and the rules can't drift between storage media.
//   4. Errors are normalised to LayoutStorageError by the adapter, so callers never branch on
//      a storage-specific failure.
//
// ADAPTER CONTRACT (all async, all may throw LayoutStorageError):
//   readAll()        -> LayoutDoc[]
//   readOne(id)      -> LayoutDoc | null
//   writeOne(doc)    -> LayoutDoc   (insert or replace, keyed on doc.id)
//   removeOne(id)    -> boolean     (false if it wasn't there)
//
// A LayoutDoc is:
//   { schemaVersion, id, name, createdAt, updatedAt, obstacles: [...] }
import { validateLayout } from '../obstacles/schema';
import { LayoutStorageError } from './LayoutStorageError';
import { localStorageAdapter } from './localStorageAdapter';

/** THE SWAP POINT. Change this one binding to move the app to a different backend. */
const adapter = localStorageAdapter;

export const LAYOUT_SCHEMA_VERSION = 1;

function newLayoutId() {
  // Only used while ids are client-owned. A server-backed adapter returns its own id from
  // writeOne, and `create` below takes whatever comes back — so this quietly stops mattering.
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `layout-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Bring a stored document up to the current schema. Identity today — it exists so that when
 * v2 arrives there is already exactly one place that knows how to read a v1 record, rather
 * than version checks sprinkled through the editor.
 */
function migrate(doc) {
  if (!doc) return null;
  if (doc.schemaVersion === LAYOUT_SCHEMA_VERSION) return doc;
  return { ...doc, schemaVersion: LAYOUT_SCHEMA_VERSION };
}

function assertValid(layout) {
  const errors = validateLayout(layout);
  if (errors.length) {
    throw new LayoutStorageError(`Layout is not valid:\n- ${errors.join('\n- ')}`);
  }
}

/** What a list view needs — deliberately not the whole document, so a server can page it. */
export function toSummary(doc) {
  return {
    id: doc.id,
    name: doc.name,
    updatedAt: doc.updatedAt,
    obstacleCount: doc.obstacles?.length ?? 0,
  };
}

export async function listLayouts() {
  const docs = await adapter.readAll();
  return docs
    .map(migrate)
    .map(toSummary)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function getLayout(id) {
  return migrate(await adapter.readOne(id));
}

/** Stores a NEW layout. Any id on the input is ignored — see rule 2. */
export async function createLayout({ name, obstacles }) {
  const now = new Date().toISOString();
  const doc = {
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    id: newLayoutId(),
    name: String(name ?? '').trim(),
    createdAt: now,
    updatedAt: now,
    obstacles: obstacles ?? [],
  };
  assertValid(doc);
  return migrate(await adapter.writeOne(doc));
}

/** Patches an existing layout. `createdAt`/`id` are never taken from the caller. */
export async function updateLayout(id, patch) {
  const existing = await getLayout(id);
  if (!existing) throw new LayoutStorageError('That layout no longer exists.');
  const doc = {
    ...existing,
    ...patch,
    id: existing.id,
    createdAt: existing.createdAt,
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
  };
  if (typeof doc.name === 'string') doc.name = doc.name.trim();
  assertValid(doc);
  return migrate(await adapter.writeOne(doc));
}

export async function deleteLayout(id) {
  return adapter.removeOne(id);
}

/** Which backend is live. Shown in the editor so the storage swap is visible while testing. */
export const storageName = adapter.name;
