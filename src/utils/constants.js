// utils/constants.js
// Tuning constants only — no logic. Consumed by vehicleController.js and VehicleMesh.
// Values are sized to generic_sedan_car.glb: a realistically-scaled, Z-forward sedan
// centered on the origin, ground at y≈0, ~2.92m wheelbase, ~1.63m track, wheels of
// radius ≈0.34m resting with their centers at y≈0.33. Everything here is a starting
// point meant to be tuned during the run/verify step.

// --- Model placement -----------------------------------------------------
export const MODEL_URL = '/models/vehicles/generic_sedan_car.glb';
// The model's own origin already sits at ground level under the car's center, so the
// physics body origin maps straight onto it with no visual recenter needed.
export const MODEL_RECENTER = [0, 0, 0];

// --- Chassis -------------------------------------------------------------
// Collision box half-extents (meters) — deliberately simpler than the visual body.
export const CHASSIS_HALF_EXTENTS = { x: 0.85, y: 0.45, z: 2.0 };
// The body sits ABOVE the origin (y 0→1.49), so lift the collider off the ground so it
// wraps the bodywork and never fights the wheels for ground contact.
export const CHASSIS_COLLIDER_OFFSET = { x: 0, y: 0.6, z: 0 };
// Density chosen so the ~6m³ box lands near a realistic ~1200kg car mass.
export const CHASSIS_MASS_DENSITY = 200.0;

// --- Wheel + suspension --------------------------------------------------
export const WHEEL_RADIUS = 0.34;
export const SUSPENSION_REST_LENGTH = 0.3; // natural spring extension
export const SUSPENSION_STIFFNESS = 30.0; // higher = holds the car up more firmly
export const MAX_SUSPENSION_TRAVEL = 0.15; // how far a wheel may move from rest

// --- Drivetrain / handling ----------------------------------------------
export const MAX_ENGINE_FORCE = 3000.0; // forward/back push applied at the rear wheels
export const MAX_BRAKE_FORCE = 300.0; // braking impulse per wheel (Space)
export const MAX_STEER_ANGLE = 0.5; // radians (~28.6°) at full lock
export const STEER_LERP_SPEED = 5.0; // how fast steering eases toward its target
export const WHEEL_FRICTION_SLIP = 2.0; // tire grip; higher = more traction

// Wheel suspension connection points relative to the chassis CENTER (= body origin),
// in the FIXED order [FL, FR, RL, RR]. These are the wheel X/Z positions read from the
// GLB; the y is lifted to SUSPENSION_REST_LENGTH above the wheel center so the wheel
// hangs down to its authored resting height (~0.33). This order IS the contract: wheel
// indices 0-3 map to these entries, and to the visual wheel refs in the same order.
export const WHEEL_OFFSETS = [
  { x: 0.815, y: 0.63, z: 1.575 }, // 0: FL (front-left,  +x, front +z)
  { x: -0.815, y: 0.63, z: 1.575 }, // 1: FR (front-right, -x, front +z)
  { x: 0.815, y: 0.63, z: -1.341 }, // 2: RL (rear-left,   +x, rear  -z)
  { x: -0.815, y: 0.63, z: -1.341 }, // 3: RR (rear-right,  -x, rear  -z)
];

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

// Regexes that match each wheel's node name in [FL, FR, RL, RR] order, tolerant of the
// separators GLTF name-sanitizing may leave ("Wheel.Ft.L" / "Wheel_Ft_L" / "WheelFtL").
// Used by VehicleMesh to locate the 4 spinnable wheel groups in the cloned scene.
export const WHEEL_NODE_PATTERNS = [
  /wheel\W*ft\W*l/i, // FL
  /wheel\W*ft\W*r/i, // FR
  /wheel\W*bk\W*l/i, // RL
  /wheel\W*bk\W*r/i, // RR
];
