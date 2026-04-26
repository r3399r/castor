import { inject, injectable } from 'inversify';
import { FindManyOptions } from 'typeorm';
import { Category, CategoryEntity } from 'src/model/entity/CategoryEntity';
import { Database } from 'src/utils/Database';

/**
 * Access class for Category model.
 */
@injectable()
export class CategoryAccess {
  @inject(Database)
  private readonly database!: Database;

  public async find(options?: FindManyOptions<Category>) {
    const qr = await this.database.getQueryRunner();

    return await qr.manager.find<Category>(CategoryEntity.name, {
      ...options,
    });
  }

  public async save(data: Category): Promise<Category> {
    const qr = await this.database.getQueryRunner();
    const entity = new CategoryEntity();
    Object.assign(entity, data);

    return await qr.manager.save(entity);
  }
}
