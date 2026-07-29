// obstacles/layout.js
// Where the obstacles stand. Data, not JSX — this is the seed of the scenario builder in
// CLAUDE.md's build order, and it means adding or moving an obstacle never touches a
// component. Each entry is { id, type, ...props }, where `type` indexes OBSTACLE_COMPONENTS
// and everything else is passed straight through as props.
//
// The car spawns at the origin facing +Z, so everything here is laid out ahead of it.

export const SCENE_OBSTACLES = [
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
