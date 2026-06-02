import {
  GetCategoryResponse,
  GetCategorySubjectResponse,
  PostCategoryRequest,
  PostCategoryResponse,
} from '@castor/shared';
import { inject, injectable } from 'inversify';
import { CategoryAccess } from 'src/dao/CategoryAccess';
import { SubjectAccess } from 'src/dao/SubjectAccess';
import { CategoryEntity } from 'src/model/entity/CategoryEntity';

/**
 * Service class for Category
 */
@injectable()
export class CategoryService {
  @inject(CategoryAccess)
  private readonly categoryAccess!: CategoryAccess;
  @inject(SubjectAccess)
  private readonly subjectAccess!: SubjectAccess;

  public async getCategory(): Promise<GetCategoryResponse> {
    return await this.categoryAccess.find();
  }

  public async getSubjectsByCategoryId(
    id: string
  ): Promise<GetCategorySubjectResponse> {
    return await this.subjectAccess.find({
      where: {
        category: { id: Number(id) },
      },
      relations: {
        category: true,
        filterOptions: {
          dimension: true,
        },
      },
    });
  }

  public async createCategory(
    category: PostCategoryRequest
  ): Promise<PostCategoryResponse> {
    const categoryEntity = new CategoryEntity();
    categoryEntity.name = category.name;

    return await this.categoryAccess.save(categoryEntity);
  }
}
