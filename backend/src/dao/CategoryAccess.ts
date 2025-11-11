import { inject, injectable } from 'inversify';
import { FindManyOptions, FindOneOptions } from 'typeorm';
import { Category, CategoryEntity } from 'src/model/entity/CategoryEntity';
import { Database } from 'src/utils/Database';

/**
 * Access class for Category model.
 */
@injectable()
export class CategoryAccess {
  @inject(Database)
  private readonly database!: Database;

  public async findOneOrFail(options?: FindOneOptions<Category>) {
    const qr = await this.database.getQueryRunner();

    return await qr.manager.findOneOrFail<Category>(CategoryEntity.name, {
      ...options,
    });
  }

  public async find(options?: FindManyOptions<Category>) {
    const qr = await this.database.getQueryRunner();

    return await qr.manager.find<Category>(CategoryEntity.name, {
      ...options,
    });
  }
}
