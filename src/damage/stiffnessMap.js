// damage/stiffnessMap.js
// Per-category structural manifest. This file is deliberately MODEL-AGNOSTIC: it knows
// about semantic car parts, never about any particular GLB's node names. Swapping in a
// different vehicle means writing a new adapter (see damage/adapters/), not editing this.
//
// Categories cover parts this project intends to support, including ones the current
// stand-in model cannot supply (roof, quarter panel, rocker are fused into its unibody —
// see the model audit in edits.md). They are listed here on purpose so the manifest is
// complete against the target, and a future model gets them for free.

export const PartCategory = {
  HOOD: 'hood',
  TRUNK: 'trunk',
  DOOR: 'door',
  BUMPER: 'bumper',
  FENDER: 'fender',
  MIRROR: 'mirror',
  ROOF: 'roof',
  QUARTER_PANEL: 'quarter-panel',
  ROCKER: 'rocker',
  GLASS: 'glass',
  LIGHT: 'light',
  TRIM: 'trim',
  STRUCTURE: 'structure', // unibody / frame — the load-bearing core
  WHEEL: 'wheel', // load-bearing for the raycast controller; never destructible
};

// stiffness      - relative resistance to deformation, 0..1. Higher = holds its shape.
//                  Consumed by the (not-yet-built) deformation stage; recorded now so the
//                  manifest is the single place these numbers live.
// detachSeverity - normal-velocity impact, in m/s, at which the part tears off its
//                  mountings. null = never detaches (structural).
//
// Ordering rationale: trim and mirrors are held on by clips and go first; bumpers are
// designed as sacrificial crush structures; hood and trunk are latched and need a real hit;
// rockers and the unibody are the structure itself and never detach.
const MANIFEST = {
  [PartCategory.MIRROR]: { stiffness: 0.15, detachSeverity: 4 },
  [PartCategory.TRIM]: { stiffness: 0.15, detachSeverity: 5 },
  [PartCategory.LIGHT]: { stiffness: 0.2, detachSeverity: 6 },
  [PartCategory.BUMPER]: { stiffness: 0.3, detachSeverity: 8 },
  [PartCategory.FENDER]: { stiffness: 0.45, detachSeverity: 12 },
  [PartCategory.HOOD]: { stiffness: 0.5, detachSeverity: 14 },
  [PartCategory.TRUNK]: { stiffness: 0.5, detachSeverity: 14 },
  [PartCategory.DOOR]: { stiffness: 0.6, detachSeverity: 18 },
  [PartCategory.GLASS]: { stiffness: 0.9, detachSeverity: 10 }, // rigid, then shatters
  [PartCategory.QUARTER_PANEL]: { stiffness: 0.7, detachSeverity: 25 },
  [PartCategory.ROOF]: { stiffness: 0.75, detachSeverity: 30 },
  [PartCategory.ROCKER]: { stiffness: 0.9, detachSeverity: null },
  [PartCategory.STRUCTURE]: { stiffness: 1.0, detachSeverity: null },
  // Wheels never detach and never crumple — the raycast vehicle controller drives from them,
  // so deforming or removing one would break the car's ability to move at all.
  [PartCategory.WHEEL]: { stiffness: 1.0, detachSeverity: null },
};

const FALLBACK = { stiffness: 0.5, detachSeverity: null };

/** Full entry for a category, or a safe non-detaching default for anything unmapped. */
export function getPartProfile(category) {
  return MANIFEST[category] ?? FALLBACK;
}

export function getStiffness(category) {
  return getPartProfile(category).stiffness;
}

/**
 * Impact severity (m/s of normal velocity) at which this category detaches.
 * Returns null for categories that are structural and must never come off.
 */
export function getDetachSeverity(category) {
  return getPartProfile(category).detachSeverity;
}

export function canDetach(category) {
  return getDetachSeverity(category) !== null;
}
