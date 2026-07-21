// input/useMouseLook.js
// Pointer-lock mouse look. Click the canvas to capture the cursor; mouse movement then
// orbits the camera around the car with no window-edge limit. Esc releases it.
//
// Same contract as useKeyboardControls: state lives in a ref and is mutated by DOM events,
// so the 60fps path never triggers a React render. This hook owns only the RAW accumulated
// angles — the easing back to centre is a camera-feel concern and lives in CameraRig, which
// is the thing with a per-frame delta.
import { useEffect, useRef } from 'react';
import {
  CAMERA_MOUSE_SENSITIVITY,
  CAMERA_PITCH_MIN,
  CAMERA_PITCH_MAX,
  CAMERA_RECENTER_DELAY,
  CAMERA_RECENTER_LAMBDA,
} from '../utils/constants';

export function useMouseLook(domElement) {
  // yaw/pitch are OFFSETS from the default chase pose, not absolute angles: zero means
  // "directly behind the car", which is what lets recenter() simply ease them to zero.
  const look = useRef({
    yaw: 0,
    pitch: 0,
    locked: false,
    lastMoveAt: 0,

    /**
     * Ease the view back behind the car once the mouse has been still. Called from the
     * camera's useFrame because it needs a per-frame delta — but the mutation lives here so
     * this hook stays the only writer of its own state.
     */
    recenter(delta) {
      if ((performance.now() - this.lastMoveAt) / 1000 <= CAMERA_RECENTER_DELAY) return;
      const k = 1 - Math.exp(-CAMERA_RECENTER_LAMBDA * delta);
      this.yaw -= this.yaw * k;
      this.pitch -= this.pitch * k;
    },
  });

  useEffect(() => {
    if (!domElement) return;
    const state = look.current;

    const onClick = () => {
      if (document.pointerLockElement === domElement) return;
      // Returns a promise in newer browsers; a rejection (e.g. too soon after an exit) is
      // not an error worth surfacing — the user can just click again.
      Promise.resolve(domElement.requestPointerLock?.()).catch(() => {});
    };

    const onLockChange = () => {
      state.locked = document.pointerLockElement === domElement;
    };

    const onMouseMove = (e) => {
      if (!state.locked) return;
      // Mouse right swings the view right, which means orbiting the camera the other way —
      // hence the negation. Mouse up raises the camera (orbit over the top).
      state.yaw -= e.movementX * CAMERA_MOUSE_SENSITIVITY;
      state.pitch -= e.movementY * CAMERA_MOUSE_SENSITIVITY;
      // Clamped as an absolute elevation range by the rig; clamped here too so the value
      // can't wind up unboundedly while the camera sits at the limit.
      const span = CAMERA_PITCH_MAX - CAMERA_PITCH_MIN;
      state.pitch = Math.max(-span, Math.min(span, state.pitch));
      state.lastMoveAt = performance.now();
    };

    domElement.addEventListener('click', onClick);
    document.addEventListener('pointerlockchange', onLockChange);
    document.addEventListener('mousemove', onMouseMove);
    return () => {
      domElement.removeEventListener('click', onClick);
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('mousemove', onMouseMove);
      if (document.pointerLockElement === domElement) document.exitPointerLock?.();
    };
  }, [domElement]);

  return look;
}
