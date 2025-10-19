import { QuestionMinor } from 'src/model/entity/QuestionMinorEntity';
import { Reply } from 'src/model/entity/ReplyEntity';
import { Tag } from 'src/model/entity/TagEntity';
import { Paginate, PaginationParams } from 'src/model/Pagination';

export type PostQuestionRequest = {
  categoryName: string;
  content: string;
  discussionUrl: string;
  minor: {
    type: 'SINGLE' | 'MULTIPLE';
    orderIndex: number;
    content?: string;
    options: string;
    answer: string;
  }[];
};

export type PostQuestionReplyRequest = {
  id: number;
  userId?: number;
  deviceId?: string;
  elapsedTimeMs: number;
  replied: { id: number; answer: string }[];
};

export type PostQuestionReplyResponse = Reply;

export type GetQuestionParams = PaginationParams & { categoryId: number };

export type ModifiedQuestion = {
  uid: string;
  categoryId: number;
  source: string | null;
  tag: Tag[];
  count: number;
  scoringRate: number | null;
  avgElapsedTimeMs: number | null;
  hasReplied: boolean;
  lastRepliedAt: string | null;
};

export type GetQuestionResponse = Paginate<ModifiedQuestion>;

export type GetQuestionIdResponse = {
  uid: string;
  categoryId: number;
  content: string;
  discussionUrl: string | null;
  source: string | null;
  minor: Omit<QuestionMinor, 'answer'>[];
  tag: Tag[];
  count: number;
  scoringRate: number | null;
  avgElapsedTimeMs: number | null;
  hasReplied: boolean;
  lastRepliedAt: string | null;
};
