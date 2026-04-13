import http from 'src/api/http';
import { alertError } from './errorHandler';
import type { PostPreviewRequest } from 'src/model/backend/api/Preview';

const postPreview = async (data: PostPreviewRequest) => {
  try {
    return await http.post<string, PostPreviewRequest>('preview', { data });
  } catch (e) {
    alertError(e);
  }
};

export default {
  postPreview,
};
