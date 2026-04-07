import http from 'src/api/http';
import type { GetUserStatsResponse, PostUserSyncResponse } from 'src/model/backend/api/User';
import { alertError } from './errorHandler';

const getUserStats = async () => {
  try {
    return await http.get<GetUserStatsResponse>('user/stats');
  } catch (e) {
    alertError(e);
  }
};

const postUserSync = async () => {
  try {
    return await http.post<PostUserSyncResponse>('user/sync');
  } catch (e) {
    alertError(e);
  }
};

export default {
  getUserStats,
  postUserSync,
};
