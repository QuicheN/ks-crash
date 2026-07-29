// rendering/obstacles/index.js
// The obstacle catalogue. `OBSTACLE_COMPONENTS` is what turns a layout entry's `type` string
// into a component, so scene placement can live in data (obstacles/layout.js) rather than in
// JSX — the shape the scenario builder will need.
export { Wall } from './Wall';
export { Tree } from './Tree';
export { Ramp } from './Ramp';
export { BoostPad } from './BoostPad';

import { Wall } from './Wall';
import { Tree } from './Tree';
import { Ramp } from './Ramp';
import { BoostPad } from './BoostPad';

export const OBSTACLE_COMPONENTS = {
  wall: Wall,
  tree: Tree,
  ramp: Ramp,
  boostPad: BoostPad,
};
