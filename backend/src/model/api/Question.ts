import { Category } from 'src/model/entity/CategoryEntity';
import { QuestionMinor } from 'src/model/entity/QuestionMinorEntity';
import { Reply } from 'src/model/entity/ReplyEntity';
import { Tag } from 'src/model/entity/TagEntity';
import { Paginate, PaginationParams } from 'src/model/Pagination';

export type PostQuestionRequest = {
  category: string;
  title: string;
  content: string;
  imageUrl: string;
  source: string;
  tag: string[];
  minor: {
    type: 'SINGLE' | 'MULTIPLE' | 'FILL';
    orderIndex: number;
    content?: string;
    options: string;
    answer: string;
  }[];
};

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
  elapsedTimeMs: number;
  replied: { id: number; answer: string }[];
};

export type ModifiedReply = Reply & {
  actualAnswer: string | null;
  fbPostId: string | null;
};

export type PostQuestionCompleteResponse = ModifiedReply;

export type GetQuestionParams = PaginationParams & {
  categoryId: number;
  orderBy?: string;
  orderDirection?: string;
  title?: string;
  hasReply?: 'true' | 'false';
  tags?: string;
};

export type GetQuestionTagParams = { categoryId: number };

export type GetQuestionTagResponse = { id: number; name: string }[];

export type ModifiedQuestion = {
  uid: string;
  title: string;
  categoryId: number;
  category: Category;
  source: string | null;
  tag: Tag[];
  count: number;
  scoringRate: number | null;
  avgElapsedTimeMs: number | null;
  lastReply: Reply | null;
};

export type GetQuestionResponse = Paginate<ModifiedQuestion>;

export type GetQuestionIdResponse = {
  uid: string;
  title: string;
  category: Category;
  content: string;
  source: string | null;
  minor: (QuestionMinor & { length: number | null })[];
  tag: Tag[];
  count: number;
  scoringRate: number | null;
  avgElapsedTimeMs: number | null;
  lastReply: ModifiedReply | null;
};
