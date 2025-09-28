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
