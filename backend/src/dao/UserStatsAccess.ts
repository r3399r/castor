import { inject, injectable } from 'inversify';
import { FindManyOptions, FindOneOptions } from 'typeorm';
import { UserStats, UserStatsEntity } from 'src/model/entity/UserStatsEntity';
import { Database } from 'src/utils/Database';

/**
 * Access class for UserStats model.
 */
@injectable()
export class UserStatsAccess {
  @inject(Database)
  private readonly database!: Database;

  public async save(data: UserStats) {
    const qr = await this.database.getQueryRunner();
    const entity = new UserStatsEntity();
    Object.assign(entity, data);

    return await qr.manager.save(entity);
  }

  public async findOne(options?: FindOneOptions<UserStats>) {
    const qr = await this.database.getQueryRunner();

    return await qr.manager.findOne<UserStats>(UserStatsEntity.name, {
      ...options,
    });
  }

  public async find(options?: FindManyOptions<UserStats>) {
    const qr = await this.database.getQueryRunner();

    return await qr.manager.find<UserStats>(UserStatsEntity.name, {
      ...options,
    });
  }
}
