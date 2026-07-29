// components/ScenarioSetup/TopDownMap.jsx
// A to-scale plan view of the layout: world +X to the right, world +Z UP the screen (the car
// spawns at the origin facing +Z, so "forward" reads as "up", the way you'd draw a track).
//
// A plain 2D canvas, deliberately NOT a second react-three-fiber scene. The simulator canvas
// stays mounted and running behind this tab, and a second WebGL context plus a second copy of
// the obstacle components would double the thing that has to stay in sync with the layout.
// This draws from `obstacleFootprint()` alone, so it never special-cases a type.
//
// Dragging updates a LOCAL preview and only dispatches on pointer-up. Every obstacle's rigid
// body is keyed on its position, so dispatching per pointermove would destroy and recreate a
// Rapier body ~60 times a second while the car is driving next to it.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { obstacleFootprint } from '../../obstacles/schema';
import { addObstacle, moveObstacle, selectObstacle } from '../../state/layoutSlice';
import { selectSceneObstacles, selectSelectedObstacleId } from '../../state/selectors';

const INITIAL_VIEW = { centerX: 0, centerZ: 50, mpp: 0.18 }; // metres per pixel
const MIN_MPP = 0.02;
const MAX_MPP = 4;

const COLORS = {
  bg: '#101418',
  grid: '#1b2229',
  axis: '#2c3843',
  label: '#5d6b78',
  spawn: '#f2c14e',
  selection: '#ffffff',
};

/** Rotate a world XZ point into an obstacle's local frame (inverse of a Y rotation). */
function toLocal(dx, dz, rotationY) {
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  return { lx: dx * c - dz * s, lz: dx * s + dz * c };
}

function hitTest(footprint, wx, wz) {
  const dx = wx - footprint.x;
  const dz = wz - footprint.z;
  if (footprint.shape === 'circle') return Math.hypot(dx, dz) <= footprint.radius;
  const { lx, lz } = toLocal(dx, dz, footprint.rotationY);
  return Math.abs(lx) <= footprint.width / 2 && Math.abs(lz) <= footprint.depth / 2;
}

/** Grid spacing that stays readable at any zoom: 1, 2, 5, 10, 20, 50... metres. */
function gridStep(mpp) {
  const target = mpp * 80; // aim for a line every ~80px
  const pow = 10 ** Math.floor(Math.log10(target));
  const norm = target / pow;
  return (norm > 5 ? 10 : norm > 2 ? 5 : norm > 1 ? 2 : 1) * pow;
}

export function TopDownMap({ pendingType, onPlaced }) {
  const obstacles = useSelector(selectSceneObstacles);
  const selectedId = useSelector(selectSelectedObstacleId);
  const dispatch = useDispatch();

  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const dragRef = useRef(null);
  const [view, setView] = useState(INITIAL_VIEW);
  const [size, setSize] = useState({ w: 600, h: 400 });
  const [preview, setPreview] = useState(null); // { id, x, z } while dragging

  // --- world <-> screen -----------------------------------------------------
  const toScreen = useCallback(
    (wx, wz) => ({
      x: size.w / 2 + (wx - view.centerX) / view.mpp,
      y: size.h / 2 - (wz - view.centerZ) / view.mpp,
    }),
    [size, view],
  );
  const toWorld = useCallback(
    (sx, sy) => ({
      x: view.centerX + (sx - size.w / 2) * view.mpp,
      z: view.centerZ - (sy - size.h / 2) * view.mpp,
    }),
    [size, view],
  );

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.max(1, Math.round(width)), h: Math.max(1, Math.round(height)) });
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  // Wheel zoom is registered natively so it can preventDefault — React's synthetic wheel
  // listener is passive, and without this the surrounding panel scrolls while you zoom.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      setView((v) => {
        const mpp = Math.min(MAX_MPP, Math.max(MIN_MPP, v.mpp * (e.deltaY > 0 ? 1.12 : 1 / 1.12)));
        // Keep the world point under the cursor pinned while zooming.
        const wx = v.centerX + (sx - rect.width / 2) * v.mpp;
        const wz = v.centerZ - (sy - rect.height / 2) * v.mpp;
        return {
          mpp,
          centerX: wx - (sx - rect.width / 2) * mpp,
          centerZ: wz + (sy - rect.height / 2) * mpp,
        };
      });
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  // --- drawing --------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, size.w, size.h);

    // Grid + axes
    const step = gridStep(view.mpp);
    const topLeft = toWorld(0, 0);
    const bottomRight = toWorld(size.w, size.h);
    ctx.lineWidth = 1;
    ctx.font = '10px system-ui, sans-serif';
    for (let x = Math.ceil(topLeft.x / step) * step; x <= bottomRight.x; x += step) {
      const sx = Math.round(toScreen(x, 0).x) + 0.5;
      ctx.strokeStyle = Math.abs(x) < 1e-6 ? COLORS.axis : COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, size.h);
      ctx.stroke();
      ctx.fillStyle = COLORS.label;
      ctx.fillText(`${Math.round(x)}`, sx + 3, size.h - 4);
    }
    for (let z = Math.ceil(bottomRight.z / step) * step; z <= topLeft.z; z += step) {
      const sy = Math.round(toScreen(0, z).y) + 0.5;
      ctx.strokeStyle = Math.abs(z) < 1e-6 ? COLORS.axis : COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(size.w, sy);
      ctx.stroke();
      ctx.fillStyle = COLORS.label;
      ctx.fillText(`${Math.round(z)}`, 4, sy - 3);
    }

    // Spawn marker: the car starts at the origin facing +Z (up).
    const origin = toScreen(0, 0);
    ctx.fillStyle = COLORS.spawn;
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y - 9);
    ctx.lineTo(origin.x - 6, origin.y + 7);
    ctx.lineTo(origin.x + 6, origin.y + 7);
    ctx.closePath();
    ctx.fill();

    for (const obstacle of obstacles) {
      const moved = preview?.id === obstacle.id
        ? { ...obstacle, position: [preview.x, obstacle.position[1], preview.z] }
        : obstacle;
      const fp = obstacleFootprint(moved);
      const { x: sx, y: sy } = toScreen(fp.x, fp.z);
      const selected = obstacle.id === selectedId;

      ctx.save();
      ctx.translate(sx, sy);
      ctx.fillStyle = fp.color;
      ctx.globalAlpha = 0.85;
      if (fp.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, fp.radius / view.mpp, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Footprints are symmetric about both axes, so the sign convention between world Y
        // rotation and canvas rotation doesn't matter here — the arrow below carries facing.
        ctx.rotate(-fp.rotationY);
        const w = fp.width / view.mpp;
        const d = fp.depth / view.mpp;
        ctx.fillRect(-w / 2, -d / 2, w, d);
      }
      ctx.globalAlpha = 1;
      if (selected) {
        ctx.restore();
        ctx.save();
        ctx.translate(sx, sy);
        ctx.strokeStyle = COLORS.selection;
        ctx.lineWidth = 2;
        if (fp.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(0, 0, fp.radius / view.mpp + 2, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.rotate(-fp.rotationY);
          ctx.strokeRect(-fp.width / view.mpp / 2 - 2, -fp.depth / view.mpp / 2 - 2, fp.width / view.mpp + 4, fp.depth / view.mpp + 4);
        }
      }
      ctx.restore();

      // Facing arrow for the directional types. A ramp rises toward its local +Z and a pad
      // boosts along its local +Z, so which way they point is a physical property, not decor.
      if (moved.type === 'ramp' || moved.type === 'boostPad') {
        const dirX = Math.sin(fp.rotationY);
        const dirY = -Math.cos(fp.rotationY); // screen y is inverted world z
        const len = Math.min(fp.depth / view.mpp / 2, 26);
        ctx.strokeStyle = '#e8f4ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx - dirX * len, sy - dirY * len);
        ctx.lineTo(sx + dirX * len, sy + dirY * len);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(sx + dirX * len, sy + dirY * len);
        ctx.lineTo(sx + dirX * (len - 7) - dirY * 5, sy + dirY * (len - 7) + dirX * 5);
        ctx.lineTo(sx + dirX * (len - 7) + dirY * 5, sy + dirY * (len - 7) - dirX * 5);
        ctx.closePath();
        ctx.fillStyle = '#e8f4ff';
        ctx.fill();
      }
    }
  }, [obstacles, selectedId, preview, size, view, toScreen, toWorld]);

  // --- interaction ----------------------------------------------------------
  const onPointerDown = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const world = toWorld(e.clientX - rect.left, e.clientY - rect.top);

    if (pendingType) {
      dispatch(addObstacle({ type: pendingType, position: [world.x, 0, world.z] }));
      onPlaced?.();
      return;
    }

    // Last drawn is on top, so search back to front.
    const hit = [...obstacles].reverse().find((o) => hitTest(obstacleFootprint(o), world.x, world.z));
    e.currentTarget.setPointerCapture(e.pointerId);
    if (hit) {
      dispatch(selectObstacle(hit.id));
      dragRef.current = {
        mode: 'obstacle',
        id: hit.id,
        grabX: world.x - hit.position[0],
        grabZ: world.z - hit.position[2],
      };
    } else {
      dispatch(selectObstacle(null));
      dragRef.current = { mode: 'pan', startX: e.clientX, startY: e.clientY, view };
    }
  };

  const onPointerMove = (e) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.mode === 'obstacle') {
      const rect = e.currentTarget.getBoundingClientRect();
      const world = toWorld(e.clientX - rect.left, e.clientY - rect.top);
      setPreview({ id: drag.id, x: world.x - drag.grabX, z: world.z - drag.grabZ });
    } else {
      setView({
        ...drag.view,
        centerX: drag.view.centerX - (e.clientX - drag.startX) * drag.view.mpp,
        centerZ: drag.view.centerZ + (e.clientY - drag.startY) * drag.view.mpp,
      });
    }
  };

  const endDrag = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    // The single dispatch for a whole drag — one rigid-body rebuild instead of one per frame.
    if (drag?.mode === 'obstacle' && preview) {
      dispatch(moveObstacle({ id: drag.id, x: preview.x, z: preview.z }));
    }
    setPreview(null);
  };

  return (
    <div className="map-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="map-canvas"
        // Reading dragRef during render would be a ref read in render; the grab cursor comes
        // from CSS (:active) instead.
        style={{ width: size.w, height: size.h, cursor: pendingType ? 'copy' : 'grab' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
      <div className="map-legend">
        <span>▲ spawn (facing +Z)</span>
        <span>drag to move · empty space pans · scroll zooms</span>
        <button className="ghost" onClick={() => setView(INITIAL_VIEW)}>
          Reset view
        </button>
      </div>
    </div>
  );
}
