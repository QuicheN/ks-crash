// state/layoutSlice.js
// The scenario layout the app is currently working on, plus the index of stored layouts.
//
// THE DRAFT IS THE SCENE. `state.layout.draft.obstacles` is what SceneCanvas renders, so an
// edit in the editor tab is a change to the world — there is no second copy to keep in sync.
// A draft with `id: null` has never been stored (a brand-new layout, or the built-in one).
//
// This slice is the ONLY part of the app that calls the persistence layer, and it does so
// exclusively from the thunks below. Components dispatch; they never import the repository.
// That keeps the eventual MongoDB swap confined to `persistence/` — nothing here changes when
// an await becomes a network call, which is why every repository method is already async.
//
// Redux is the right home for this despite the "physics never touches Redux at 60fps" rule:
// layout editing is human-speed, and the per-frame path still reads nothing from the store.
import { createSlice, createAsyncThunk, current } from '@reduxjs/toolkit';
import { DEFAULT_LAYOUT } from '../obstacles/layout';
import { makeObstacle, normalizeObstacle, writeField } from '../obstacles/schema';
import {
  createLayout,
  deleteLayout,
  getLayout,
  listLayouts,
  updateLayout,
} from '../persistence';

function draftFromDocument(doc) {
  return {
    // `null` for the built-in layout too: saving it should create a copy, never overwrite
    // something that lives in source and was never stored.
    id: doc.id?.startsWith('builtin:') ? null : doc.id,
    name: doc.name,
    obstacles: doc.obstacles.map(normalizeObstacle),
  };
}

const initialState = {
  draft: draftFromDocument(DEFAULT_LAYOUT),
  selectedId: null,
  saved: [], // summaries: { id, name, updatedAt, obstacleCount }
  status: 'idle', // 'idle' | 'loading' | 'saving'
  error: null,
};

// Thunk error text is what the user sees, so unwrap the message rather than letting RTK
// serialise the whole Error. LayoutStorageError messages are already user-facing.
const message = (err) => err?.message ?? 'Something went wrong.';

export const refreshSavedLayouts = createAsyncThunk(
  'layout/refreshSaved',
  async (_, { rejectWithValue }) => {
    try {
      return await listLayouts();
    } catch (err) {
      return rejectWithValue(message(err));
    }
  },
);

export const openLayout = createAsyncThunk(
  'layout/open',
  async (id, { rejectWithValue }) => {
    try {
      const doc = await getLayout(id);
      if (!doc) return rejectWithValue('That layout no longer exists.');
      return doc;
    } catch (err) {
      return rejectWithValue(message(err));
    }
  },
);

/**
 * Save the draft. `saveAs: true` (or a draft that was never stored) creates a new document;
 * otherwise the existing one is updated. The repository owns ids and timestamps either way.
 */
export const saveDraft = createAsyncThunk(
  'layout/save',
  async ({ saveAs = false, name } = {}, { getState, rejectWithValue }) => {
    const { draft } = getState().layout;
    const payload = { name: name ?? draft.name, obstacles: draft.obstacles };
    try {
      return draft.id && !saveAs
        ? await updateLayout(draft.id, payload)
        : await createLayout(payload);
    } catch (err) {
      return rejectWithValue(message(err));
    }
  },
);

export const removeLayout = createAsyncThunk(
  'layout/remove',
  async (id, { rejectWithValue }) => {
    try {
      await deleteLayout(id);
      return id;
    } catch (err) {
      return rejectWithValue(message(err));
    }
  },
);

const layoutSlice = createSlice({
  name: 'layout',
  initialState,
  reducers: {
    startNewLayout(state) {
      state.draft = { id: null, name: 'Untitled layout', obstacles: [] };
      state.selectedId = null;
      state.error = null;
    },
    loadBuiltInLayout(state) {
      state.draft = draftFromDocument(DEFAULT_LAYOUT);
      state.selectedId = null;
      state.error = null;
    },
    renameDraft(state, action) {
      state.draft.name = action.payload;
    },
    addObstacle(state, action) {
      const { type, position } = action.payload;
      const obstacle = makeObstacle(type, position);
      state.draft.obstacles.push(obstacle);
      state.selectedId = obstacle.id;
    },
    removeObstacle(state, action) {
      state.draft.obstacles = state.draft.obstacles.filter((o) => o.id !== action.payload);
      if (state.selectedId === action.payload) state.selectedId = null;
    },
    selectObstacle(state, action) {
      state.selectedId = action.payload;
    },
    /** `field` is a descriptor from obstacles/schema.js; `value` is its DISPLAY value. */
    setObstacleField(state, action) {
      const { id, field, value } = action.payload;
      const i = state.draft.obstacles.findIndex((o) => o.id === id);
      if (i === -1) return;
      // `current()` unwraps the Immer draft first — the schema helpers spread and copy
      // arrays, and doing that to a proxy would bake proxies into the new object.
      state.draft.obstacles[i] = writeField(current(state.draft.obstacles[i]), field, value);
    },
    /** Drag on the top-down map: X/Z only, y stays whatever the type's contract says. */
    moveObstacle(state, action) {
      const { id, x, z } = action.payload;
      const i = state.draft.obstacles.findIndex((o) => o.id === id);
      if (i === -1) return;
      state.draft.obstacles[i] = normalizeObstacle({
        ...current(state.draft.obstacles[i]),
        position: [x, 0, z],
      });
    },
    clearError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(refreshSavedLayouts.fulfilled, (state, action) => {
        state.saved = action.payload;
      })
      .addCase(openLayout.fulfilled, (state, action) => {
        state.draft = draftFromDocument(action.payload);
        state.selectedId = null;
      })
      .addCase(saveDraft.fulfilled, (state, action) => {
        // Adopt the id the repository assigned, so the next save updates rather than
        // duplicating. This is why the UI must never mint ids of its own.
        state.draft.id = action.payload.id;
        state.draft.name = action.payload.name;
      })
      .addCase(removeLayout.fulfilled, (state, action) => {
        state.saved = state.saved.filter((s) => s.id !== action.payload);
        // The open draft survives its stored copy being deleted — it just becomes unsaved.
        if (state.draft.id === action.payload) state.draft.id = null;
      })
      // One pending/rejected handler for all four thunks, matched by action type suffix.
      .addMatcher(
        (action) => action.type.startsWith('layout/') && action.type.endsWith('/pending'),
        (state, action) => {
          state.status = action.type.includes('/save') ? 'saving' : 'loading';
          state.error = null;
        },
      )
      .addMatcher(
        (action) => action.type.startsWith('layout/') && action.type.endsWith('/fulfilled'),
        (state) => {
          state.status = 'idle';
        },
      )
      .addMatcher(
        (action) => action.type.startsWith('layout/') && action.type.endsWith('/rejected'),
        (state, action) => {
          state.status = 'idle';
          state.error = action.payload ?? 'Something went wrong.';
        },
      );
  },
});

export const {
  startNewLayout,
  loadBuiltInLayout,
  renameDraft,
  addObstacle,
  removeObstacle,
  selectObstacle,
  setObstacleField,
  moveObstacle,
  clearError,
} = layoutSlice.actions;

export default layoutSlice.reducer;
