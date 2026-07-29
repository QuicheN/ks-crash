// obstacles/schema.js
// The DOMAIN description of an obstacle: what a layout entry may contain, what a user is
// allowed to edit, what is valid, and what shape it occupies on the ground.
//
// This is deliberately separate from both the renderer and storage:
//   - `rendering/obstacles/*` turns an entry into geometry and colliders.
//   - `persistence/*` writes entries somewhere.
//   - this file is the only place that knows what an entry MEANS.
// The editor form is generated from `fieldsFor()`, so adding a fifth obstacle type is an
// entry here plus a component in the catalogue — no UI edit.
//
// DUPLICATION, ON PURPOSE: the `default` values below mirror the default props on each
// obstacle component. edits.md records that obstacle dimensions living as component defaults
// is deliberate (they describe one prop, not the simulation), so the two must be kept in
// step by hand. They are checked against each other by eye only — if a component default
// changes, change it here too.
import { BOOST_PAD_SPEED } from '../utils/constants';

const DEG = 180 / Math.PI;

/** Every layout entry has these, whatever its type. */
const COMMON_FIELDS = [
  { key: 'position', index: 0, label: 'X', type: 'number', step: 0.5, unit: 'm' },
  { key: 'position', index: 2, label: 'Z', type: 'number', step: 0.5, unit: 'm' },
  // Stored in radians (that is what Rapier and three want); shown in degrees.
  { key: 'rotationY', label: 'Rotation', type: 'number', factor: DEG, step: 5, unit: '°' },
];

// `factor` means "display = stored × factor", which is how half-extents are presented as the
// full width/height/depth a person actually measures.
export const OBSTACLE_SCHEMA = {
  wall: {
    label: 'Wall',
    mapColor: '#8a4a3a',
    defaults: { halfExtents: [8, 1.5, 0.5], color: '#8a4a3a' },
    fields: [
      { key: 'halfExtents', index: 0, label: 'Width', type: 'number', factor: 2, min: 0.2, step: 0.5, unit: 'm' },
      { key: 'halfExtents', index: 1, label: 'Height', type: 'number', factor: 2, min: 0.2, step: 0.5, unit: 'm' },
      { key: 'halfExtents', index: 2, label: 'Thickness', type: 'number', factor: 2, min: 0.1, step: 0.1, unit: 'm' },
      { key: 'color', label: 'Colour', type: 'color' },
    ],
  },
  tree: {
    label: 'Tree',
    mapColor: '#3f6b3a',
    defaults: { trunkRadius: 0.22, trunkHeight: 2.6, canopyRadius: 1.7 },
    fields: [
      { key: 'trunkRadius', label: 'Trunk radius', type: 'number', min: 0.05, step: 0.02, unit: 'm' },
      { key: 'trunkHeight', label: 'Trunk height', type: 'number', min: 0.5, step: 0.2, unit: 'm' },
      { key: 'canopyRadius', label: 'Canopy radius', type: 'number', min: 0.2, step: 0.1, unit: 'm' },
    ],
  },
  ramp: {
    label: 'Ramp',
    mapColor: '#6d7480',
    defaults: { width: 8, length: 12, height: 2.4, color: '#6d7480' },
    fields: [
      { key: 'width', label: 'Width', type: 'number', min: 0.5, step: 0.5, unit: 'm' },
      { key: 'length', label: 'Length', type: 'number', min: 0.5, step: 0.5, unit: 'm' },
      { key: 'height', label: 'Height', type: 'number', min: 0.1, step: 0.2, unit: 'm' },
      { key: 'color', label: 'Colour', type: 'color' },
    ],
  },
  boostPad: {
    label: 'Acceleration pad',
    mapColor: '#1d6fd6',
    // `speed` was a global placeholder (BOOST_PAD_SPEED); the pad component always accepted a
    // per-instance override, so making it user-defined is a field here, not a physics change.
    defaults: { width: 6, length: 10, speed: BOOST_PAD_SPEED },
    fields: [
      { key: 'width', label: 'Width', type: 'number', min: 0.5, step: 0.5, unit: 'm' },
      // The pad is not swept by CCD (see edits.md): too short and a fast car steps over it in
      // one 60Hz frame. 10m is the measured-reliable length, hence the floor here.
      { key: 'length', label: 'Length', type: 'number', min: 2, step: 1, unit: 'm' },
      { key: 'speed', label: 'Boost speed', type: 'number', min: 0, step: 5, unit: 'm/s' },
    ],
  },
};

export const OBSTACLE_TYPES = Object.keys(OBSTACLE_SCHEMA);

export function fieldsFor(type) {
  const schema = OBSTACLE_SCHEMA[type];
  return schema ? [...COMMON_FIELDS, ...schema.fields] : COMMON_FIELDS;
}

/** Read a field's DISPLAY value out of an obstacle (degrees, full widths). */
export function readField(obstacle, field) {
  const raw = field.index === undefined ? obstacle[field.key] : obstacle[field.key]?.[field.index];
  if (field.type === 'color') return raw ?? '#888888';
  return (raw ?? 0) * (field.factor ?? 1);
}

/**
 * Write a field's display value back, returning a NEW obstacle (reducers here are Immer-free
 * helpers so they stay usable outside Redux). Arrays are copied, never mutated in place.
 */
export function writeField(obstacle, field, displayValue) {
  const stored =
    field.type === 'color' ? displayValue : Number(displayValue) / (field.factor ?? 1);
  if (field.index === undefined) return normalizeObstacle({ ...obstacle, [field.key]: stored });
  const arr = [...(obstacle[field.key] ?? [])];
  arr[field.index] = stored;
  return normalizeObstacle({ ...obstacle, [field.key]: arr });
}

/**
 * Enforce the y-coordinate contract, which differs by type and is not a user-facing choice:
 * a wall's `position` is its CENTRE (so it must sit half its height up), while tree, ramp and
 * pad take `position` at ground level. Exposing a raw Y field would just let users bury them.
 */
export function normalizeObstacle(obstacle) {
  const [x, , z] = obstacle.position ?? [0, 0, 0];
  const y = obstacle.type === 'wall' ? (obstacle.halfExtents?.[1] ?? 1.5) : 0;
  return { ...obstacle, position: [x, y, z] };
}

let idCounter = 0;
/** Obstacle ids are document-local; only LAYOUT ids come from the repository. */
function newObstacleId(type) {
  idCounter += 1;
  return `${type}-${Date.now().toString(36)}${idCounter.toString(36)}`;
}

export function makeObstacle(type, position = [0, 0, 0]) {
  const schema = OBSTACLE_SCHEMA[type];
  if (!schema) throw new Error(`Unknown obstacle type "${type}"`);
  return normalizeObstacle({
    id: newObstacleId(type),
    type,
    position: [position[0], 0, position[2]],
    rotationY: 0,
    ...structuredClone(schema.defaults),
  });
}

/**
 * Fill in whatever a sparse entry left out, from the type's defaults. Hand-written layouts
 * (obstacles/layout.js) lean on the components' default props, but a stored document has to
 * be complete — validation checks every field, and the editor needs something to show.
 */
export function withDefaults(entry) {
  const schema = OBSTACLE_SCHEMA[entry.type];
  if (!schema) return entry;
  return normalizeObstacle({
    rotationY: 0,
    position: [0, 0, 0],
    ...structuredClone(schema.defaults),
    ...entry,
  });
}

export function describeObstacle(obstacle) {
  const label = OBSTACLE_SCHEMA[obstacle.type]?.label ?? obstacle.type;
  const [x, , z] = obstacle.position ?? [0, 0, 0];
  return `${label} @ ${x.toFixed(1)}, ${z.toFixed(1)}`;
}

/**
 * The footprint an obstacle occupies on the ground, in world metres. The top-down map draws
 * from this and therefore never special-cases a type. A tree reports its CANOPY, which is the
 * visual extent (only its trunk is solid) — that is what you steer around by eye.
 */
export function obstacleFootprint(obstacle) {
  const [x, , z] = obstacle.position ?? [0, 0, 0];
  const base = { x, z, rotationY: obstacle.rotationY ?? 0, color: OBSTACLE_SCHEMA[obstacle.type]?.mapColor ?? '#888' };
  switch (obstacle.type) {
    case 'wall':
      return { ...base, shape: 'rect', width: (obstacle.halfExtents?.[0] ?? 0) * 2, depth: (obstacle.halfExtents?.[2] ?? 0) * 2 };
    case 'tree':
      return { ...base, shape: 'circle', radius: obstacle.canopyRadius ?? 1 };
    case 'ramp':
    case 'boostPad':
      return { ...base, shape: 'rect', width: obstacle.width ?? 1, depth: obstacle.length ?? 1 };
    default:
      return { ...base, shape: 'rect', width: 1, depth: 1 };
  }
}

// --- Validation ------------------------------------------------------------
// Domain rules, not storage rules — the repository calls these before any write so no adapter
// can ever persist a malformed document, and the editor can show the same messages.

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);

export function validateObstacle(obstacle, where = 'obstacle') {
  const errors = [];
  if (!obstacle || typeof obstacle !== 'object') return [`${where}: not an object`];
  if (typeof obstacle.id !== 'string' || !obstacle.id) errors.push(`${where}: missing id`);
  if (!OBSTACLE_SCHEMA[obstacle.type]) errors.push(`${where}: unknown type "${obstacle.type}"`);
  if (!Array.isArray(obstacle.position) || obstacle.position.length !== 3 || !obstacle.position.every(isFiniteNumber)) {
    errors.push(`${where}: position must be three finite numbers`);
  }
  if (!isFiniteNumber(obstacle.rotationY)) errors.push(`${where}: rotationY must be a number`);
  for (const field of OBSTACLE_SCHEMA[obstacle.type]?.fields ?? []) {
    const raw = field.index === undefined ? obstacle[field.key] : obstacle[field.key]?.[field.index];
    if (field.type === 'color') {
      if (typeof raw !== 'string') errors.push(`${where}: ${field.label} must be a colour string`);
    } else if (!isFiniteNumber(raw)) {
      errors.push(`${where}: ${field.label} must be a number`);
    } else if (field.min !== undefined && raw < field.min) {
      errors.push(`${where}: ${field.label} must be at least ${field.min}`);
    }
  }
  return errors;
}

export function validateLayout(layout) {
  const errors = [];
  if (!layout || typeof layout !== 'object') return ['layout: not an object'];
  if (typeof layout.name !== 'string' || !layout.name.trim()) errors.push('layout: name is required');
  if (!Array.isArray(layout.obstacles)) return [...errors, 'layout: obstacles must be an array'];
  const seen = new Set();
  layout.obstacles.forEach((obstacle, i) => {
    errors.push(...validateObstacle(obstacle, `obstacle ${i + 1}`));
    if (seen.has(obstacle?.id)) errors.push(`obstacle ${i + 1}: duplicate id "${obstacle.id}"`);
    seen.add(obstacle?.id);
  });
  return errors;
}
