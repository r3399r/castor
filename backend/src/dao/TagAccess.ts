import { inject, injectable } from 'inversify';
import { FindOneOptions } from 'typeorm';
import { Tag, TagEntity } from 'src/model/entity/TagEntity';
import { Database } from 'src/utils/Database';

/**
 * Access class for Tag model.
 */
@injectable()
export class TagAccess {
  @inject(Database)
  private readonly database!: Database;

  public async findOne(options?: FindOneOptions<Tag>) {
    const qr = await this.database.getQueryRunner();

    return await qr.manager.findOne<Tag>(TagEntity.name, {
      ...options,
    });
  }

  public async save(data: Tag) {
    const qr = await this.database.getQueryRunner();
    const entity = new TagEntity();
    Object.assign(entity, data);

    return await qr.manager.save(entity);
  }
}
