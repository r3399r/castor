import http from 'src/api/http';
import type {
  GetUserDetailParams,
  GetUserDetailResponse,
  GetUserResponse,
  PostUserSyncResponse,
} from 'src/model/backend/api/User';

const getUser = async () => {
  try {
    return await http.get<GetUserResponse>('user');
  } catch {
    alert('發生無預期錯誤，請重新再試，若反覆出現此問題，請聯絡客服人員。');
  }
};

const getUserDetail = async (params: GetUserDetailParams) => {
  try {
    return await http.get<GetUserDetailResponse, GetUserDetailParams>('user/detail', {
      params,
    });
  } catch {
    alert('發生無預期錯誤，請重新再試，若反覆出現此問題，請聯絡客服人員。');
  }
};

const postUserSync = async () => {
  try {
    return await http.post<PostUserSyncResponse>('user/sync');
  } catch {
    alert('發生無預期錯誤，請重新再試，若反覆出現此問題，請聯絡客服人員。');
  }
};

export default {
  getUser,
  getUserDetail,
  postUserSync,
};
