import { Question } from 'src/model/entity/QuestionEntity';

export type PostReplyResponse = Question;

export type PostReplyRequest = {
  questionId: number;
  repliedAnswer: string;
}[];
