export type PostPreviewRequest = {
  text: string;
  imageUrl: string;
};

export type PostPreviewResponse = {
  content: string;
  solution: string;
  difficulty: number;
  conceptIds: number[];
};
