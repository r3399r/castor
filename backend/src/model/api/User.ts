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
  conceptGroups: StatsConceptGroup[];
};

export type StatsCategory = {
  id: number;
  name: string;
  subjects: StatsSubject[];
};

export type GetUserStatsResponse = StatsCategory[];

export type PostUserSyncResponse = User;
