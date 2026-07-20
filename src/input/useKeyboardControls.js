// input/useKeyboardControls.js
// Tracks held keys in a ref (NOT React state) so the physics loop can read input
// every frame without triggering re-renders — per CLAUDE.md, the 60fps path never
// touches React/Redux state.
import { useEffect, useRef } from 'react';

// Map each physical key to the control flag it drives. WASD + arrows + Space.
const KEY_MAP = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'brake',
};

export function useKeyboardControls() {
  // The single mutable object every consumer reads from. Reassigning fields on
  // `.current` never re-renders React.
  const controls = useRef({
    forward: false,
    back: false,
    left: false,
    right: false,
    brake: false,
  });

  useEffect(() => {
    // keydown sets the flag, keyup clears it; `setPressed` shares the logic.
    const setPressed = (code, value) => {
      const action = KEY_MAP[code];
      if (action) controls.current[action] = value;
    };
    const onKeyDown = (e) => {
      if (KEY_MAP[e.code]) e.preventDefault(); // stop Space/arrows scrolling the page
      setPressed(e.code, true);
    };
    const onKeyUp = (e) => setPressed(e.code, false);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  return controls;
}
