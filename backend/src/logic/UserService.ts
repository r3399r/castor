import admin from 'firebase-admin';
import { inject, injectable } from 'inversify';
import { LIMIT, OFFSET } from 'src/constant/Pagination';
import { ReplyAccess } from 'src/dao/ReplyAccess';
import { UserAccess } from 'src/dao/UserAccess';
import { UserStatsAccess } from 'src/dao/UserStatsAccess';
import {
  GetUserDetailParams,
  GetUserDetailResponse,
  GetUserResponse,
  PostUserSyncResponse,
} from 'src/model/api/User';
import { UserEntity } from 'src/model/entity/UserEntity';
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
} from 'src/model/error';
import { authorizationSymbol } from 'src/utils/LambdaHelper';
import { genPagination } from 'src/utils/paginator';

admin.initializeApp({
  credential: admin.credential.cert(
    JSON.parse(process.env.FIREBAE_ADMIN_KEY ?? '{}')
  ),
});

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
  @inject(authorizationSymbol)
  private readonly token!: string;

  private async verifyFirebaseToken() {
    try {
      return await admin.auth().verifyIdToken(this.token);
    } catch (error) {
      console.error('Invalid Firebase token', error);

      return null;
    }
  }

  public async syncFirebaseUser(): Promise<PostUserSyncResponse> {
    const decoded = await this.verifyFirebaseToken();
    if (!decoded) throw new UnauthorizedError('Unauthorized');

    const user = await this.userAccess.findOne({
      where: { firebaseUid: decoded.uid },
    });
    if (user !== null) {
      user.lastLoginAt = new Date().toISOString();

      return await this.userAccess.save(user);
    }

    const userEntity = new UserEntity();
    userEntity.firebaseUid = decoded.uid;
    userEntity.email = decoded.email ?? null;
    userEntity.name = decoded.name ?? null;
    userEntity.avatar = decoded.picture ?? null;
    userEntity.lastLoginAt = new Date().toISOString();

    return await this.userAccess.save(userEntity);
  }

  public async getUser(): Promise<GetUserResponse> {
    const decoded = await this.verifyFirebaseToken();
    if (!decoded) return null;

    return await this.userAccess.findOne({
      where: { firebaseUid: decoded.uid },
    });
  }

  public async getUserDetail(
    params: GetUserDetailParams | null
  ): Promise<GetUserDetailResponse> {
    if (!params?.categoryId)
      throw new BadRequestError('categoryId is required');

    const user = await this.getUser();
    if (user === null) throw new NotFoundError('User not found');

    const userStats = await this.userStatsAccess.find({
      where: {
        userId: user.id,
      },
      relations: { user: true, category: true },
    });

    const limit = params?.limit ? Number(params.limit) : LIMIT;
    const offset = params?.offset ? Number(params.offset) : OFFSET;
    const [reply, total] = await this.replyAccess.findAndCount({
      where: {
        userId: user.id,
        question: {
          categoryId: params.categoryId,
        },
      },
      relations: {
        question: { tag: true },
      },
      order: { recordedAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    const currentUs = userStats.find(
      (v) => v.category.id === Number(params.categoryId)
    );

    return {
      user,
      category:
        userStats?.map((v) => ({
          id: v.category.id,
          name: v.category.name,
          isCurrent: v.category.id === Number(params.categoryId),
        })) ?? [],
      count: currentUs?.count ?? null,
      scoringRate: currentUs?.scoringRate ?? null,
      reply: {
        data: reply.map((v) => ({
          id: v.id,
          questionUid:
            v.question.rid + v.question.id.toString(36).toUpperCase(),
          questionTitle: v.question.title,
          questionSource: v.question.source,
          tag: v.question.tag,
          score: v.score,
          repliedAnswer: v.repliedAnswer,
          complete: v.complete,
          recordedAt: v.recordedAt,
        })),
        paginate: genPagination(total, limit, offset),
      },
    };
  }
}
