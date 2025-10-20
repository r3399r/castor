import { Tag } from 'src/model/entity/TagEntity';
import { User } from 'src/model/entity/UserEntity';
import { Paginate, PaginationParams } from 'src/model/Pagination';

export type GetUserResponse = User | null;

export type GetUserDetailParams = PaginationParams & { categoryId: number };

export type GetUserDetailResponse = {
  userId: number;
  categoryId: number;
  count: number | null;
  scoringRate: number | null;
  reply: Paginate<{
    id: number;
    questionUid: string;
    tag: Tag[];
    score: number;
    elapsedTimeMs: number;
    repliedAnswer: string;
    createdAt: string | null;
  }>;
};
