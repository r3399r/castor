import http from 'src/api/http';
import type {
  GetQuestionParams,
  GetQuestionResponse,
  GetQuestionIdResponse,
  GetQuestionAdaptiveResponse,
  GetQuestionAdaptiveParams,
} from 'src/model/backend/api/Question';
import { alertError } from './errorHandler';

const getQuestion = async (params?: GetQuestionParams) => {
  try {
    return await http.get<GetQuestionResponse, GetQuestionParams>('question', {
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

const getQuestionAdaptive = async (params: GetQuestionAdaptiveParams) => {
  try {
    return await http.get<GetQuestionAdaptiveResponse, GetQuestionAdaptiveParams>(
      'question/adaptive',
      { params },
    );
  } catch (e) {
    alertError(e);
  }
};

export default {
  getQuestion,
  getQuestionAdaptive,
  getQuestionId,
};
