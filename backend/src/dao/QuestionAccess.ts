import { inject, injectable } from 'inversify';
import { FindOneOptions } from 'typeorm';
import { Question, QuestionEntity } from 'src/model/entity/QuestionEntity';
import { Database } from 'src/utils/Database';

/**
 * Access class for Question model.
 */
@injectable()
export class QuestionAccess {
  @inject(Database)
  private readonly database!: Database;

  public async save(data: Question) {
    const qr = await this.database.getQueryRunner();
    const entity = new QuestionEntity();
    Object.assign(entity, data);

    return await qr.manager.save(entity);
  }

  public async findOneOrFail(options?: FindOneOptions<Question>) {
    const qr = await this.database.getQueryRunner();

    return await qr.manager.findOneOrFail<Question>(QuestionEntity.name, {
      relations: {
        minor: true,
      },
      ...options,
    });
  }

  private async createQueryBuilder() {
    const qr = await this.database.getQueryRunner();

    return qr.manager.createQueryBuilder(QuestionEntity.name, 'question');
  }

  public async findAndCount(data: {
    categoryId: number;
    userId: number;
    take: number;
    skip: number;
  }) {
    const qb = await this.createQueryBuilder();
    const findPromise = qb
      .leftJoinAndSelect(
        'question.category',
        'category',
        'category.id = :categoryId',
        { categoryId: data.categoryId }
      )
      .leftJoinAndSelect('question.reply', 'reply', 'reply.user_id = :userId', {
        userId: data.userId,
      })
      .leftJoinAndSelect('question.tag', 'tag');

    return (await Promise.all([
      findPromise.take(data.take).skip(data.skip).getMany(),
      findPromise.getCount(),
    ])) as [Question[], number];
  }
}
