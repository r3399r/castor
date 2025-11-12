import { inject, injectable } from 'inversify';
import { CategoryAccess } from 'src/dao/CategoryAccess';
import { GetCategoryResponse } from 'src/model/api/Category';

/**
 * Service class for Category
 */
@injectable()
export class CategoryService {
  @inject(CategoryAccess)
  private readonly categoryAccess!: CategoryAccess;

  public async getCategory(): Promise<GetCategoryResponse> {
    return await this.categoryAccess.find();
  }
}
