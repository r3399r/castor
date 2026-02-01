import axios from 'axios';
import { inject, injectable } from 'inversify';
import { v4 as uuidv4 } from 'uuid';
import { LIMIT, OFFSET } from 'src/constant/Pagination';
import { CategoryAccess } from 'src/dao/CategoryAccess';
import { ConceptAccess } from 'src/dao/ConceptAccess';
import { QuestionAccess } from 'src/dao/QuestionAccess';
import { QuestionMinorAccess } from 'src/dao/QuestionMinorAccess';
import { ReplyAccess } from 'src/dao/ReplyAccess';
import { TagAccess } from 'src/dao/TagAccess';
import {
  GetQuestionIdResponse,
  GetQuestionParams,
  GetQuestionResponse,
  GetQuestionTagParams,
  GetQuestionTagResponse,
  PostQuestionCompleteRequest,
  PostQuestionCompleteResponse,
  PostQuestionRequest,
  PostQuestionStartRequest,
  PostQuestionStartResponse,
} from 'src/model/api/Question';
import { Concept } from 'src/model/entity/ConceptEntity';
import { QuestionEntity } from 'src/model/entity/QuestionEntity';
import { QuestionMinorEntity } from 'src/model/entity/QuestionMinorEntity';
import { ReplyEntity } from 'src/model/entity/ReplyEntity';
import { Tag, TagEntity } from 'src/model/entity/TagEntity';
import { BadRequestError, UnauthorizedError } from 'src/model/error';
import { bn } from 'src/utils/bignumber';
import { genPagination } from 'src/utils/paginator';
import { UserService } from './UserService';

/**
 * Service class for Question
 */
@injectable()
export class QuestionService {
  @inject(QuestionAccess)
  private readonly questionAccess!: QuestionAccess;
  @inject(QuestionMinorAccess)
  private readonly questionMinorAccess!: QuestionMinorAccess;
  @inject(UserService)
  private readonly userService!: UserService;
  @inject(ReplyAccess)
  private readonly replyAccess!: ReplyAccess;
  @inject(CategoryAccess)
  private readonly categoryAccess!: CategoryAccess;
  @inject(TagAccess)
  private readonly tagAccess!: TagAccess;
  @inject(ConceptAccess)
  private readonly conceptAccess!: ConceptAccess;

  public async getQuestionByUuid(uuid: string): Promise<GetQuestionIdResponse> {
    return await this.questionAccess.findOneOrFail({
      where: { uuid },
      relations: {
        minor: true,
        concept: true,
        tag: true,
        category: true,
      },
    });
  }

  public async getAllTags(
    params: GetQuestionTagParams | null
  ): Promise<GetQuestionTagResponse> {
    if (!params?.categoryId)
      throw new BadRequestError('categoryId is required');

    return await this.questionAccess.findTag(params.categoryId);
  }

  public async getQuestionList(
    params: GetQuestionParams | null
  ): Promise<GetQuestionResponse> {
    if (!params?.categoryId)
      throw new BadRequestError('categoryId is required');

    const user = await this.userService.getUser();

    const limit = params?.limit ? Number(params.limit) : LIMIT;
    const offset = params?.offset ? Number(params.offset) : OFFSET;

    let orderDirection: 'ASC' | 'DESC' = 'ASC';
    if (params.orderDirection === 'ASC' || params.orderDirection === 'DESC')
      orderDirection = params.orderDirection;

    // let hasReply: boolean | undefined = undefined;
    // if (params.hasReply === 'true') hasReply = true;

    // if (params.hasReply === 'false') hasReply = false;

    const [questions, total] = await this.questionAccess.findAndCount({
      categoryId: params.categoryId,
      userId: user?.id ?? 0,
      take: limit,
      skip: offset,
      orderBy: params.orderBy ?? 'id',
      orderDirection,
      title: params.title,
      source: params.source,
      // hasReply,
      tags: params.tags
        ? params.tags.split(',').map((v) => Number(v))
        : undefined,
      concepts: params.concepts
        ? params.concepts.split(',').map((v) => Number(v))
        : undefined,
    });

    return {
      data: questions,
      // data: question.map((v) => ({
      //   uid: v.rid + v.id.toString(36).toUpperCase(),
      //   title: v.title,
      //   categoryId: v.categoryId,
      //   category: v.category,
      //   source: v.source,
      //   tag: v.tag,
      //   count: v.count,
      //   scoringRate: v.scoringRate,
      //   lastReply:
      //     v.reply.length > 0
      //       ? v.reply.sort(compare('createdAt', 'desc'))[0]
      //       : null,
      // })),
      paginate: genPagination(total, limit, offset),
    };
  }

  private async postFb(imageUrl: string, caption: string) {
    const fbPageId = process.env.FB_PAGE_ID;
    const fbAccessToken = process.env.FB_ACCESS_TOKEN;
    const res = await axios.post(
      `https://graph.facebook.com/${fbPageId}/photos`,
      {
        url: imageUrl,
        access_token: fbAccessToken,
        caption,
      }
    );

    return res.data;
  }

  private async commentFbPost(postId: string, questionUuid: string) {
    const fbAccessToken = process.env.FB_ACCESS_TOKEN;
    await axios.post(`https://graph.facebook.com/${postId}/comments`, {
      message: `https://pmp${process.env.ENVR === 'prod' ? '' : '-test'}.celestialstudio.net/q/${questionUuid}`,
      access_token: fbAccessToken,
    });
  }

  public async createQuestion(data: PostQuestionRequest) {
    const category = await this.categoryAccess.findOneOrFail({
      where: { name: data.category },
    });

    const tags: Tag[] = [];
    for (const t of data.tag) {
      let tag = await this.tagAccess.findOne({ where: { name: t } });
      if (tag === null) {
        tag = new TagEntity();
        tag.name = t;
        tag = await this.tagAccess.save(tag);
      }
      tags.push(tag);
    }

    if (data.concept.length === 0)
      throw new BadRequestError('At least one concept is required');

    const concepts: Concept[] = [];
    for (const c of data.concept) {
      const concept = await this.conceptAccess.findOne({ where: { name: c } });
      if (concept === null) throw new BadRequestError(`Concept ${c} not found`);

      if (concept.conceptGroup.categoryId !== category.id)
        throw new BadRequestError(
          `Concept ${c} does not belong to category ${data.category}`
        );

      concepts.push(concept);
    }

    const fbPost = await this.postFb(
      data.imageUrl,
      [data.category, ...data.tag, ...data.concept]
        .map((t) => `#${t}`)
        .join(' ')
    );

    const questionEntity = new QuestionEntity();
    questionEntity.uuid = uuidv4();
    questionEntity.categoryId = category.id;
    questionEntity.title = data.title;
    questionEntity.content = data.content;
    questionEntity.source = data.source;
    questionEntity.fbPostId = fbPost.post_id;
    questionEntity.tag = tags;
    questionEntity.concept = concepts;
    questionEntity.difficulty = data.difficulty;

    const newQuestionEntity = await this.questionAccess.save(questionEntity);

    await this.commentFbPost(fbPost.post_id, newQuestionEntity.uuid);

    const minor: QuestionMinorEntity[] = [];
    for (const m of data.minor) {
      const questionMinorEntity = new QuestionMinorEntity();
      questionMinorEntity.questionId = newQuestionEntity.id;
      questionMinorEntity.type = m.type;
      questionMinorEntity.orderIndex = m.orderIndex;
      questionMinorEntity.content = m.content ?? null;
      questionMinorEntity.options = m.options;
      questionMinorEntity.answer = m.answer;

      const minorEntity =
        await this.questionMinorAccess.save(questionMinorEntity);
      minor.push(minorEntity);
    }

    return {
      ...newQuestionEntity,
      minor,
    };
  }

  private calculateMultipleScore(
    correct: string | null,
    replied: string,
    options: string | null
  ): number {
    if (!correct || !options) return 1;
    if (replied === '') return 0;

    const answerSet = new Set(correct.split(','));
    const repliedSet = new Set(replied.split(','));

    const missing = [...answerSet].filter((o) => !repliedSet.has(o)).length;
    const extra = [...repliedSet].filter((o) => !answerSet.has(o)).length;

    const n = options.split(',').length;
    const k = missing + extra;

    return n - 2 * k <= 0
      ? 0
      : bn(n - 2 * k)
          .div(n)
          .dp(4, 7)
          .toNumber();
  }

  private calculateFillScore(correct: string[], replied: string[]) {
    if (correct.length !== replied.length) return 0;
    for (let i = 0; i < correct.length; i++)
      if (correct[i] !== replied[i]) return 0;

    return 1;
  }

  public async startQuestion(
    data: PostQuestionStartRequest
  ): Promise<PostQuestionStartResponse> {
    const user = await this.userService.getUser();
    if (user === null) throw new UnauthorizedError('User not found');

    const replyEntity = new ReplyEntity();
    replyEntity.userId = user.id;
    replyEntity.questionId = data.id;
    replyEntity.score = 0;
    replyEntity.complete = false;
    replyEntity.recordedAt = new Date().toISOString();

    const newReply = await this.replyAccess.save(replyEntity);

    return {
      id: newReply.id,
      questionId: newReply.questionId,
      userId: newReply.userId,
    };
  }

  public async completeQuestion(
    data: PostQuestionCompleteRequest
  ): Promise<PostQuestionCompleteResponse> {
    const user = await this.userService.getUser();
    if (user === null) throw new UnauthorizedError('User not found');

    const reply = await this.replyAccess.findOne({
      where: {
        id: data.replyId,
        userId: user.id,
        questionId: data.id,
        complete: false,
      },
    });
    if (reply === null) throw new UnauthorizedError('Reply not found');

    const question = await this.questionAccess.findOneOrFail({
      where: { id: data.id },
    });
    if (data.replied.length !== question.minor.length)
      throw new BadRequestError('The number of replied answers is not matched');
    const totalScore = question.minor
      .map((v) => {
        if (v.type === 'SINGLE')
          return data.replied.find((r) => r.id === v.id)?.answer === v.answer
            ? 1
            : 0;
        else if (v.type === 'MULTIPLE')
          return this.calculateMultipleScore(
            v.answer,
            data.replied.find((r) => r.id === v.id)?.answer ?? '',
            v.options
          );
        else if (v.type === 'FILL')
          return this.calculateFillScore(
            v.answer?.split(',') ?? [],
            data.replied.find((r) => r.id === v.id)?.answer.split(',') ?? []
          );

        return 0;
      })
      .reduce((prev, cur) => prev.plus(cur), bn(0));
    const score = totalScore.div(question.minor.length).dp(4, 7).toNumber();

    reply.score = score;
    reply.repliedAnswer = data.replied.map((r) => r.answer).join('|');
    reply.complete = true;
    reply.recordedAt = new Date().toISOString();

    const newReply = await this.replyAccess.save(reply);

    return {
      ...newReply,
      actualAnswer: question.minor.map((m) => m.answer).join('|'),
      fbPostId: question.fbPostId,
    };
  }
}
