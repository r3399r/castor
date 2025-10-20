import http from 'src/api/http';
import type {
  GetUserDetailParams,
  GetUserDetailResponse,
  GetUserResponse,
} from 'src/model/backend/api/User';

const getUser = async () => {
  try {
    return await http.get<GetUserResponse>('user', {
      headers: {
        'x-user-id': localStorage.getItem('userId') || 'no-user-id',
        'x-device-id': localStorage.getItem('deviceId') || 'no-device-id',
      },
    });
  } catch {
    alert('發生無預期錯誤，請重新再試，若反覆出現此問題，請聯絡客服人員。');
  }
};

const getUserDetail = async (params: GetUserDetailParams) => {
  try {
    return await http.get<GetUserDetailResponse, GetUserDetailParams>('user/detail', {
      params,
      headers: {
        'x-user-id': localStorage.getItem('userId') || 'no-user-id',
      },
    });
  } catch {
    alert('發生無預期錯誤，請重新再試，若反覆出現此問題，請聯絡客服人員。');
  }
};

export default {
  getUser,
  getUserDetail,
};
