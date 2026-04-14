import { Exam } from 'src/model/entity/ExamEntity';

export type PostExamResponse = Exam;

export type PostExamRequest = {
  name: string;
};
