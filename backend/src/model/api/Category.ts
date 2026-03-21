import { Category } from 'src/model/entity/CategoryEntity';
import { Subject } from 'src/model/entity/SubjectEntity';

export type GetCategoryResponse = Category[];

export type GetCateogoryIdSubjectResponse = Subject[];

export type PostCategoryRequest = {
  name: string;
};

export type PostCategoryResponse = Category;
