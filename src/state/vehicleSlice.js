import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  speed: 0,
};

const vehicleSlice = createSlice({
  name: 'vehicle',
  initialState,
  reducers: {
    setSpeed(state, action) {
      state.speed = action.payload;
    }
  },
});

export const { setSpeed } = vehicleSlice.actions;
export default vehicleSlice.reducer;