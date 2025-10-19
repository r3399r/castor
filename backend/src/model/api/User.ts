import { Tag } from 'src/model/entity/TagEntity';
import { Paginate, PaginationParams } from 'src/model/Pagination';

export type GetUserDetailParams = PaginationParams & { categoryId: number };

export type GetUserDetailResponse = {
  userId: number;
  categoryId: number;
  count: number | null;
  scoringRate: number | null;
  reply: Paginate<{
    id: number;
    questionId: number;
    tag: Tag[];
    score: number;
    elapsedTimeMs: number;
    repliedAnswer: string;
    createdAt: string | null;
  }>;
};
