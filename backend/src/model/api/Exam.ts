import { Exam } from 'src/model/entity/ExamEntity';

export type PostExamResponse = Exam;

export type PostExamRequest = {
  subjectId: number;
  name: string;
};
