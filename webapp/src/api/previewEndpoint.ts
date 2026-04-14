import http from 'src/api/http';
import { alertError } from './errorHandler';
import type { PostPreviewRequest, PostPreviewResponse } from 'src/model/backend/api/Preview';

const postPreview = async (data: PostPreviewRequest) => {
  try {
    return await http.post<PostPreviewResponse, PostPreviewRequest>('preview', { data });
  } catch (e) {
    alertError(e);
  }
};

export default {
  postPreview,
};
