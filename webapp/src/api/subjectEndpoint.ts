import http from 'src/api/http';
import { alertError } from './errorHandler';
import type {
  GetSubjectIdConceptGroupResponse,
  GetSubjectIdTagResponse,
  GetSubjectIdExamResponse,
  GetSubjectResponse,
} from 'src/model/backend/api/Subject';

const getSubject = async () => {
  try {
    return await http.get<GetSubjectResponse>('subject');
  } catch (e) {
    alertError(e);
  }
};

const getSubjectIdExam = async (id: number) => {
  try {
    return await http.get<GetSubjectIdExamResponse>(`subject/${id}/exam`);
  } catch (e) {
    alertError(e);
  }
};

const getSubjectIdConceptGroup = async (id: number) => {
  try {
    return await http.get<GetSubjectIdConceptGroupResponse>(`subject/${id}/concept-group`);
  } catch (e) {
    alertError(e);
  }
};

const getSubjectIdTag = async (id: number) => {
  try {
    return await http.get<GetSubjectIdTagResponse>(`subject/${id}/tag`);
  } catch (e) {
    alertError(e);
  }
};

export default {
  getSubject,
  getSubjectIdExam,
  getSubjectIdConceptGroup,
  getSubjectIdTag,
};
