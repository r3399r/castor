import { inject, injectable } from 'inversify';
import {
  QuestionMinor,
  QuestionMinorEntity,
} from 'src/model/entity/QuestionMinorEntity';
import { Database } from 'src/utils/Database';

/**
 * Access class for QuestionMinor model.
 */
@injectable()
export class QuestionMinorAccess {
  @inject(Database)
  private readonly database!: Database;

  public async save(data: QuestionMinor) {
    const qr = await this.database.getQueryRunner();
    const entity = new QuestionMinorEntity();
    Object.assign(entity, data);

    return await qr.manager.save(entity);
  }
}
