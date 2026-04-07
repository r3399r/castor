import { Category } from 'src/model/entity/CategoryEntity';
import { User } from 'src/model/entity/UserEntity';

export type GetUserResponse = User | null;

export type StatsConceptGroup = {
  id: number;
  name: string;
  mastery: number;
};

export type StatsSubject = {
  id: number;
  name: string;
  category: Category[];
  conceptGroup: StatsConceptGroup[];
};

export type GetUserStatsResponse = StatsSubject[];

export type PostUserSyncResponse = User;
