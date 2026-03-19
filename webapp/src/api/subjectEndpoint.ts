import http from 'src/api/http';
import { alertError } from './errorHandler';
import type { GetSubjectIdExamResponse, GetSubjectResponse } from 'src/model/backend/api/Subject';

const getSubject = async () => {
  try {
    return await http.get<GetSubjectResponse>('subject');
  } catch (e) {
    alertError(e);
  }
};

const getSubjectIdExam = async (id: string) => {
  try {
    return await http.get<GetSubjectIdExamResponse>(`subject/${id}/exam`);
  } catch (e) {
    alertError(e);
  }
};

export default {
  getSubject,
  getSubjectIdExam,
};
