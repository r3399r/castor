import { inject, injectable } from 'inversify';
import { FindOneOptions } from 'typeorm';
import { User, UserEntity } from 'src/model/entity/UserEntity';
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
}
