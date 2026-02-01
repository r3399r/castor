import { inject, injectable } from 'inversify';
import { FindOneOptions } from 'typeorm';
import { Concept, ConceptEntity } from 'src/model/entity/ConceptEntity';
import { Database } from 'src/utils/Database';

/**
 * Access class for Concept model.
 */
@injectable()
export class ConceptAccess {
  @inject(Database)
  private readonly database!: Database;

  public async findOne(options?: FindOneOptions<Concept>) {
    const qr = await this.database.getQueryRunner();

    return await qr.manager.findOne<Concept>(ConceptEntity.name, {
      relations: {
        conceptGroup: true,
      },
      ...options,
    });
  }
}
