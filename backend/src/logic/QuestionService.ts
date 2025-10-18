import { inject, injectable } from 'inversify';
import { LIMIT, OFFSET } from 'src/constant/Pagination';
import { CategoryAccess } from 'src/dao/CategoryAccess';
import { QuestionAccess } from 'src/dao/QuestionAccess';
import { QuestionMinorAccess } from 'src/dao/QuestionMinorAccess';
import { ReplyAccess } from 'src/dao/ReplyAccess';
import {
  GetQuestionIdResponse,
  GetQuestionParams,
  GetQuestionResponse,
  PostQuestionReplyRequest,
  PostQuestionReplyResponse,
  PostQuestionRequest,
} from 'src/model/api/Question';
import { QuestionEntity } from 'src/model/entity/QuestionEntity';
import { QuestionMinorEntity } from 'src/model/entity/QuestionMinorEntity';
import { ReplyEntity } from 'src/model/entity/ReplyEntity';
import { BadRequestError } from 'src/model/error';
import { bn } from 'src/utils/bignumber';
import { compare } from 'src/utils/compare';
import { userIdSymbol } from 'src/utils/LambdaHelper';
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
  @inject(userIdSymbol)
  private readonly userId!: string;

  public async getQuestionByUid(uid: string): Promise<GetQuestionIdResponse> {
    const id = parseInt(uid.substring(3), 36);
    const rid = uid.substring(0, 3).toUpperCase();

    const question = await this.questionAccess.findOneOrFail({ where: { id } });
    if (question.rid !== rid) throw new BadRequestError('rid is not matched');

    return {
      ...question,
      minor: question.minor.map((m) => {
        const { answer: _answer, ...rest } = m;

        return rest;
      }),
    };
  }

  public async getQuestionList(
    params: GetQuestionParams | null
  ): Promise<GetQuestionResponse> {
    if (!params?.categoryId)
      throw new BadRequestError('categoryId is required');

    const limit = params?.limit ? Number(params.limit) : LIMIT;
    const offset = params?.offset ? Number(params.offset) : OFFSET;

    const [question, total] = await this.questionAccess.findAndCount1({
      categoryId: params.categoryId,
      userId: Number(this.userId),
      take: limit,
      skip: offset,
    });

    return {
      data: question.map((v) => ({
        uid: v.rid + v.id.toString(36),
        categoryId: v.categoryId,
        count: v.count,
        scoringRate: v.scoringRate,
        avgElapsedTimeMs: v.avgElapsedTimeMs,
        hasReplied: v.reply.length > 0,
        lastRepliedAt:
          v.reply.length > 0
            ? v.reply.sort(compare('createdAt', 'desc'))[0].createdAt
            : null,
      })),
      paginate: genPagination(total, limit, offset),
    };
  }

  public async createQuestion(data: PostQuestionRequest) {
    const category = await this.categoryAccess.findOneOrFail({
      where: { name: data.categoryName },
    });

    const questionEntity = new QuestionEntity();
    questionEntity.rid = randomBase36(3);
    questionEntity.categoryId = category.id;
    questionEntity.content = data.content;
    questionEntity.discussionUrl = data.discussionUrl;

    const newQuestionEntity = await this.questionAccess.save(questionEntity);

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
    if (!data.userId && !data.deviceId)
      throw new BadRequestError('Either userId or deviceId must be provided');

    let userId: number;
    if (data.userId) userId = data.userId;
    else {
      const user = await this.userService.getUserByDeviceId(
        data.deviceId ?? ''
      );
      userId = user.id;
    }

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
    replyEntity.userId = userId;
    replyEntity.score = score;
    replyEntity.elapsedTimeMs = data.elapsedTimeMs;
    replyEntity.repliedAnswer = data.replied.map((r) => r.answer).join('|');

    return await this.replyAccess.save(replyEntity);
  }
}
