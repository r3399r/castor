import { Exam } from 'src/model/entity/ExamEntity';
import { Subject } from 'src/model/entity/SubjectEntity';

export type GetSubjectResponse = Subject[];

export type PostSubjectResponse = Subject;

export type PostSubjectRequest = {
  categoryId: number;
  name: string;
};

export type GetSubjectIdExamResponse = Exam[];
