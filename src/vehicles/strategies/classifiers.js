// vehicles/strategies/classifiers.js
// Reusable ways to map a chunk to a semantic PartCategory. A vehicle definition picks one;
// adding a model normally means picking an existing strategy, not writing a new one.
//
// Two exist because the two models we have identify parts in fundamentally different ways:
// the sedan has meaningful node names, the wagon has none at all (every node is `Object_N`),
// so it must be classified purely by where a chunk sits on the car.
import { PartCategory } from '../../damage/stiffnessMap';

/**
 * Name-based classification. `rules` is an ordered [regex, category] list — first match wins,
 * so put the specific patterns first (`side-mirror-trim` before `side-mirror`).
 * Patterns are matched loosely so exporter suffixes (`_16`, `.001`) don't defeat them.
 */
export function byNamePatterns(rules) {
  return (chunk) => {
    const name = chunk.node?.name;
    if (!name) return null;
    for (const [re, category] of rules) if (re.test(name)) return category;
    return null;
  };
}

/**
 * Geometry-based classification for models with no usable names.
 *
 * Each chunk is described in NORMALISED car space before the rules run:
 *   xn  -1 (right) .. +1 (left), 0 = centreline
 *   yn   0 (ground) .. 1 (roofline)
 *   zn  -1 (rear)   .. +1 (front)
 *   size / radius   in metres
 *   round           true when the chunk's side profile is circular and narrow (a wheel)
 *
 * `rules` is an ordered [predicate, category] list; first match wins.
 */
export function byRegions(rules) {
  return (chunk, bounds) => {
    const f = describe(chunk, bounds);
    for (const [test, category] of rules) if (test(f)) return category;
    return PartCategory.TRIM;
  };
}

/** Normalised descriptor used by byRegions rules. */
function describe(chunk, bounds) {
  const { localPos: p, size } = chunk;
  const halfWidth = Math.max(1e-6, (bounds.max.x - bounds.min.x) / 2);
  const halfLength = Math.max(1e-6, (bounds.max.z - bounds.min.z) / 2);
  const height = Math.max(1e-6, bounds.max.y - bounds.min.y);
  const midZ = (bounds.max.z + bounds.min.z) / 2;
  return {
    xn: p.x / halfWidth,
    yn: (p.y - bounds.min.y) / height,
    zn: (p.z - midZ) / halfLength,
    size,
    radius: chunk.radius,
    // A wheel seen from the side is circular (height ≈ length) and thin across the car.
    round:
      Math.abs(size.y - size.z) < 0.25 * Math.max(size.y, size.z) &&
      size.y > 0.3 &&
      size.x < size.y * 0.9,
  };
}

/** Shared wheel test, exported so wheel locators and classifiers agree on what a wheel is. */
export function isWheelLike(chunk, bounds) {
  const f = describe(chunk, bounds);
  return f.round && f.yn < 0.45 && Math.abs(f.xn) > 0.3;
}
