import { UserConceptStat } from '@castor/shared';
import { inject, injectable } from 'inversify';
import { FindManyOptions, FindOneOptions } from 'typeorm';
import { UserConceptStatEntity } from 'src/model/entity/UserConceptStatEntity';
import { Database } from 'src/utils/Database';

type ConceptMasteryWithWeight = {
  mastery: number | null;
  numberOfQuestions: number;
};

/**
 * Access class for UserConceptStat model.
 */
@injectable()
export class UserConceptStatAccess {
  @inject(Database)
  private readonly database!: Database;

  public async find(options?: FindManyOptions<UserConceptStat>) {
    const qr = await this.database.getQueryRunner();

    return await qr.manager.find<UserConceptStat>(UserConceptStatEntity.name, {
      ...options,
    });
  }

  public async findOne(options?: FindOneOptions<UserConceptStat>) {
    const qr = await this.database.getQueryRunner();

    return await qr.manager.findOne<UserConceptStat>(
      UserConceptStatEntity.name,
      {
        ...options,
      }
    );
  }

  public async findByUserAndSubject(
    userId: number,
    subjectId: number
  ): Promise<ConceptMasteryWithWeight[]> {
    const qr = await this.database.getQueryRunner();

    return await qr.manager
      .createQueryBuilder(UserConceptStatEntity, 'ucs')
      .select('ucs.mastery', 'mastery')
      .addSelect('c.number_of_questions', 'numberOfQuestions')
      .innerJoin('concept', 'c', 'c.id = ucs.concept_id')
      .innerJoin('concept_group', 'cg', 'cg.id = c.concept_group_id')
      .where('ucs.user_id = :userId', { userId })
      .andWhere('cg.subject_id = :subjectId', { subjectId })
      .getRawMany<ConceptMasteryWithWeight>();
  }

  public async save(data: UserConceptStat): Promise<UserConceptStat> {
    const qr = await this.database.getQueryRunner();
    const entity = new UserConceptStatEntity();
    Object.assign(entity, data);

    return await qr.manager.save(entity);
  }
}
