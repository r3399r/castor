import { inject, injectable } from 'inversify';
import {
  ConceptGroup,
  ConceptGroupEntity,
} from 'src/model/entity/ConceptGroupEntity';
import { Database } from 'src/utils/Database';

/**
 * Access class for ConceptGroup model.
 */
@injectable()
export class ConceptGroupAccess {
  @inject(Database)
  private readonly database!: Database;

  public async save(data: ConceptGroup): Promise<ConceptGroup> {
    const qr = await this.database.getQueryRunner();
    const entity = new ConceptGroupEntity();
    Object.assign(entity, data);

    return await qr.manager.save(entity);
  }
}
