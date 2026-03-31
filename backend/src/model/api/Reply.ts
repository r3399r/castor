export type PostReplyRequest = {
  questionId: number;
  repliedAnswer: string;
}[];

export type PostReplyResponse = {
  questionId: number;
  repliedAnswer: string;
  correctAnswer: string;
  score: number;
}[];
