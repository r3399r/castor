import axios from 'axios';
import { inject, injectable } from 'inversify';
import { LIMIT, OFFSET } from 'src/constant/Pagination';
import { CategoryAccess } from 'src/dao/CategoryAccess';
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
  PostQuestionReplyRequest,
  PostQuestionReplyResponse,
  PostQuestionRequest,
} from 'src/model/api/Question';
import { QuestionEntity } from 'src/model/entity/QuestionEntity';
import { QuestionMinorEntity } from 'src/model/entity/QuestionMinorEntity';
import { ReplyEntity } from 'src/model/entity/ReplyEntity';
import { Tag, TagEntity } from 'src/model/entity/TagEntity';
import { BadRequestError, NotFoundError } from 'src/model/error';
import { bn } from 'src/utils/bignumber';
import { compare } from 'src/utils/compare';
import { genPagination } from 'src/utils/paginator';
import { randomBase36 } from 'src/utils/random';
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

  public async getQuestionByUid(uid: string): Promise<GetQuestionIdResponse> {
    const id = parseInt(uid.substring(3), 36);
    const rid = uid.substring(0, 3).toUpperCase();

    const user = await this.userService.getUser();
    if (user === null) throw new NotFoundError('User not found');

    const question = await this.questionAccess.findDetail({
      id,
      userId: user.id,
    });
    if (question.rid !== rid) throw new BadRequestError('rid is not matched');

    return {
      uid: question.rid + question.id.toString(36),
      title: question.title,
      categoryId: question.categoryId,
      content: question.content,
      source: question.source,
      minor: question.minor.map((m) => {
        const { answer, ...rest } = m;

        return rest;
      }),
      tag: question.tag,
      count: question.count,
      scoringRate: question.scoringRate,
      avgElapsedTimeMs: question.avgElapsedTimeMs,
      lastReply:
        question.reply.length > 0
          ? {
              ...question.reply.sort(compare('createdAt', 'desc'))[0],
              actualAnswer: question.minor.map((m) => m.answer).join('|'),
              fbPostId: question.fbPostId,
            }
          : null,
    };
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

    let hasReply: boolean | undefined = undefined;
    if (params.hasReply === 'true') hasReply = true;

    if (params.hasReply === 'false') hasReply = false;

    const [question, total] = await this.questionAccess.findAndCount({
      categoryId: params.categoryId,
      userId: user?.id ?? 0,
      take: limit,
      skip: offset,
      orderBy: params.orderBy ?? 'id',
      orderDirection,
      title: params.title,
      hasReply,
      tags: params.tags
        ? params.tags.split(',').map((v) => Number(v))
        : undefined,
    });

    return {
      data: question.map((v) => ({
        uid: v.rid + v.id.toString(36),
        title: v.title,
        categoryId: v.categoryId,
        category: v.category,
        source: v.source,
        tag: v.tag,
        count: v.count,
        scoringRate: v.scoringRate,
        avgElapsedTimeMs: v.avgElapsedTimeMs,
        lastReply:
          v.reply.length > 0
            ? v.reply.sort(compare('createdAt', 'desc'))[0]
            : null,
      })),
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

  private async commentFbPost(postId: string, questionUid: string) {
    const fbAccessToken = process.env.FB_ACCESS_TOKEN;
    await axios.post(`https://graph.facebook.com/${postId}/comments`, {
      message: `https://pmp${process.env.EVNR === 'prod' ? '' : '-test'}.celestialstudio.net/q/${questionUid}`,
      access_token: fbAccessToken,
    });
  }

  public async createQuestion(data: PostQuestionRequest) {
    const category = await this.categoryAccess.findOneOrFail({
      where: { name: data.category },
    });
    const tagEntities: Tag[] = [];
    for (const t of data.tag) {
      let tagEntity = await this.tagAccess.findOne({ where: { name: t } });
      if (tagEntity === null) {
        tagEntity = new TagEntity();
        tagEntity.name = t;
        tagEntity = await this.tagAccess.save(tagEntity);
      }
      tagEntities.push(tagEntity);
    }

    const fbPost = await this.postFb(
      data.imageUrl,
      `#${data.category} ` + data.tag.map((t) => `#${t}`).join(' ')
    );

    const questionEntity = new QuestionEntity();
    questionEntity.rid = randomBase36(3);
    questionEntity.categoryId = category.id;
    questionEntity.title = data.title;
    questionEntity.content = data.content;
    questionEntity.source = data.source;
    questionEntity.fbPostId = fbPost.post_id;
    questionEntity.tag = tagEntities;

    const newQuestionEntity = await this.questionAccess.save(questionEntity);

    await this.commentFbPost(
      fbPost.post_id,
      newQuestionEntity.rid + newQuestionEntity.id.toString(36)
    );

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

  public async replyQuestion(
    data: PostQuestionReplyRequest
  ): Promise<PostQuestionReplyResponse> {
    const user = await this.userService.getUser();
    if (user === null) throw new NotFoundError('User not found');

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

        return 1;
      })
      .reduce((prev, cur) => prev.plus(cur), bn(0));
    const score = totalScore.div(question.minor.length).dp(4, 7).toNumber();

    const replyEntity = new ReplyEntity();
    replyEntity.questionId = data.id;
    replyEntity.userId = user.id;
    replyEntity.score = score;
    replyEntity.elapsedTimeMs = data.elapsedTimeMs;
    replyEntity.repliedAnswer = data.replied.map((r) => r.answer).join('|');

    const newReply = await this.replyAccess.save(replyEntity);

    return {
      ...newReply,
      actualAnswer: question.minor.map((m) => m.answer).join('|'),
      fbPostId: question.fbPostId,
    };
  }
}
