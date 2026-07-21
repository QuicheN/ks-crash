// vehicles/genericSedan.js
// Vehicle definition for generic_sedan_car.glb — pure data plus strategy references.
//
// This model has excellent semantic node names and its nodes ARE its parts, so it uses the
// name-based strategies throughout. Everything here was previously hardcoded in
// utils/constants.js and damage/adapters/genericSedanCar.js; behaviour is unchanged.
import { PartCategory } from '../damage/stiffnessMap';
import { partsFromNodes } from '../damage/meshChunking';
import { byNamePatterns as classifyByName } from './strategies/classifiers';
import { byNamePatterns as wheelsByName } from './strategies/wheelLocators';

// First match wins. Order matters: `bumper-front-grill-frame` is grill trim, not a bumper,
// and `side-mirror-trim-l` is trim, not a mirror.
const NAME_RULES = [
  [/wheel-fender/i, PartCategory.TRIM], // plastic arch liner, not a fender
  [/door-\w+-interior-panel/i, PartCategory.TRIM],
  // `windshield` must allow the exporter's `_<N>` suffix without swallowing
  // `windshield-grill` or `Windshield Wiper - ...`, which fall through to trim below.
  [/(window-glass|trim-glass|windshield(_\d+)?$|glass-rear)/i, PartCategory.GLASS],
  [/side-mirror-trim/i, PartCategory.TRIM],
  [/side-mirror/i, PartCategory.MIRROR],
  [/(grill|honeycomb|wiper)/i, PartCategory.TRIM],
  [/bumper/i, PartCategory.BUMPER],
  [/hood/i, PartCategory.HOOD],
  [/trunk/i, PartCategory.TRUNK],
  [/door-(front|rear)-[lr]/i, PartCategory.DOOR],
  [/fender-(front|rear)/i, PartCategory.FENDER],
  [/(headlight|taillight)/i, PartCategory.LIGHT],
  [/(unibody|frame-)/i, PartCategory.STRUCTURE],
];

// Parts the audit confirmed detach cleanly on THIS asset: closed solids, zero boundary and
// zero non-manifold edges, each already pivoted at its own centroid. Deliberately excluded:
//   doors   - open shells (164-168 boundary edges) that also need their interior panel and
//             window glass detached as a group; those are separate nodes.
//   fenders - open shells (166 boundary edges), would show a bare rim.
//   roof / quarter panels / rockers - not nodes at all; fused into sedan-unibody and not
//             separable without re-authoring the model.
const DETACH_CLEAN = [/bumper-front/i, /bumper-rear/i, /^hood/i, /^trunk/i, /side-mirror-[lr]/i];
// Sibling nodes that embed a detachable part's name but are separate trim pieces.
const NOT_A_PANEL = /(trim|grill|frame|honeycomb)/i;

const isDetachableName = (name) =>
  !!name && !NOT_A_PANEL.test(name) && DETACH_CLEAN.some((re) => re.test(name));

export const genericSedan = {
  id: 'generic-sedan',
  label: 'Generic Sedan',
  url: '/models/vehicles/generic_sedan_car.glb',

  // The GLB's origin already sits at ground level under the car's centre.
  transform: { scale: 1, recenter: [0, 0, 0] },

  chassis: {
    halfExtents: { x: 0.85, y: 0.45, z: 2.0 },
    // Lifted so the box wraps the bodywork and never fights the wheels for ground contact.
    colliderOffset: { x: 0, y: 0.6, z: 0 },
    density: 200.0, // ~6m³ box -> ~1200kg
  },

  wheels: {
    radius: 0.34,
    suspension: { restLength: 0.3, stiffness: 30.0, maxTravel: 0.15 },
    frictionSlip: 2.0,
    // Measured from the GLB, in the fixed [FL, FR, RL, RR] order. +x is LEFT, +z is FORWARD.
    offsets: [
      { x: 0.815, y: 0.63, z: 1.575 },
      { x: -0.815, y: 0.63, z: 1.575 },
      { x: 0.815, y: 0.63, z: -1.341 },
      { x: -0.815, y: 0.63, z: -1.341 },
    ],
    // Separator-tolerant: GLTF name sanitising may leave "Wheel.Ft.L" / "Wheel_Ft_L".
    locate: wheelsByName([/wheel\W*ft\W*l/i, /wheel\W*ft\W*r/i, /wheel\W*bk\W*l/i, /wheel\W*bk\W*r/i]),
  },

  parts: {
    segment: (root) => partsFromNodes(root, isDetachableName),
    classify: classifyByName(NAME_RULES),
    // Segmentation already restricted this model to its detach-clean nodes.
    detachable: () => true,
  },
};
