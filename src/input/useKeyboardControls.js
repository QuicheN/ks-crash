// input/useKeyboardControls.js
// Tracks held keys in a ref (NOT React state) so the physics loop can read input
// every frame without triggering re-renders — per CLAUDE.md, the 60fps path never
// touches React/Redux state.
import { useEffect, useRef } from 'react';

// Map each physical key to the control flag it drives. WASD + arrows + Space, plus R to
// respawn. `reset` is a MOMENTARY flag like the rest — the physics loop edge-triggers on it
// so holding R respawns once, not every frame.
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
  KeyR: 'reset',
};

// The listener below is on `window`, so it fires wherever focus is — including the layout
// editor's text fields. There, the keystroke belongs to the field: preventDefault() would
// swallow the character (typing "wasd" into a layout name produced nothing), and the car
// should not drive off while someone is typing.
const isTextEntry = (el) =>
  el instanceof HTMLElement &&
  (el.isContentEditable ||
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT');

export function useKeyboardControls() {
  // The single mutable object every consumer reads from. Reassigning fields on
  // `.current` never re-renders React.
  const controls = useRef({
    forward: false,
    back: false,
    left: false,
    right: false,
    brake: false,
    reset: false,
  });

  useEffect(() => {
    // keydown sets the flag, keyup clears it; `setPressed` shares the logic.
    const setPressed = (code, value) => {
      const action = KEY_MAP[code];
      if (action) controls.current[action] = value;
    };
    const onKeyDown = (e) => {
      if (isTextEntry(e.target)) return;
      // A modified key is a browser/OS shortcut, not a driving input — and since R is now
      // mapped, without this Cmd/Ctrl+R would be swallowed and the page could not be reloaded.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (KEY_MAP[e.code]) e.preventDefault(); // stop Space/arrows scrolling the page
      setPressed(e.code, true);
    };
    // keyup is deliberately NOT filtered the same way: hold W, click into a text field, then
    // release, and a symmetric guard would skip this and leave `forward` stuck true — the car
    // driving with no key held. Clearing a flag is always safe; only setting one needs a guard.
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
