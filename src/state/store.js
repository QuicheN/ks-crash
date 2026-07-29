import { configureStore } from '@reduxjs/toolkit';
import vehicleReducer from './vehicleSlice';
import uiReducer from './uiSlice';
import layoutReducer from './layoutSlice';

export const store = configureStore({
  reducer: {
    vehicle: vehicleReducer,
    ui: uiReducer,
    layout: layoutReducer,
  },
});


export const getState = () => store.getState();
export const dispatch = store.dispatch;
