import { configureStore } from '@reduxjs/toolkit';
import uiReducer from './uiSlice';

export type RootState = ReturnType<typeof store.getState>;

export const store = configureStore({
  reducer: {
    ui: uiReducer,
  },
});
