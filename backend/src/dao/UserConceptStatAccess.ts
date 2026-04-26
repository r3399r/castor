import { inject, injectable } from 'inversify';
import { FindManyOptions, FindOneOptions } from 'typeorm';
import {
  UserConceptStat,
  UserConceptStatEntity,
} from 'src/model/entity/UserConceptStatEntity';
import { Database } from 'src/utils/Database';

/**
 * Access class for UserConceptStat model.
 */
@injectable()
export class UserConceptStatAccess {
  @inject(Database)
  private readonly database!: Database;

  public async find(options?: FindManyOptions<UserConceptStat>) {
    const qr = await this.database.getQueryRunner();

    return await qr.manager.find<UserConceptStat>(UserConceptStatEntity.name, {
      ...options,
    });
  }

  public async findOne(options?: FindOneOptions<UserConceptStat>) {
    const qr = await this.database.getQueryRunner();

    return await qr.manager.findOne<UserConceptStat>(
      UserConceptStatEntity.name,
      {
        ...options,
      }
    );
  }

  public async save(data: UserConceptStat): Promise<UserConceptStat> {
    const qr = await this.database.getQueryRunner();
    const entity = new UserConceptStatEntity();
    Object.assign(entity, data);

    return await qr.manager.save(entity);
  }
}
