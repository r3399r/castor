import { inject, injectable } from 'inversify';
import { FindManyOptions } from 'typeorm';
import {
  PendingReply,
  PendingReplyEntity,
} from 'src/model/entity/PendingReplyEntity';
import { Database } from 'src/utils/Database';

/**
 * Access class for PendingReply model.
 */
@injectable()
export class PendingReplyAccess {
  @inject(Database)
  private readonly database!: Database;

  public async save(data: PendingReply) {
    const qr = await this.database.getQueryRunner();
    const entity = new PendingReplyEntity();
    Object.assign(entity, data);

    return await qr.manager.save(entity);
  }

  public async find(options?: FindManyOptions<PendingReply>) {
    const qr = await this.database.getQueryRunner();

    return await qr.manager.find<PendingReply>(PendingReplyEntity.name, {
      ...options,
    });
  }

  public async delete(id: number) {
    const qr = await this.database.getQueryRunner();

    return await qr.manager.delete(PendingReplyEntity, { id });
  }
}
