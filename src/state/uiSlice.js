import { createSlice } from '@reduxjs/toolkit';

// Which tab is showing. The simulator canvas stays MOUNTED whichever tab is active (see
// App.jsx) — this only decides what is visible, never what exists, so switching tabs never
// tears down the physics world.
const initialState = {
  activeTab: 'simulator', // 'simulator' | 'editor'
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setActiveTab(state, action) {
      state.activeTab = action.payload;
    },
  },
});

export const { setActiveTab } = uiSlice.actions;
export default uiSlice.reducer;
