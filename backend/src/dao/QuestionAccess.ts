import { inject, injectable } from 'inversify';
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

  public async findOneOrFail(uuid: string) {
    const qb = await this.createQueryBuilder();
    const question = await qb
      .innerJoinAndSelect('question.subject', 'subject')
      .leftJoinAndSelect('question.exam', 'exam')
      .leftJoinAndSelect('question.tag', 'tag')
      .leftJoinAndSelect('question.concept', 'concept')
      .leftJoinAndSelect('question.children', 'children')
      .andWhere('question.uuid = :uuid', { uuid })
      .andWhere('question.parentId IS NULL')
      .getOneOrFail();

    return question as Question;
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
    subjectId: number;
    take: number;
    skip: number;
    examId?: number;
    tagIds?: number[];
    conceptIds?: number[];
  }) {
    const qb = await this.createQueryBuilder();
    const base = qb
      .innerJoinAndSelect(
        'question.subject',
        'subject',
        'subject.id = :subjectId',
        { subjectId: data.subjectId }
      )
      .leftJoinAndSelect('question.exam', 'exam')
      .leftJoinAndSelect('question.tag', 'tag')
      .leftJoinAndSelect('question.concept', 'concept')
      .leftJoinAndSelect('question.children', 'children')
      .andWhere('question.parentId IS NULL');

    if (data.examId !== undefined) {
      const examId = data.examId;

      const subQuery = qb
        .subQuery()
        .select('qeFilter.question_id')
        .from('question_exam', 'qeFilter')
        .where('qeFilter.exam_id = :examId', { examId })
        .getQuery();

      base.andWhere(`question.id IN ${subQuery}`, { examId });
    }

    if (data.tagIds !== undefined && data.tagIds.length > 0) {
      const tagIds = data.tagIds;
      const tagCount = tagIds.length;

      const subQuery = qb
        .subQuery()
        .select('qtFilter.question_id')
        .from('question_tag', 'qtFilter')
        .where('qtFilter.tag_id IN (:...tagIds)', { tagIds })
        // .groupBy('qtFilter.question_id') // groupBy and having are for INTERSECTION, but we want UNION, so we don't use them
        // .having('COUNT(DISTINCT qtFilter.tag_id) = :tagCount')
        .getQuery();

      base.andWhere(`question.id IN ${subQuery}`, { tagIds, tagCount });
    }

    if (data.conceptIds !== undefined && data.conceptIds.length > 0) {
      const conceptIds = data.conceptIds;
      const conceptCount = conceptIds.length;

      const subQuery = qb
        .subQuery()
        .select('qcFilter.question_id')
        .from('question_concept', 'qcFilter')
        .where('qcFilter.concept_id IN (:...conceptIds)', { conceptIds })
        // .groupBy('qcFilter.question_id') // groupBy and having are for INTERSECTION, but we want UNION, so we don't use them
        // .having('COUNT(DISTINCT qcFilter.concept_id) = :conceptCount')
        .getQuery();

      base.andWhere(`question.id IN ${subQuery}`, {
        conceptIds,
        conceptCount,
      });
    }

    return (await Promise.all([
      base
        .clone()
        // .orderBy(`question.${data.orderBy}`, data.orderDirection)
        .skip(data.skip)
        .take(data.take)
        .getMany(),
      base.getCount(),
    ])) as [Question[], number];
  }
}
