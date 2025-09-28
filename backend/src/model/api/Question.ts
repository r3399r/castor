export type PostQuestionRequest = {
  content: string;
  isFreeResponse: boolean;
  discussionUrl: string;
  minor: {
    type: 'SINGLE' | 'MULTIPLE';
    orderIndex: number;
    options: string;
    answer: string;
  }[];
};

export type PostQuestionReplyRequest = {
  questionId: number;
  userId?: number;
  deviceId?: string;
  score: number;
  elapsedTimeMs: number;
  repliedAnswer: string;
};
