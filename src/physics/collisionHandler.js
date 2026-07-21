// physics/collisionHandler.js
// Drains Rapier's collision event queue after each physics step and turns raw contact
// events into *severity-classified impacts*.
//
// Severity is the NORMAL component of the chassis velocity, never raw speed — that is the
// whole point of the classification. Sliding along a wall at 300mph is a scrape; hitting it
// head-on at 20mph is a real impact. Projecting velocity onto the contact normal is what
// separates the two, and it's the same quantity a delta-v damage model wants later.
//
// This runs entirely on the physics ref path: it allocates nothing per event beyond the
// impact record it hands to the callback, and it never touches React or Redux (per the
// architecture contract in edits.md — Redux is for human-readable state, dispatched off the
// per-frame path).
import { IMPACT_MIN_SEVERITY } from '../utils/constants';

// The chassis velocity as it was *entering* the step that produced these events. Collision
// events are drained after world.step(), by which point the solver has already cancelled
// most of the approach velocity — reading linvel() at drain time would report a severity
// far lower than the impact actually was. Captured per-substep, reused for every event.
const approachVel = { x: 0, y: 0, z: 0 };

/** Call immediately before world.step(), while the pre-impact velocity is still intact. */
export function captureApproachVelocity(vehicle) {
  const v = vehicle.chassisBody.linvel();
  approachVel.x = v.x;
  approachVel.y = v.y;
  approachVel.z = v.z;
}

/**
 * Drain one step's collision events and report chassis impacts above the severity floor.
 *
 * `onImpact` receives { severity, point, normal, otherHandle }:
 *   severity  - |v · n| in m/s, the closing speed along the contact normal
 *   point     - world-space contact point (plain object; Rapier's is a temp view)
 *   normal    - world-space unit contact normal (plain object)
 * Fires only on contact START; ongoing rest contact with the ground is not an impact.
 */
export function drainCollisions(world, eventQueue, vehicle, onImpact) {
  if (!eventQueue || !vehicle || !onImpact) return;
  const chassisHandle = vehicle.chassisCollider.handle;

  eventQueue.drainCollisionEvents((h1, h2, started) => {
    if (!started) return;
    if (h1 !== chassisHandle && h2 !== chassisHandle) return;

    const c1 = world.getCollider(h1);
    const c2 = world.getCollider(h2);
    if (!c1 || !c2) return;

    // A pair can carry several manifolds; the most severe one characterises the hit.
    let severity = -1;
    let nx = 0, ny = 0, nz = 0;
    let px = 0, py = 0, pz = 0;
    let havePoint = false;

    world.contactPair(c1, c2, (manifold) => {
      const n = manifold.normal(); // world-space
      const s = Math.abs(approachVel.x * n.x + approachVel.y * n.y + approachVel.z * n.z);
      if (s <= severity) return;
      severity = s;
      nx = n.x; ny = n.y; nz = n.z;
      if (manifold.numSolverContacts() > 0) {
        const p = manifold.solverContactPoint(0); // world-space
        px = p.x; py = p.y; pz = p.z;
        havePoint = true;
      }
    });

    if (severity < IMPACT_MIN_SEVERITY) return;

    // No solver contact yet (possible on the very first frame of a CCD-resolved hit) —
    // fall back to the chassis origin so the impact still has a usable location.
    if (!havePoint) {
      const t = vehicle.chassisBody.translation();
      px = t.x; py = t.y; pz = t.z;
    }

    onImpact({
      severity,
      point: { x: px, y: py, z: pz },
      normal: { x: nx, y: ny, z: nz },
      otherHandle: h1 === chassisHandle ? h2 : h1,
    });
  });
}
