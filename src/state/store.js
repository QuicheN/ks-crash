import { configureStore } from '@reduxjs/toolkit';
import vehicleReducer from './vehicleSlice';

export const store = configureStore({
  reducer: {
    vehicle: vehicleReducer,
  },
});


export const getState = () => store.getState();
export const dispatch = store.dispatch;