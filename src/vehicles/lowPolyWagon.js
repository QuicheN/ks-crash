// vehicles/lowPolyWagon.js
// Vehicle definition for low_poly_wagon.glb.
//
// This model is the opposite of the sedan: 25× lighter (4,426 tris) and far better suited to
// destruction, but it has NO semantic names — every node is `Object_N`, every material
// `Material.0NN` — and its meshes are MATERIAL GROUPS rather than parts (one mesh holds
// triangles 16m apart). So it uses the geometric strategies throughout, and must be chunked
// before anything can be detached. See the wagon audit in edits.md for the measurements.
import { PartCategory } from '../damage/stiffnessMap';
import { splitIntoChunks } from '../damage/meshChunking';
import { byRegions, isWheelLike } from './strategies/classifiers';
import { byGeometry } from './strategies/wheelLocators';

// Measured: bbox x[-1.83, 6.38] y[-1.19, 6.35] z[-15.76, 2.23] in model units, so the origin
// is 2.275 off the centreline, 1.19 above the wheels' bottom and offset along the length.
// Recentre onto the wheelbase midpoint (front axle z=-0.40, rear z=-12.55), then scale so the
// wheel radius lands on a realistic ~0.34m (2.58 units × 0.264).
const SCALE = 0.264;

export const lowPolyWagon = {
  id: 'low-poly-wagon',
  label: 'Low-Poly Wagon',
  url: '/models/vehicles/low_poly_wagon.glb',

  transform: { scale: SCALE, recenter: [-2.275, 1.19, 6.475] },

  chassis: {
    // ~4.75m long, ~1.74m wide body (mirrors excluded), ~1.99m tall. Kept simpler than the
    // visual geometry per CLAUDE.md, and lifted clear of the wheels.
    halfExtents: { x: 0.8, y: 0.5, z: 1.9 },
    colliderOffset: { x: 0, y: 0.75, z: 0 },
    density: 200.0,
  },

  wheels: {
    radius: 0.34,
    suspension: { restLength: 0.3, stiffness: 30.0, maxTravel: 0.15 },
    frictionSlip: 2.0,
    // Matched to where the wheel visuals actually land after scale/recenter (measured at
    // x ±0.77, z ±1.60), so the physics wheels sit inside the art rather than beside it.
    offsets: [
      { x: 0.77, y: 0.63, z: 1.6 },
      { x: -0.77, y: 0.63, z: 1.6 },
      { x: 0.77, y: 0.63, z: -1.6 },
      { x: -0.77, y: 0.63, z: -1.6 },
    ],
    locate: byGeometry(),
  },

  parts: {
    // 67 connected islands cluster into ~42 chunks; each wheel is 5 co-located islands from
    // 5 different material groups, which this merges back into one piece.
    segment: (root) => splitIntoChunks(root, { clusterFactor: 0.3 }),

    // No names to go on, so classify by where a chunk sits in normalised car space:
    // xn -1(right)..+1(left), yn 0(ground)..1(roof), zn -1(rear)..+1(front). First match wins.
    classify: byRegions([
      [(f) => f.round && f.yn < 0.45 && Math.abs(f.xn) > 0.3, PartCategory.WHEEL],
      [(f) => Math.abs(f.zn) > 0.82 && f.yn < 0.42, PartCategory.BUMPER],
      [(f) => Math.abs(f.zn) > 0.7 && f.yn >= 0.28 && f.yn < 0.62 && Math.abs(f.xn) > 0.35, PartCategory.LIGHT],
      [(f) => f.yn > 0.78, PartCategory.ROOF],
      [(f) => f.zn > 0.42 && f.yn >= 0.42 && f.yn <= 0.78, PartCategory.HOOD],
      [(f) => f.zn > 0.35 && Math.abs(f.xn) > 0.55, PartCategory.FENDER],
      [(f) => f.zn < -0.45 && Math.abs(f.xn) > 0.55, PartCategory.QUARTER_PANEL],
      [(f) => Math.abs(f.zn) <= 0.45 && Math.abs(f.xn) > 0.5 && f.yn > 0.35, PartCategory.DOOR],
      [(f) => f.yn < 0.3 && Math.abs(f.xn) > 0.5, PartCategory.ROCKER],
      [(f) => f.yn < 0.3 && Math.abs(f.xn) <= 0.5, PartCategory.STRUCTURE],
    ]),

    // Wheels must survive — they're load-bearing for the raycast controller. Everything else
    // on this model detaches cleanly: a chunk is a closed-ish low-poly island whose convex
    // hull is well defined, and faceted debris reads as intentional at this art style.
    detachable: (chunk, bounds) => !isWheelLike(chunk, bounds),
  },
};
