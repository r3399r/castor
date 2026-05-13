import {
  GetUserResponse,
  GetUserStatsResponse,
  PostUserSyncResponse,
  StatsSubject,
} from '@castor/shared';
import admin from 'firebase-admin';
import { inject, injectable } from 'inversify';
import { In } from 'typeorm';
import { ConceptGroupAccess } from 'src/dao/ConceptGroupAccess';
import { UserAccess } from 'src/dao/UserAccess';
import { UserConceptStatAccess } from 'src/dao/UserConceptStatAccess';
import { UserEntity } from 'src/model/entity/UserEntity';
import { UnauthorizedError } from 'src/model/error';
import { authorizationSymbol } from 'src/utils/LambdaHelper';

@injectable()
export class UserService {
  @inject(UserAccess)
  private readonly userAccess!: UserAccess;
  @inject(UserConceptStatAccess)
  private readonly userConceptStatAccess!: UserConceptStatAccess;
  @inject(ConceptGroupAccess)
  private readonly conceptGroupAccess!: ConceptGroupAccess;
  @inject(authorizationSymbol)
  private readonly token!: string;

  constructor() {
    if (admin.apps.length === 0)
      admin.initializeApp({
        credential: admin.credential.cert(
          JSON.parse(process.env.FIREBASE_ADMIN_KEY ?? '{}')
        ),
      });
  }

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

  public async getUserStats(): Promise<GetUserStatsResponse> {
    const user = await this.getUser();
    if (user === null) throw new UnauthorizedError('User not found');

    const stats = await this.userConceptStatAccess.find({
      where: { userId: user.id },
      select: ['mastery', 'conceptId'],
      relations: {
        concept: {
          conceptGroup: true,
        },
      },
    });

    const statsMap = new Map(stats.map((s) => [s.conceptId, s]));
    const subjectIds = new Set(
      stats.map((v) => v.concept.conceptGroup.subjectId)
    );
    const conceptGroups = await this.conceptGroupAccess.find({
      where: { subjectId: In([...subjectIds]) },
      relations: {
        concepts: true,
        subject: {
          category: true,
        },
      },
    });

    const subjectMap = new Map<number, StatsSubject>();
    for (const cg of conceptGroups) {
      let [totalMastery, totalCount] = [0, 0];
      for (const c of cg.concepts) {
        const mastery = statsMap.get(c.id)?.mastery ?? 0;
        totalMastery += mastery * c.numberOfQuestions;
        totalCount += c.numberOfQuestions;
      }

      const resultConceptGroup = {
        id: cg.id,
        name: cg.name,
        mastery: totalCount > 0 ? totalMastery / totalCount : 0,
      };

      if (!subjectMap.has(cg.subject.id))
        subjectMap.set(cg.subject.id, {
          id: cg.subject.id,
          name: cg.subject.name,
          category: cg.subject.category,
          conceptGroup: [],
        });

      const subject = subjectMap.get(cg.subject.id)!;
      subject.conceptGroup.push(resultConceptGroup);
    }

    return [...subjectMap.values()];
  }
}
