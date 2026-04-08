import http from 'src/api/http';
import { alertError } from './errorHandler';
import type {
  GetReplyParams,
  GetReplyResponse,
  PostReplyRequest,
  PostReplyResponse,
} from 'src/model/backend/api/Reply';

const postReply = async (data: PostReplyRequest) => {
  try {
    return await http.post<PostReplyResponse, PostReplyRequest>('reply', { data });
  } catch (e) {
    alertError(e);
  }
};

const getReply = async (params?: GetReplyParams) => {
  try {
    return await http.get<GetReplyResponse, GetReplyParams>('reply', {
      params,
    });
  } catch (e) {
    alertError(e);
  }
};

export default {
  postReply,
  getReply,
};
