import { inject, injectable } from 'inversify';
import { FindManyOptions } from 'typeorm';
import { Subject, SubjectEntity } from 'src/model/entity/SubjectEntity';
import { Database } from 'src/utils/Database';

/**
 * Access class for Subject model.
 */
@injectable()
export class SubjectAccess {
  @inject(Database)
  private readonly database!: Database;

  public async find(options?: FindManyOptions<Subject>) {
    const qr = await this.database.getQueryRunner();

    return await qr.manager.find<Subject>(SubjectEntity.name, {
      ...options,
    });
  }

  public async save(data: Subject): Promise<Subject> {
    const qr = await this.database.getQueryRunner();
    const entity = new SubjectEntity();
    Object.assign(entity, data);

    return await qr.manager.save(entity);
  }
}
