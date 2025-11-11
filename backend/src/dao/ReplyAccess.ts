import { inject, injectable } from 'inversify';
import { FindManyOptions, FindOneOptions } from 'typeorm';
import { Reply, ReplyEntity } from 'src/model/entity/ReplyEntity';
import { Database } from 'src/utils/Database';

/**
 * Access class for Reply model.
 */
@injectable()
export class ReplyAccess {
  @inject(Database)
  private readonly database!: Database;

  public async save(data: Reply) {
    const qr = await this.database.getQueryRunner();
    const entity = new ReplyEntity();
    Object.assign(entity, data);

    return await qr.manager.save(entity);
  }

  public async saveMany(data: Reply[]) {
    const qr = await this.database.getQueryRunner();
    const entity = new ReplyEntity();
    Object.assign(entity, data);

    return await qr.manager.save(entity);
  }

  public async findAndCount(options?: FindManyOptions<Reply>) {
    const qr = await this.database.getQueryRunner();

    return await qr.manager.findAndCount<Reply>(ReplyEntity.name, {
      ...options,
    });
  }

  public async find(options?: FindManyOptions<Reply>) {
    const qr = await this.database.getQueryRunner();

    return await qr.manager.find<Reply>(ReplyEntity.name, {
      ...options,
    });
  }

  public async findOne(options?: FindOneOptions<Reply>) {
    const qr = await this.database.getQueryRunner();

    return await qr.manager.findOne<Reply>(ReplyEntity.name, {
      ...options,
    });
  }

  private async createQueryBuilder() {
    const qr = await this.database.getQueryRunner();

    return qr.manager.createQueryBuilder(ReplyEntity.name, 'reply');
  }

  public async groupByQuestionId(questionIds: number[]) {
    const qb = await this.createQueryBuilder();

    return (await qb
      .select('reply.questionId', 'questionId')
      .addSelect('COUNT(reply.id)', 'count')
      .addSelect('AVG(reply.score)', 'scoringRate')
      .addSelect('AVG(reply.elapsed_time_ms)', 'avgElapsedTimeMs')
      .where('reply.questionId in (:...questionIds)', { questionIds })
      .groupBy('reply.questionId')
      .getRawMany()) as {
      questionId: number;
      count: string;
      scoringRate: number;
      avgElapsedTimeMs: number;
    }[];
  }

  public async groupByUserId(userIds: number[]) {
    const qb = await this.createQueryBuilder();

    return (await qb
      .select('reply.userId', 'userId')
      .addSelect('category.id', 'categoryId')
      .addSelect('COUNT(reply.id)', 'count')
      .addSelect('AVG(reply.score)', 'scoringRate')
      .leftJoin('reply.question', 'question', 'question.id = reply.questionId')
      .leftJoin(
        'question.category',
        'category',
        'category.id = question.categoryId'
      )
      .where('reply.userId in (:...userIds)', { userIds })
      .groupBy('reply.userId')
      .addGroupBy('category.id')
      .getRawMany()) as {
      userId: number;
      categoryId: number;
      count: string;
      scoringRate: number;
    }[];
  }
}
