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

  public async findTag(categoryId: number) {
    const qb = await this.createQueryBuilder();
    const raws = await qb
      .select('tag.id', 'id')
      .addSelect('tag.name', 'name')
      .innerJoin('question.category', 'category', 'category.id = :categoryId', {
        categoryId,
      })
      .innerJoin('question_tag', 'qt', 'qt.question_id = question.id')
      .innerJoin('tag', 'tag', 'tag.id = qt.tag_id')
      .where('tag.id IS NOT NULL')
      .groupBy('tag.id')
      .addGroupBy('tag.name')
      .orderBy('tag.name', 'ASC')
      .getRawMany();

    return raws.map((r: any) => ({ id: Number(r.id), name: String(r.name) }));
  }

  public async findDetail(data: { id: number; userId: number }) {
    const qb = await this.createQueryBuilder();

    return (await qb
      .leftJoinAndSelect('question.minor', 'minor')
      .leftJoinAndSelect('question.reply', 'reply', 'reply.user_id = :userId', {
        userId: data.userId,
      })
      .leftJoinAndSelect('question.tag', 'tag')
      .leftJoinAndSelect('question.category', 'category')
      .where('question.id = :id', { id: data.id })
      .getOneOrFail()) as Question;
  }

  public async findAndCount(data: {
    categoryId: number;
    userId: number;
    take: number;
    skip: number;
    orderBy: string;
    orderDirection: 'ASC' | 'DESC';
    title?: string;
    hasReply?: boolean;
    tags?: number[];
    source?: string;
  }) {
    const qb = await this.createQueryBuilder();
    const base = qb
      .innerJoinAndSelect(
        'question.category',
        'category',
        'category.id = :categoryId',
        { categoryId: data.categoryId }
      )
      .leftJoinAndSelect('question.reply', 'reply', 'reply.user_id = :userId', {
        userId: data.userId,
      })
      .leftJoinAndSelect('question.tag', 'tag');

    if (data.title)
      base.andWhere('question.title like :title', {
        title: `%${data.title}%`,
      });
    if (data.source)
      base.andWhere('question.source like :source', {
        source: `%${data.source}%`,
      });
    if (data.hasReply === true) base.andWhere('reply.id IS NOT NULL');

    if (data.hasReply === false) base.andWhere('reply.id IS NULL');

    if (data.tags !== undefined && data.tags.length > 0) {
      const tagIds = data.tags;
      const tagCount = tagIds.length;

      const subQuery = qb
        .subQuery()
        .select('qtFilter.question_id')
        .from('question_tag', 'qtFilter')
        .where('qtFilter.tag_id IN (:...tagIds)', { tagIds })
        .groupBy('qtFilter.question_id')
        .having('COUNT(DISTINCT qtFilter.tag_id) = :tagCount')
        .getQuery();

      base.andWhere(`question.id IN ${subQuery}`, { tagIds, tagCount });
    }

    return (await Promise.all([
      base
        .clone()
        .orderBy(`question.${data.orderBy}`, data.orderDirection)
        .skip(data.skip)
        .take(data.take)
        .getMany(),
      base.getCount(),
    ])) as [Question[], number];
  }
}
