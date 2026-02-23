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

  public async save(data: Concept): Promise<Concept> {
    const qr = await this.database.getQueryRunner();
    const entity = new ConceptEntity();
    Object.assign(entity, data);

    return await qr.manager.save(entity);
  }
}
