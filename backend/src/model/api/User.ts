import { Tag } from 'src/model/entity/TagEntity';
import { User } from 'src/model/entity/UserEntity';
import { Paginate, PaginationParams } from 'src/model/Pagination';

export type GetUserResponse = User | null;

export type GetUserDetailParams = PaginationParams & { categoryId: number };

export type GetUserDetailResponse = {
  user: User | null;
  category: { id: number; name: string; isCurrent: boolean }[];
  count: number | null;
  scoringRate: number | null;
  reply: Paginate<{
    id: number;
    questionUid: string;
    questionTitle: string;
    questionSource: string | null;
    tag: Tag[];
    score: number;
    repliedAnswer: string | null;
    complete: boolean;
    recordedAt: string | null;
  }>;
};

export type PostUserSyncResponse = User;
