import { inject, injectable } from 'inversify';
import { FindManyOptions } from 'typeorm';
import { Reply, ReplyEntity } from 'src/model/entity/ReplyEntity';
import { Database } from 'src/utils/Database';

/**
 * Access class for Reply model.
 */
@injectable()
export class ReplyAccess {
  @inject(Database)
  private readonly database!: Database;

  public async save(data: Reply) {
    const qr = await this.database.getQueryRunner();
    const entity = new ReplyEntity();
    Object.assign(entity, data);

    return await qr.manager.save(entity);
  }

  public async findAndCount(options?: FindManyOptions<Reply>) {
    const qr = await this.database.getQueryRunner();

    return await qr.manager.findAndCount<Reply>(ReplyEntity.name, {
      ...options,
    });
  }
}
