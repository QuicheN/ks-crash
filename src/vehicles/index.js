// vehicles/index.js
// Registry of vehicle definitions. Adding a model means adding a definition file here — the
// rest of the codebase consumes definitions and never references a model by name or URL.
//
// To switch the car being simulated, change ACTIVE_VEHICLE_ID. VehicleMesh already tears
// down its controller, rigid body and debris on unmount, so passing a different vehicleId
// and remounting is all a runtime picker would need.
import { genericSedan } from './genericSedan';
import { lowPolyWagon } from './lowPolyWagon';

export const VEHICLES = {
  [genericSedan.id]: genericSedan,
  [lowPolyWagon.id]: lowPolyWagon,
};

/** The vehicle the simulation loads by default. */
export const ACTIVE_VEHICLE_ID = lowPolyWagon.id;

export function getVehicle(id = ACTIVE_VEHICLE_ID) {
  const vehicle = VEHICLES[id];
  if (!vehicle) throw new Error(`Unknown vehicle "${id}". Known: ${Object.keys(VEHICLES).join(', ')}`);
  return vehicle;
}

export function listVehicles() {
  return Object.values(VEHICLES).map(({ id, label, url }) => ({ id, label, url }));
}
