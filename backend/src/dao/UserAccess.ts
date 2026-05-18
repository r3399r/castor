import { User } from '@castor/shared';
import { inject, injectable } from 'inversify';
import { FindManyOptions, FindOneOptions } from 'typeorm';
import { UserEntity } from 'src/model/entity/UserEntity';
import { Database } from 'src/utils/Database';

/**
 * Access class for User model.
 */
@injectable()
export class UserAccess {
  @inject(Database)
  private readonly database!: Database;

  public async save(data: User) {
    const qr = await this.database.getQueryRunner();
    const entity = new UserEntity();
    Object.assign(entity, data);

    return await qr.manager.save(entity);
  }

  public async findOne(options?: FindOneOptions<User>) {
    const qr = await this.database.getQueryRunner();

    return await qr.manager.findOne<User>(UserEntity.name, {
      ...options,
    });
  }

  public async count(options?: FindManyOptions<User>) {
    const qr = await this.database.getQueryRunner();

    return await qr.manager.count<User>(UserEntity.name, {
      ...options,
    });
  }
}
