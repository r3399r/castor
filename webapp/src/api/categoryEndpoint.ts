import http from 'src/api/http';
import type {
  GetCategoryResponse,
  GetCateogoryIdSubjectResponse,
} from 'src/model/backend/api/Category';
import { alertError } from './errorHandler';

const getCategory = async () => {
  try {
    return await http.get<GetCategoryResponse>('category');
  } catch (e) {
    alertError(e);
  }
};

const getCategoryIdSubject = async (id: number) => {
  try {
    return await http.get<GetCateogoryIdSubjectResponse>(`category/${id}/subject`);
  } catch (e) {
    alertError(e);
  }
};

export default {
  getCategory,
  getCategoryIdSubject,
};
