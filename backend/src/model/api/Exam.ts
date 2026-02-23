import { Exam } from 'src/model/entity/ExamEntity';

export type GetExamResponse = Exam[];

export type PostExamResponse = Exam;

export type PostExamRequest = {
  subjectId: number;
  name: string;
};
