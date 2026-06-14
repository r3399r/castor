import { UserStatHistory } from '@castor/shared';
import { inject, injectable } from 'inversify';
import { FindManyOptions, FindOneOptions } from 'typeorm';
import { UserStatHistoryEntity } from 'src/model/entity/UserStatHistoryEntity';
import { Database } from 'src/utils/Database';

@injectable()
export class UserStatHistoryAccess {
  @inject(Database)
  private readonly database!: Database;

  public async find(options?: FindManyOptions<UserStatHistory>) {
    const qr = await this.database.getQueryRunner();

    return await qr.manager.find<UserStatHistory>(UserStatHistoryEntity.name, {
      ...options,
    });
  }

  public async findOne(options?: FindOneOptions<UserStatHistory>) {
    const qr = await this.database.getQueryRunner();

    return await qr.manager.findOne<UserStatHistory>(
      UserStatHistoryEntity.name,
      { ...options }
    );
  }

  public async save(data: UserStatHistory): Promise<UserStatHistory> {
    const qr = await this.database.getQueryRunner();
    const entity = new UserStatHistoryEntity();
    Object.assign(entity, data);

    return await qr.manager.save(entity);
  }
}
