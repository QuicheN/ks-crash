// physics/world.js
import RAPIER from '@dimforge/rapier3d-compat';

let world = null;

export async function initWorld() {
  await RAPIER.init();
  world = new RAPIER.World({ x: 0.0, y: -9.81, z: 0.0 });
  return world;
}

export function getWorld() {
  return world;
}