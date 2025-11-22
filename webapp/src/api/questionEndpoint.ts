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
import { alertError } from './errorHandler';

const getQuestion = async (params?: GetQuestionParams) => {
  try {
    return await http.get<GetQuestionResponse>('question', {
      params,
    });
  } catch (e) {
    alertError(e);
  }
};

const getQuestionId = async (id: string) => {
  try {
    return await http.get<GetQuestionIdResponse>(`question/${id}`);
  } catch (e) {
    alertError(e);
  }
};

const getQuestionTag = async (params: GetQuestionTagParams) => {
  try {
    return await http.get<GetQuestionTagResponse>('question/tag', { params });
  } catch (e) {
    alertError(e);
  }
};

const postQuestionStart = async (data: PostQuestionStartRequest) => {
  try {
    return await http.post<PostQuestionStartResponse, PostQuestionStartRequest>(`question/start`, {
      data,
    });
  } catch (e) {
    alertError(e);
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
  } catch (e) {
    alertError(e);
  }
};

export default {
  getQuestion,
  getQuestionTag,
  getQuestionId,
  postQuestionStart,
  postQuestionComplete,
};
