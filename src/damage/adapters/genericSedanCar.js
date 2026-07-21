// damage/adapters/genericSedanCar.js
// Model-specific adapter for generic_sedan_car.glb — the ONLY file that knows this asset's
// node names. It maps them to the semantic categories in damage/stiffnessMap.js. Swapping
// in a real hero vehicle means adding a sibling adapter, not touching the manifest.
//
// Name shapes this has to tolerate (measured in the edits.md model audit):
//   - kebab-case with an `-l` / `-r` side suffix          e.g. door-front-l
//   - a Sketchfab-appended `_<index>`                     e.g. door-front-l_16
//   - Blender `.001` duplicate suffixes instead of a side e.g. headlights-drl.001
// so every pattern is matched loosely against the node name rather than anchored to its end.
import { PartCategory } from '../stiffnessMap';

// First match wins, so order matters: the interior door panels and door glass must be
// classified before the broad /door/ rule, and `wheel-fender` before /fender/.
const PATTERNS = [
  [/wheel-fender/i, PartCategory.TRIM], // plastic arch liner, not a fender
  [/door-\w+-interior-panel/i, PartCategory.TRIM],
  // `windshield` must allow the Sketchfab `_<N>` suffix but still not swallow
  // `windshield-grill` or `Windshield Wiper - ...`, which are trim and fall through below.
  [/(window-glass|trim-glass|windshield(_\d+)?$|glass-rear)/i, PartCategory.GLASS],
  [/side-mirror-trim/i, PartCategory.TRIM],
  [/side-mirror/i, PartCategory.MIRROR],
  // Must precede /bumper/: `bumper-front-grill-frame` is grill trim, not the bumper itself.
  [/(grill|honeycomb|wiper)/i, PartCategory.TRIM],
  [/bumper/i, PartCategory.BUMPER],
  [/hood/i, PartCategory.HOOD],
  [/trunk/i, PartCategory.TRUNK],
  [/door-(front|rear)-[lr]/i, PartCategory.DOOR],
  [/fender-(front|rear)/i, PartCategory.FENDER],
  [/(headlight|taillight)/i, PartCategory.LIGHT],
  [/(unibody|frame-)/i, PartCategory.STRUCTURE],
];

/** Semantic category for a node name, or null if this node isn't a damageable body part. */
export function categoryForNode(nodeName) {
  if (!nodeName) return null;
  for (const [re, category] of PATTERNS) {
    if (re.test(nodeName)) return category;
  }
  return null;
}

// Parts this specific model can detach cleanly TODAY, per the audit's per-part verdict:
// closed solids with zero boundary and zero non-manifold edges, each already pivoted at its
// own centroid. Everything else is deliberately excluded:
//   - doors  → open shells (164-168 boundary edges) AND need their interior panel + window
//              glass detached as a group; those are separate nodes.
//   - fenders→ open shells (166 boundary edges), would show a bare rim.
//   - roof / quarter panels / rockers → do not exist as nodes at all; fused into
//     sedan-unibody and not separable without re-authoring the model in Blender.
// This list is a property of THIS asset, which is exactly why it lives in the adapter and
// not in the manifest.
const DETACH_CLEAN = [
  /bumper-front/i,
  /bumper-rear/i,
  /^hood/i,
  /^trunk/i,
  /side-mirror-[lr]/i,
];

// Sibling nodes whose names embed a detachable part's name but are separate trim pieces:
// `bumper-front-grill-frame` and `side-mirror-trim-l` would otherwise pass DETACH_CLEAN.
const NOT_A_PANEL = /(trim|grill|frame|honeycomb)/i;

/** Whether this model's node is one of the audit-confirmed clean detachers. */
export function isDetachClean(nodeName) {
  if (!nodeName || NOT_A_PANEL.test(nodeName)) return false;
  return DETACH_CLEAN.some((re) => re.test(nodeName));
}

export const adapterName = 'generic_sedan_car.glb';
