import { AxiosError, isAxiosError } from 'axios';
import { dispatch } from 'src/redux/store';
import { setIsLogin } from 'src/redux/uiSlice';

export const alertError = (e: unknown) => {
  if (!isAxiosError(e)) alert('發生無預期錯誤，請重新再試，若反覆出現此問題，請聯絡客服人員。');
  const error = e as AxiosError;
  if (error.response?.status === 401) {
    dispatch(setIsLogin(false));
    alert('發生錯誤，請重新登入後再試。');
  } else alert('發生無預期錯誤，請重新再試，若反覆出現此問題，請聯絡客服人員。');
};
