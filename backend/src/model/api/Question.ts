import { Question } from 'src/model/entity/QuestionEntity';
import { Reply } from 'src/model/entity/ReplyEntity';
import { Paginate, PaginationParams } from 'src/model/Pagination';

export type PostQuestionRequest = {
  subjectId: number;
  type: 'GROUP' | 'SINGLE' | 'MULTIPLE' | 'TRUE_FALSE' | 'FILL';
  imageUrl: string;
  content?: string;
  options?: string;
  answer?: string;
  difficulty: number;
  examId: number;
  tagIds?: number[];
  conceptIds: number[];
  childQuestions?: {
    type: 'SINGLE' | 'MULTIPLE' | 'TRUE_FALSE' | 'FILL';
    sortOrder: number;
    content: string;
    options: string;
    answer: string;
    difficulty: number;
  }[];
};

export type PostQuestionResponse = Question[];

export type PostQuestionStartRequest = {
  id: number;
};

export type PostQuestionStartResponse = Pick<
  Reply,
  'id' | 'questionId' | 'userId'
>;

export type PostQuestionCompleteRequest = {
  id: number;
  replyId: number;
  replied: { id: number; answer: string }[];
};

export type ModifiedReply = Reply & {
  actualAnswer: string | null;
  fbPostId: string | null;
};

export type PostQuestionCompleteResponse = ModifiedReply;

export type GetQuestionParams = PaginationParams & {
  subjectId: string;
  examIds?: string;
  tagIds?: string;
  conceptIds?: string;
};

export type GetQuestionTagParams = { categoryId: number };

export type GetQuestionTagResponse = { id: number; name: string }[];

export type GetQuestionAdaptiveParams = {
  subjectId: string;
  examIds?: string;
  tagIds?: string;
  conceptIds?: string;
};

export type GetQuestionAdaptiveResponse = Question;

export type GetQuestionResponse = Paginate<Question>;

export type GetQuestionIdResponse = Question;
