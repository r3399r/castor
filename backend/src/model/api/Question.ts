import { Question } from 'src/model/entity/QuestionEntity';
import { Paginate, PaginationParams } from 'src/model/Pagination';

export type PostQuestionRequest = {
  content: string;
  isFreeResponse: boolean;
  discussionUrl: string;
  minor: {
    type: 'SINGLE' | 'MULTIPLE';
    orderIndex: number;
    options: string;
    answer: string;
  }[];
};

export type PostQuestionReplyRequest = {
  questionId: number;
  userId?: number;
  deviceId?: string;
  score: number;
  elapsedTimeMs: number;
  repliedAnswer: string;
};

export type GetQuestionParams = PaginationParams;

export type GetQuestionResponse = Paginate<Question>;
