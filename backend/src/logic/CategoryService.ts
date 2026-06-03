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
    const subjects = await this.subjectAccess.find({
      where: {
        category: { id: Number(id) },
      },
      order: { sortOrder: 'ASC' },
      relations: {
        filterOptions: {
          dimension: true,
        },
      },
    });

    const dimensionMap = new Map<
      number,
      GetCategorySubjectResponse['filterDimensions'][0]
    >();

    for (const subject of subjects)
      for (const option of subject.filterOptions) {
        const { dimension } = option;
        if (!dimensionMap.has(dimension.id))
          dimensionMap.set(dimension.id, { ...dimension, options: [] });

        const dim = dimensionMap.get(dimension.id)!;
        let opt = dim.options.find((o) => o.id === option.id);
        if (!opt) {
          opt = {
            id: option.id,
            parentId: option.parentId,
            name: option.name,
            subjectIds: [],
          };
          dim.options.push(opt);
        }
        opt.subjectIds.push(subject.id);
      }

    return {
      subjects: subjects.map(({ id, name, sortOrder, createdAt }) => ({
        id,
        name,
        sortOrder,
        createdAt,
      })),
      filterDimensions: Array.from(dimensionMap.values()),
    };
  }

  public async createCategory(
    category: PostCategoryRequest
  ): Promise<PostCategoryResponse> {
    const categoryEntity = new CategoryEntity();
    categoryEntity.name = category.name;

    return await this.categoryAccess.save(categoryEntity);
  }
}
