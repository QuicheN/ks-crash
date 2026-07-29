// state/selectors.js
// The read side of the store. Per CLAUDE.md, UI reads only from here — components never reach
// into state shape directly, so the slices stay free to change.
//
// `selectSceneObstacles` is the important one: it is what SceneCanvas renders, and it returns
// the draft's array BY REFERENCE. That matters. Every obstacle body is keyed on its position
// and size primitives inside `useObstacleBody`, so a selector that built a new array (or new
// entries) each call would remount every obstacle in the scene on unrelated state changes —
// destroying and recreating rigid bodies mid-drive. Reshaping here would be a physics bug,
// not a style choice.
import { createSelector } from '@reduxjs/toolkit';
import { OBSTACLE_SCHEMA } from '../obstacles/schema';

export const selectActiveTab = (state) => state.ui.activeTab;

export const selectDraft = (state) => state.layout.draft;
export const selectSceneObstacles = (state) => state.layout.draft.obstacles;
export const selectDraftName = (state) => state.layout.draft.name;
export const selectDraftId = (state) => state.layout.draft.id;
export const selectSelectedObstacleId = (state) => state.layout.selectedId;
export const selectSavedLayouts = (state) => state.layout.saved;
export const selectLayoutStatus = (state) => state.layout.status;
export const selectLayoutError = (state) => state.layout.error;

export const selectSelectedObstacle = createSelector(
  [selectSceneObstacles, selectSelectedObstacleId],
  (obstacles, id) => obstacles.find((o) => o.id === id) ?? null,
);

/** Counts per type, for the editor's summary line. */
export const selectObstacleCounts = createSelector([selectSceneObstacles], (obstacles) => {
  const counts = {};
  for (const obstacle of obstacles) counts[obstacle.type] = (counts[obstacle.type] ?? 0) + 1;
  return Object.entries(counts).map(([type, count]) => ({
    type,
    count,
    label: OBSTACLE_SCHEMA[type]?.label ?? type,
  }));
});

export const selectVehicleSpeed = (state) => state.vehicle.speed;
