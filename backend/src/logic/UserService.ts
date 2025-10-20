import { inject, injectable } from 'inversify';
import { LIMIT, OFFSET } from 'src/constant/Pagination';
import { ReplyAccess } from 'src/dao/ReplyAccess';
import { UserAccess } from 'src/dao/UserAccess';
import { UserStatsAccess } from 'src/dao/UserStatsAccess';
import {
  GetUserDetailParams,
  GetUserDetailResponse,
  GetUserResponse,
} from 'src/model/api/User';
import { UserEntity } from 'src/model/entity/UserEntity';
import { BadRequestError } from 'src/model/error';
import { deviceIdSymbol, userIdSymbol } from 'src/utils/LambdaHelper';
import { genPagination } from 'src/utils/paginator';

/**
 * Service class for User
 */
@injectable()
export class UserService {
  @inject(UserAccess)
  private readonly userAccess!: UserAccess;
  @inject(UserStatsAccess)
  private readonly userStatsAccess!: UserStatsAccess;
  @inject(ReplyAccess)
  private readonly replyAccess!: ReplyAccess;
  @inject(deviceIdSymbol)
  private readonly deviceId!: string;
  @inject(userIdSymbol)
  private readonly userId!: string;

  public async createUserWithDeviceId() {
    const userEntity = new UserEntity();
    userEntity.deviceId = this.deviceId;

    return await this.userAccess.save(userEntity);
  }

  public async getUser(): Promise<GetUserResponse> {
    const user = await this.userAccess.findOne({
      where: { id: isNaN(Number(this.userId)) ? 0 : Number(this.userId) },
    });
    if (user !== null) return user;

    return await this.userAccess.findOne({
      where: { deviceId: this.deviceId },
    });
  }

  public async getUserDetail(
    params: GetUserDetailParams | null
  ): Promise<GetUserDetailResponse> {
    if (!params?.categoryId)
      throw new BadRequestError('categoryId is required');

    const userStats = await this.userStatsAccess.findOne({
      where: {
        userId: isNaN(Number(this.userId)) ? 0 : Number(this.userId),
        categoryId: params.categoryId,
      },
    });

    const limit = params?.limit ? Number(params.limit) : LIMIT;
    const offset = params?.offset ? Number(params.offset) : OFFSET;
    const [reply, total] = await this.replyAccess.findAndCount({
      where: {
        userId: isNaN(Number(this.userId)) ? 0 : Number(this.userId),
      },
      relations: {
        question: { tag: true },
      },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return {
      userId: isNaN(Number(this.userId)) ? 0 : Number(this.userId),
      categoryId: params.categoryId,
      count: userStats?.count ?? null,
      scoringRate: userStats?.scoringRate ?? null,
      reply: {
        data: reply.map((v) => ({
          id: v.id,
          questionUid: v.question.rid + v.question.id.toString(36),
          tag: v.question.tag,
          score: v.score,
          elapsedTimeMs: v.elapsedTimeMs,
          repliedAnswer: v.repliedAnswer,
          createdAt: v.createdAt,
        })),
        paginate: genPagination(total, limit, offset),
      },
    };
  }
}
