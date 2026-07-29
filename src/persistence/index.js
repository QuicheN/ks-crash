// persistence/index.js
// The public face of the data layer. Import from here, never from an adapter directly —
// `layoutRepository.js` chooses the backend, and going around it is what would make the
// future MongoDB swap a multi-file change.
export {
  listLayouts,
  getLayout,
  createLayout,
  updateLayout,
  deleteLayout,
  toSummary,
  storageName,
  LAYOUT_SCHEMA_VERSION,
} from './layoutRepository';
export { LayoutStorageError } from './LayoutStorageError';
