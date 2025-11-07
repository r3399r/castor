import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { User } from 'src/model/backend/entity/UserEntity';

export type UiState = {
  workload: number;
  categoryId: number | null;
  isLogin: boolean;
  user: User | null;
};

const initialState: UiState = {
  workload: 0,
  categoryId: null,
  isLogin: false,
  user: null,
};

export const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    startWaiting: (state: UiState) => {
      state.workload = state.workload + 1;
    },
    finishWaiting: (state: UiState) => {
      state.workload = state.workload - 1;
    },
    setCategoryId: (state: UiState, action: PayloadAction<number>) => {
      state.categoryId = action.payload;
    },
    setIsLogin: (state: UiState, action: PayloadAction<boolean>) => {
      state.isLogin = action.payload;
    },
    setUser: (state: UiState, action: PayloadAction<User>) => {
      state.user = action.payload;
    },
  },
});

export const { startWaiting, finishWaiting, setCategoryId, setIsLogin, setUser } = uiSlice.actions;

export default uiSlice.reducer;
