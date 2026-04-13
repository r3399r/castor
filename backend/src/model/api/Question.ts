import { Question } from 'src/model/entity/QuestionEntity';
import { Paginate, PaginationParams } from 'src/model/Pagination';

export type PostQuestionRequest = {
  subjectId: number;
  type: 'GROUP' | 'SINGLE' | 'MULTIPLE' | 'TRUE_FALSE' | 'FILL';
  imageUrl: string;
  content?: string;
  options?: string;
  answer?: string;
  solution?: string;
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

export type GetQuestionParams = PaginationParams & {
  subjectId: string;
  examIds?: string;
  tagIds?: string;
  conceptIds?: string;
};

export type GetQuestionAdaptiveParams = {
  subjectId: string;
  examIds?: string;
  tagIds?: string;
  conceptIds?: string;
};

export type GetQuestionAdaptiveResponse = Question;

export type GetQuestionResponse = Paginate<Question>;

export type GetQuestionIdResponse = Question;
