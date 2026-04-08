import { Reply } from 'src/model/entity/ReplyEntity';
import { Paginate, PaginationParams } from 'src/model/Pagination';

export type PostReplyRequest = {
  questionId: number;
  repliedAnswer: string;
}[];

export type PostReplyResponse = {
  questionId: number;
  repliedAnswer: string;
  correctAnswer: string;
  score: number;
  fbPostId: string | null;
}[];

export type GetReplyParams = PaginationParams;

export type GetReplyResponse = Paginate<Reply>;
