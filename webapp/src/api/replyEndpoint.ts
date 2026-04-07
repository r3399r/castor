import http from 'src/api/http';
import { alertError } from './errorHandler';
import type { PostReplyRequest, PostReplyResponse } from 'src/model/backend/api/Reply';

const postReply = async (data: PostReplyRequest) => {
  try {
    return await http.post<PostReplyResponse, PostReplyRequest>('reply', { data });
  } catch (e) {
    alertError(e);
  }
};

export default {
  postReply,
};
