import http from 'src/api/http';
import type { GetQuestionParams, GetQuestionResponse } from 'src/model/backend/api/Question';

const getQuestion = async (params?: GetQuestionParams) => {
  try {
    return await http.get<GetQuestionResponse>('question', { params });
  } catch {
    alert('發生無預期錯誤，請重新再試，若反覆出現此問題，請聯絡客服人員。');
  }
};

export default {
  getQuestion,
};
