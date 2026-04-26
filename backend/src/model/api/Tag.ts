import { Tag } from 'src/model/entity/TagEntity';

export type PostTagResponse = Tag;

export type PostTagRequest = {
  subjectId: number;
  name: string;
};
