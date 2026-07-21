import RAPIER from '@dimforge/rapier3d-compat';

let world = null;
let eventQueue = null;

export async function initWorld() {
  await RAPIER.init();
  world = new RAPIER.World({ x: 0.0, y: -9.81, z: 0.0 });
  // autoDrain=true: the queue is cleared at the start of each world.step(), so an
  // undrained frame can't accumulate events forever. We drain it right after every step
  // in usePhysicsLoop, so nothing is missed.
  eventQueue = new RAPIER.EventQueue(true);
  return world;
}

export function getWorld() {
  return world;
}

export function getEventQueue() {
  return eventQueue;
}
