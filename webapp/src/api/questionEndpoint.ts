import http from 'src/api/http';
import type {
  GetQuestionParams,
  GetQuestionResponse,
  GetQuestionIdResponse,
  PostQuestionReplyRequest,
  PostQuestionReplyResponse,
  GetQuestionTagParams,
  GetQuestionTagResponse,
} from 'src/model/backend/api/Question';

const getQuestion = async (params?: GetQuestionParams) => {
  try {
    return await http.get<GetQuestionResponse>('question', {
      params,
    });
  } catch {
    alert('發生無預期錯誤，請重新再試，若反覆出現此問題，請聯絡客服人員。');
  }
};

const getQuestionId = async (id: string) => {
  try {
    return await http.get<GetQuestionIdResponse>(`question/${id}`);
  } catch {
    alert('發生無預期錯誤，請重新再試，若反覆出現此問題，請聯絡客服人員。');
  }
};

const getQuestionTag = async (params: GetQuestionTagParams) => {
  try {
    return await http.get<GetQuestionTagResponse>('question/tag', { params });
  } catch {
    alert('發生無預期錯誤，請重新再試，若反覆出現此問題，請聯絡客服人員。');
  }
};

const postQuestionReply = async (data: PostQuestionReplyRequest) => {
  try {
    return await http.post<PostQuestionReplyResponse, PostQuestionReplyRequest>(`question/reply`, {
      data,
    });
  } catch {
    alert('發生無預期錯誤，請重新再試，若反覆出現此問題，請聯絡客服人員。');
  }
};

export default {
  getQuestion,
  getQuestionTag,
  getQuestionId,
  postQuestionReply,
};
