import http from 'src/api/http';
import type {
  GetQuestionParams,
  GetQuestionResponse,
  GetQuestionIdResponse,
  GetQuestionTagParams,
  GetQuestionTagResponse,
  PostQuestionCompleteRequest,
  PostQuestionCompleteResponse,
  PostQuestionStartRequest,
  PostQuestionStartResponse,
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

const postQuestionStart = async (data: PostQuestionStartRequest) => {
  try {
    return await http.post<PostQuestionStartResponse, PostQuestionStartRequest>(`question/start`, {
      data,
    });
  } catch {
    alert('發生無預期錯誤，請重新再試，若反覆出現此問題，請聯絡客服人員。');
  }
};

const postQuestionComplete = async (data: PostQuestionCompleteRequest) => {
  try {
    return await http.post<PostQuestionCompleteResponse, PostQuestionCompleteRequest>(
      `question/complete`,
      {
        data,
      },
    );
  } catch {
    alert('發生無預期錯誤，請重新再試，若反覆出現此問題，請聯絡客服人員。');
  }
};

export default {
  getQuestion,
  getQuestionTag,
  getQuestionId,
  postQuestionStart,
  postQuestionComplete,
};
