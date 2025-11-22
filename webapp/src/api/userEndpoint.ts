import http from 'src/api/http';
import type {
  GetUserDetailParams,
  GetUserDetailResponse,
  PostUserSyncResponse,
} from 'src/model/backend/api/User';
import { alertError } from './errorHandler';

const getUserDetail = async (params: GetUserDetailParams) => {
  try {
    return await http.get<GetUserDetailResponse, GetUserDetailParams>('user/detail', {
      params,
    });
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
  getUserDetail,
  postUserSync,
};
