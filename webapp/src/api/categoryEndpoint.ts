import http from 'src/api/http';
import type { GetCategoryResponse } from 'src/model/backend/api/Category';

const getCategory = async () => {
  try {
    return await http.get<GetCategoryResponse>('category');
  } catch {
    alert('發生無預期錯誤，請重新再試，若反覆出現此問題，請聯絡客服人員。');
  }
};

export default {
  getCategory,
};
