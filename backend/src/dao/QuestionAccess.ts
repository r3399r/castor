import { Question } from '@castor/shared';
import { inject, injectable } from 'inversify';
import { FindManyOptions, FindOneOptions } from 'typeorm';
import { QuestionEntity } from 'src/model/entity/QuestionEntity';
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

  public async find(options?: FindManyOptions<Question>) {
    const qr = await this.database.getQueryRunner();

    return await qr.manager.find<Question>(QuestionEntity.name, {
      ...options,
    });
  }

  public async findOneOrFail(options?: FindOneOptions<Question>) {
    const qr = await this.database.getQueryRunner();

    return await qr.manager.findOneOrFail<Question>(QuestionEntity.name, {
      ...options,
    });
  }

  public async findOneOrFailById(id: number) {
    const qb = await this.createQueryBuilder();
    const question = await qb
      .innerJoinAndSelect('question.subject', 'subject')
      .leftJoinAndSelect('question.exam', 'exam')
      .leftJoinAndSelect('question.tag', 'tag')
      .leftJoinAndSelect('question.concept', 'concept')
      .leftJoinAndSelect('question.children', 'children')
      .andWhere('question.id = :id', { id })
      .andWhere('question.parentId IS NULL')
      .getOneOrFail();

    return question as Question;
  }

  public async findOneOrFailByUuid(uuid: string) {
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

  public async findAndCount(data: {
    subjectId: number;
    take: number;
    skip: number;
    examIds?: number[];
    tagIds?: number[];
    conceptIds?: number[];
  }) {
    const qb = await this.createQueryBuilder();
    const base = qb
      .innerJoinAndSelect('question.subject', 'subject')
      .leftJoinAndSelect('question.exam', 'exam')
      .leftJoinAndSelect('question.tag', 'tag')
      .leftJoinAndSelect('question.concept', 'concept')
      .leftJoinAndSelect('concept.conceptGroup', 'conceptGroup')
      .leftJoinAndSelect('question.children', 'children')
      .andWhere('question.parentId IS NULL')
      .andWhere('question.subjectId = :subjectId', {
        subjectId: data.subjectId,
      });

    if (data.examIds !== undefined && data.examIds.length > 0) {
      const examIds = data.examIds;

      const subQuery = qb
        .subQuery()
        .select('qeFilter.question_id')
        .from('question_exam', 'qeFilter')
        .where('qeFilter.exam_id IN (:...examIds)', { examIds })
        .getQuery();

      base.andWhere(`question.id IN ${subQuery}`, { examIds });
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

  private async getBaseAdaptiveQuery(
    data: {
      mastery: number;
      subjectId: number;
      take: number;
      examIds?: number[];
      tagIds?: number[];
      conceptId: number;
    },
    direction: 'less' | 'greater'
  ) {
    const qb = await this.createQueryBuilder();
    const base = qb
      .innerJoinAndSelect('question.subject', 'subject')
      .leftJoinAndSelect('question.exam', 'exam')
      .leftJoinAndSelect('question.tag', 'tag')
      .leftJoinAndSelect('question.concept', 'concept')
      .leftJoinAndSelect('concept.conceptGroup', 'conceptGroup')
      .leftJoinAndSelect('question.children', 'children')
      .andWhere('question.parentId IS NULL')
      .andWhere('question.subjectId = :subjectId', {
        subjectId: data.subjectId,
      });

    if (direction === 'less')
      base
        .andWhere('question.adjustedDifficulty <= :mastery', {
          mastery: data.mastery,
        })
        .orderBy('question.adjustedDifficulty', 'DESC');
    else
      base
        .andWhere('question.adjustedDifficulty > :mastery', {
          mastery: data.mastery,
        })
        .orderBy('question.adjustedDifficulty', 'ASC');

    if (data.examIds !== undefined && data.examIds.length > 0) {
      const examIds = data.examIds;

      const subQuery = qb
        .subQuery()
        .select('qeFilter.question_id')
        .from('question_exam', 'qeFilter')
        .where('qeFilter.exam_id IN (:...examIds)', { examIds })
        .getQuery();

      base.andWhere(`question.id IN ${subQuery}`, { examIds });
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

    const subQueryConcept = qb
      .subQuery()
      .select('qcFilter.question_id')
      .from('question_concept', 'qcFilter')
      .where('qcFilter.concept_id = :conceptId', { conceptId: data.conceptId })
      .getQuery();

    base.andWhere(`question.id IN ${subQueryConcept}`);

    return base.clone().take(data.take).getMany();
  }

  public async findAdaptive(data: {
    mastery: number;
    subjectId: number;
    take: number;
    examIds?: number[];
    tagIds?: number[];
    conceptId: number;
  }) {
    const [less, greater] = await Promise.all([
      this.getBaseAdaptiveQuery(data, 'less'),
      this.getBaseAdaptiveQuery(data, 'greater'),
    ]);

    return [...less, ...greater] as Question[];
  }
}
