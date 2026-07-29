// obstacles/layout.js
// The BUILT-IN layout. Data, not JSX — `type` indexes OBSTACLE_COMPONENTS and everything else
// is passed straight through as props.
//
// This is no longer the only layout: since the scenario editor exists, layouts are documents
// the user creates and stores (state/layoutSlice.js -> persistence/). This one is the seed —
// the scene the app boots into and the starting point for "New layout". It lives in source
// and is never written to storage, which is why its id is namespaced `builtin:`.
//
// The car spawns at the origin facing +Z, so everything here is laid out ahead of it.
import { withDefaults } from './schema';

const SEED_OBSTACLES = [
  // Straight ahead of spawn: cross the pad and you arrive at the wall at 200mph, which
  // exercises the whole severity -> detachment -> crumple pipeline in a single run.
  { id: 'pad-0', type: 'boostPad', position: [0, 0, 25] },
  { id: 'tree-0', type: 'tree', position: [-9, 0, 30] },
  { id: 'tree-1', type: 'tree', position: [11, 0, 45], trunkRadius: 0.28, trunkHeight: 3.2 },
  { id: 'wall-0', type: 'wall', position: [0, 1.5, 60], halfExtents: [8, 1.5, 0.5] },
  // Off-axis, clear of the wall's +/-8m span, so it's reachable by steering around rather
  // than only after the wall is destroyed.
  { id: 'ramp-0', type: 'ramp', position: [-20, 0, 90] },
];

export const DEFAULT_LAYOUT_ID = 'builtin:default';

/** A complete layout document — same shape the repository stores, minus the timestamps. */
export const DEFAULT_LAYOUT = {
  schemaVersion: 1,
  id: DEFAULT_LAYOUT_ID,
  name: 'Default gauntlet',
  // Entries above are sparse (they relied on the components' default props); a document has
  // to carry every value the editor can show, so they're completed here.
  obstacles: SEED_OBSTACLES.map(withDefaults),
};
