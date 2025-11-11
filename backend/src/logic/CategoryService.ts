import { inject, injectable } from 'inversify';
import { CategoryAccess } from 'src/dao/CategoryAccess';
import { UserStatsAccess } from 'src/dao/UserStatsAccess';
import { GetCategoryResponse } from 'src/model/api/Category';
import { NotFoundError } from 'src/model/error';
import { UserService } from './UserService';

/**
 * Service class for Category
 */
@injectable()
export class CategoryService {
  @inject(CategoryAccess)
  private readonly categoryAccess!: CategoryAccess;
  @inject(UserStatsAccess)
  private readonly userStatsAccess!: UserStatsAccess;
  @inject(UserService)
  private readonly userService!: UserService;

  public async getCategory(): Promise<GetCategoryResponse> {
    return await this.categoryAccess.find();
  }

  public async getCategoryOfUser(): Promise<GetCategoryResponse> {
    const user = await this.userService.getUser();
    if (user === null) throw new NotFoundError('User not found');

    const us = await this.userStatsAccess.find({
      where: { userId: user.id },
      relations: { category: true },
    });

    return us.map((v) => v.category);
  }
}
