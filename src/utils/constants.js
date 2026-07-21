// utils/constants.js
// GLOBAL simulation tuning only — no logic, and nothing model-specific.
//
// Per-vehicle physical values (model URL, scale/recenter, chassis box, wheel radius and
// offsets, suspension) live in src/vehicles/<model>.js so a new model is a data file rather
// than edits scattered through the codebase. Anything here applies to every vehicle.

// --- Drivetrain / handling ----------------------------------------------
export const MAX_ENGINE_FORCE = 3000.0; // forward/back push applied at the rear wheels
export const MAX_BRAKE_FORCE = 300.0; // braking impulse per wheel (Space)
export const MAX_STEER_ANGLE = 0.5; // radians (~28.6°) at full lock
export const STEER_LERP_SPEED = 5.0; // how fast steering eases toward its target

// --- Chase camera --------------------------------------------------------
// Offset from the car, expressed in the car's YAW-ONLY frame (no pitch/roll, so the
// horizon stays level through suspension squat/dive and body lean). z is NEGATIVE
// because the model's forward is local +Z, so -z sits behind the car. If the forward
// direction is ever flipped (see the engine-force follow-up), flip this sign with it.
export const CAMERA_FOLLOW_OFFSET = { x: 0, y: 2.6, z: -7.5 };
// The camera aims at a point this far above the car's origin. Because the aim point sits
// below the camera's own height, the car renders slightly BELOW screen center — this is
// the primary knob for vertical framing (raise it to push the car further down).
export const CAMERA_LOOK_HEIGHT = 1.6;
// Exponential-damping rates (1/seconds). Higher = tighter/snappier, lower = more lag.
// The aim is deliberately snappier than the position so the car stays framed while the
// camera body swings wide through a turn.
export const CAMERA_POSITION_LAMBDA = 5.0;
export const CAMERA_LOOK_LAMBDA = 9.0;
// Hard limits on how far the camera may sit from the car, measured HORIZONTALLY (XZ) —
// height is left to the damping. The spring above lags by roughly speed/lambda, so at top
// speed it would otherwise trail arbitrarily far back, and in fast reverse the car would
// close that gap, overtake the camera and leave the frame entirely. These bound the
// spring's travel without removing it: between the limits the chase still breathes.
// Nominal resting distance is |CAMERA_FOLLOW_OFFSET.z| = 7.5.
export const CAMERA_MIN_DISTANCE = 5.5;
export const CAMERA_MAX_DISTANCE = 9.5;
// Cap on how far the AIM point may trail the car. The look damping lags by ~speed/lambda,
// which is unbounded, and the lag runs backwards along the travel axis — straight at the
// camera. As it grows, the aim vector's horizontal component shrinks while its 1m vertical
// drop does not, so the camera pitches down ever harder and lifts the car out of frame;
// once the lag exceeds the follow distance the aim point is BEHIND the camera and the view
// swings away entirely (measured: car gone by ~320mph). Small enough that framing at speed
// matches framing at rest, large enough to keep some "looking where you came from" in
// turns. Stays well clear of CAMERA_MIN_DISTANCE, so the aim can never reach the camera.
export const CAMERA_MAX_LOOK_LAG = 2.0;

// --- Mouse look ----------------------------------------------------------
// Click the canvas to capture the pointer; mouse movement then orbits the camera around the
// car. Radians per pixel of mouse movement.
export const CAMERA_MOUSE_SENSITIVITY = 0.0025;
// Elevation limits (radians above the car). The base chase pose sits at
// atan2(2.6, 7.5) ≈ 0.33 rad, so the range below allows a low dramatic angle up to nearly
// overhead. The minimum stays above 0 so the camera can never drop through the ground.
export const CAMERA_PITCH_MIN = 0.05;
export const CAMERA_PITCH_MAX = 1.25;
// After the mouse has been still this long, the view eases back behind the car.
export const CAMERA_RECENTER_DELAY = 0.6; // seconds
export const CAMERA_RECENTER_LAMBDA = 2.5; // how fast it swings back

// --- Collision filtering --------------------------------------------------
// Rapier interaction groups: (membership << 16) | filter. Two colliders interact only if
// each one's membership bit is present in the other's filter. Debris is separated from the
// vehicle so a part that detaches from *inside* the chassis cuboid (the hood sits within
// it) doesn't explode outward on its first step.
export const GROUP_VEHICLE = 0x0001;
export const GROUP_DEBRIS = 0x0002;
export const GROUP_WORLD = 0x0004;
const NOT_DEBRIS = 0xffff & ~GROUP_DEBRIS;
export const CHASSIS_GROUPS = (GROUP_VEHICLE << 16) | NOT_DEBRIS;
export const DEBRIS_GROUPS = (GROUP_DEBRIS << 16) | NOT_DEBRIS; // also ignores other debris
export const OBSTACLE_GROUPS = (GROUP_WORLD << 16) | 0xffff;
// Suspension raycasts only see world geometry — otherwise a bumper lying on the road would
// lift the wheel that rolls over it.
export const WHEEL_RAY_GROUPS = (GROUP_VEHICLE << 16) | GROUP_WORLD;

// --- Collision severity / damage -----------------------------------------
// Severity is the NORMAL component of the chassis velocity at the moment of impact (m/s),
// not raw speed: a 300mph graze along a wall is barely an impact, a 20mph head-on is.
// Below this, an impact is treated as a scrape and ignored entirely.
export const IMPACT_MIN_SEVERITY = 2.0; // m/s
// A part detaches when an impact lands within (its bounding radius + this) of the contact
// point. Keeps a rear-end hit from popping the front bumper off.
export const IMPACT_PART_RADIUS_MARGIN = 0.35; // meters
// Density for detached debris. Applied to the convex hull volume, so a ~0.1m³ bumper hull
// lands near 12kg.
export const DETACHED_PART_DENSITY = 120.0;
// A detached part inherits the chassis velocity plus this much kick along the contact
// normal, so it visibly separates instead of riding along with the car.
export const DETACH_SEPARATION_SPEED = 2.5; // m/s

// --- Crumple (whole-chunk deformation) -----------------------------------
// Chunks within this distance of the contact point (plus their own radius) get crushed.
export const CRUMPLE_RADIUS = 1.1; // meters
// Cap on accumulated crush, 0..1. Below 1 so a panel never collapses to zero volume.
export const CRUMPLE_MAX = 0.55;
// Converts impact severity (m/s of normal velocity) into crush. At 0.02, a 25 m/s hit
// fully crushes the softest panel right at the contact point.
export const CRUMPLE_SEVERITY_SCALE = 0.02;
// How far a fully-crushed chunk is dragged toward the impact, as a fraction of its radius.
export const CRUMPLE_PULL = 0.5;
// Max random bend of a fully-crushed chunk (radians) — keeps damage from looking uniform.
export const CRUMPLE_ROTATION = 0.35;
