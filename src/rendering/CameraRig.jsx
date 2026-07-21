// rendering/CameraRig.jsx
// Third-person chase camera. Drives the Canvas's existing default camera (so it renders
// nothing itself) from the car's <group> transform, which useVehicleSync has already
// written this frame — the camera stays a pure rendering concern and never touches Rapier.
//
//   - Smoothed spring chase: the camera eases toward the ideal spot behind the car with
//     frame-rate-independent damping, so it swings wide in turns and settles on straights.
//   - Yaw only: only the car's heading is used to place the camera. Suspension squat/dive
//     and body lean never pitch or roll the view, so the horizon stays flat.
//   - Mouse look: click the canvas to capture the pointer, then mouse movement orbits the
//     camera around the car. The view eases back behind the car once the mouse is still.
//
// Framing: CAMERA_FOLLOW_OFFSET.x = 0 centers the car horizontally, and the aim point
// (CAMERA_LOOK_HEIGHT above the car) sits below the camera's own height, which pushes the
// car slightly below screen center and puts the road ahead in view.
import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useMouseLook } from '../input/useMouseLook';
import {
  CAMERA_FOLLOW_OFFSET,
  CAMERA_LOOK_HEIGHT,
  CAMERA_POSITION_LAMBDA,
  CAMERA_LOOK_LAMBDA,
  CAMERA_MIN_DISTANCE,
  CAMERA_MAX_DISTANCE,
  CAMERA_MAX_LOOK_LAG,
  CAMERA_PITCH_MIN,
  CAMERA_PITCH_MAX,
} from '../utils/constants';

// Scratch objects reused every frame to avoid per-frame allocation.
const FORWARD = new THREE.Vector3(0, 0, 1); // car-local forward
const fwd = new THREE.Vector3();
const desiredPos = new THREE.Vector3();
const desiredLook = new THREE.Vector3();
const flatOffset = new THREE.Vector3();
const lookLag = new THREE.Vector3();

// CAMERA_FOLLOW_OFFSET re-expressed in spherical terms, so mouse look can orbit it without
// changing the resting pose. With zero mouse input these reproduce the offset exactly.
const FOLLOW_RADIUS = Math.hypot(CAMERA_FOLLOW_OFFSET.z, CAMERA_FOLLOW_OFFSET.y);
const FOLLOW_ELEVATION = Math.atan2(CAMERA_FOLLOW_OFFSET.y, Math.abs(CAMERA_FOLLOW_OFFSET.z));

export function CameraRig({ targetRef }) {
  const camera = useThree((s) => s.camera);
  const domElement = useThree((s) => s.gl.domElement);
  const look = useMouseLook(domElement);
  const smoothedLook = useRef(new THREE.Vector3());
  const initialized = useRef(false);

  useFrame((_, delta) => {
    const target = targetRef.current;
    if (!target) return; // the car hasn't mounted yet

    // Heading only: project the car's forward onto the ground plane. If the car is ever
    // pointed straight up/down that projection collapses, so fall back to world forward.
    fwd.copy(FORWARD).applyQuaternion(target.quaternion);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.copy(FORWARD);
    else fwd.normalize();
    // Rotating (0,0,1) about Y by this yaw reproduces fwd exactly, so the offset below
    // lands behind the car for any heading.
    const yaw = Math.atan2(fwd.x, fwd.z);

    // Ease the view back behind the car once the mouse has been still (the hook owns the
    // state and the easing; the rig only supplies the frame delta).
    const mouse = look.current;
    mouse.recenter(delta);

    // Orbit the follow offset in spherical terms: the car's heading and the user's yaw add
    // together, and the user's pitch shifts elevation. At zero mouse input this is exactly
    // CAMERA_FOLLOW_OFFSET rotated by the heading, so the resting shot is unchanged.
    const orbit = yaw + mouse.yaw;
    const elevation = THREE.MathUtils.clamp(
      FOLLOW_ELEVATION + mouse.pitch,
      CAMERA_PITCH_MIN,
      CAMERA_PITCH_MAX,
    );
    const ground = FOLLOW_RADIUS * Math.cos(elevation); // horizontal distance from the car
    desiredPos.set(
      target.position.x - Math.sin(orbit) * ground,
      target.position.y + FOLLOW_RADIUS * Math.sin(elevation),
      target.position.z - Math.cos(orbit) * ground,
    );
    desiredLook.copy(target.position);
    desiredLook.y += CAMERA_LOOK_HEIGHT;

    if (!initialized.current) {
      // Snap on the first frame instead of easing in from the Canvas's initial camera.
      camera.position.copy(desiredPos);
      smoothedLook.current.copy(desiredLook);
      initialized.current = true;
    } else {
      // 1 - e^(-lambda*dt) is the frame-rate-independent form of a lerp factor: the same
      // amount of catch-up happens per second regardless of framerate.
      camera.position.lerp(desiredPos, 1 - Math.exp(-CAMERA_POSITION_LAMBDA * delta));
      smoothedLook.current.lerp(desiredLook, 1 - Math.exp(-CAMERA_LOOK_LAMBDA * delta));
    }

    // Aim tether. Same unbounded-lag problem as the position, but it fails far more
    // violently: the lag points back along the travel axis, straight at the camera, so at
    // speed the aim pitches down hard and eventually inverts. Clamping the offset from the
    // true aim point keeps framing at 600mph identical to framing at rest.
    lookLag.subVectors(smoothedLook.current, desiredLook);
    const lagDist = lookLag.length();
    if (lagDist > CAMERA_MAX_LOOK_LAG) {
      smoothedLook.current
        .copy(desiredLook)
        .addScaledVector(lookLag, CAMERA_MAX_LOOK_LAG / lagDist);
    }

    // Tether. The damping above lags by roughly speed/lambda, which is unbounded: at top
    // speed the camera trails ever further back, and in fast reverse the car closes that
    // gap and drives straight past the camera. Clamping the horizontal separation bounds
    // both, and because the clamp is a continuous function of position the camera just
    // rides the limit rather than snapping to it.
    // The bounds also have to admit the pose the user asked for: orbiting overhead
    // legitimately shrinks the horizontal distance below the floor, and a fixed clamp would
    // shove the camera back out and fight the mouse. With no mouse input `ground` is 7.5,
    // inside [5.5, 9.5], so the resting behaviour is bit-for-bit what it was.
    const minDist = Math.min(CAMERA_MIN_DISTANCE, ground);
    const maxDist = Math.max(CAMERA_MAX_DISTANCE, ground);
    flatOffset.set(camera.position.x - target.position.x, 0, camera.position.z - target.position.z);
    const dist = flatOffset.length();
    const clamped = THREE.MathUtils.clamp(dist, minDist, maxDist);
    if (clamped !== dist) {
      if (dist < 1e-4) {
        // Camera sitting exactly on the car gives no usable direction to push along, so
        // fall back to the ideal behind-the-car direction.
        flatOffset
          .set(desiredPos.x - target.position.x, 0, desiredPos.z - target.position.z)
          .normalize();
      } else {
        flatOffset.divideScalar(dist); // normalize (y is already 0)
      }
      camera.position.set(
        target.position.x + flatOffset.x * clamped,
        camera.position.y, // height stays with the damping
        target.position.z + flatOffset.z * clamped,
      );
    }

    camera.lookAt(smoothedLook.current);
  });

  return null;
}
