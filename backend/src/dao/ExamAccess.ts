import { Exam } from '@castor/shared';
import { inject, injectable } from 'inversify';
import { FindManyOptions, FindOneOptions } from 'typeorm';
import { ExamEntity } from 'src/model/entity/ExamEntity';
import { Database } from 'src/utils/Database';

/**
 * Access class for Exam model.
 */
@injectable()
export class ExamAccess {
  @inject(Database)
  private readonly database!: Database;

  public async find(options?: FindManyOptions<Exam>) {
    const qr = await this.database.getQueryRunner();

    return await qr.manager.find<Exam>(ExamEntity.name, {
      ...options,
    });
  }

  public async findOneOrFail(options?: FindOneOptions<Exam>) {
    const qr = await this.database.getQueryRunner();

    return await qr.manager.findOneOrFail<Exam>(ExamEntity.name, {
      ...options,
    });
  }

  public async save(data: Exam): Promise<Exam> {
    const qr = await this.database.getQueryRunner();
    const entity = new ExamEntity();
    Object.assign(entity, data);

    return await qr.manager.save(entity);
  }
}
