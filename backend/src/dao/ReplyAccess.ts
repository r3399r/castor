import { Reply } from '@castor/shared';
import { inject, injectable } from 'inversify';
import { FindManyOptions, FindOneOptions, LessThan } from 'typeorm';
import { ReplyEntity } from 'src/model/entity/ReplyEntity';
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

  public async deleteOlderThan(date: Date) {
    const qr = await this.database.getQueryRunner();

    return await qr.manager.delete(ReplyEntity, {
      createdAt: LessThan(date.toISOString()),
    });
  }

  public async countGroups(userId: number): Promise<number> {
    const qr = await this.database.getQueryRunner();
    const rows = await qr.manager.query<{ cnt: string }[]>(
      `SELECT COUNT(*) AS cnt FROM (
         SELECT 1 FROM reply
         WHERE user_id = ?
         GROUP BY replied_at, COALESCE(parent_id, question_id)
       ) t`,
      [userId]
    );

    return parseInt(rows[0]?.cnt ?? '0', 10);
  }

  public async getGroupKeys(
    userId: number,
    limit: number,
    offset: number
  ): Promise<{ repliedAt: string; groupQuestionKey: number }[]> {
    const qr = await this.database.getQueryRunner();

    return await qr.manager.query<
      { repliedAt: string; groupQuestionKey: number }[]
    >(
      `SELECT replied_at AS repliedAt, COALESCE(parent_id, question_id) AS groupQuestionKey
       FROM reply
       WHERE user_id = ?
       GROUP BY replied_at, COALESCE(parent_id, question_id)
       ORDER BY replied_at DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );
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
      .where('reply.questionId in (:...questionIds)', { questionIds })
      .groupBy('reply.questionId')
      .getRawMany()) as {
      questionId: number;
      count: string;
      scoringRate: number;
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
