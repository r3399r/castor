import {
  DailyMastery,
  GetUserHistoryResponse,
  GetUserResponse,
  GetUserStatsResponse,
  PostUserSyncResponse,
  StatsSubject,
} from '@castor/shared';
import admin from 'firebase-admin';
import { inject, injectable } from 'inversify';
import { In } from 'typeorm';
import { ConceptGroupAccess } from 'src/dao/ConceptGroupAccess';
import { SubjectAccess } from 'src/dao/SubjectAccess';
import { UserAccess } from 'src/dao/UserAccess';
import { UserConceptStatAccess } from 'src/dao/UserConceptStatAccess';
import { UserStatHistoryAccess } from 'src/dao/UserStatHistoryAccess';
import { UserEntity } from 'src/model/entity/UserEntity';
import { UnauthorizedError } from 'src/model/error';
import { authorizationSymbol } from 'src/utils/LambdaHelper';

@injectable()
export class UserService {
  @inject(UserAccess)
  private readonly userAccess!: UserAccess;
  @inject(UserConceptStatAccess)
  private readonly userConceptStatAccess!: UserConceptStatAccess;
  @inject(UserStatHistoryAccess)
  private readonly userStatHistoryAccess!: UserStatHistoryAccess;
  @inject(ConceptGroupAccess)
  private readonly conceptGroupAccess!: ConceptGroupAccess;
  @inject(SubjectAccess)
  private readonly subjectAccess!: SubjectAccess;
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

  public async getUserHistory(): Promise<GetUserHistoryResponse> {
    const user = await this.getUser();
    if (user === null) throw new UnauthorizedError('User not found');

    const rows = await this.userStatHistoryAccess.find({
      where: { userId: user.id },
    });

    if (rows.length === 0)
      return {
        totalAttempts: 0,
        overallAccuracy: 0,
        streakDays: 0,
        overallDailyMastery: [],
        subjectHistory: [],
        activityMap: [],
      };

    // Aggregate in one pass
    let totalAttempts = 0;
    let totalCorrect = 0;
    const dateSubjectMap = new Map<
      string,
      Map<number, { mastery: number | null; attempts: number }>
    >();

    for (const row of rows) {
      totalAttempts += row.dailyAttempts;
      totalCorrect += row.dailyCorrect;

      if (!dateSubjectMap.has(row.date))
        dateSubjectMap.set(row.date, new Map());
      dateSubjectMap
        .get(row.date)!
        .set(row.subjectId, {
          mastery: row.weightedMastery,
          attempts: row.dailyAttempts,
        });
    }

    // Streak: consecutive days descending from today or yesterday
    const sortedDates = [...dateSubjectMap.keys()].sort().reverse();
    const streakDays = this.computeStreak(sortedDates);

    // Subject names and question counts for weighting the overall curve
    const subjectIds = [...new Set(rows.map((r) => r.subjectId))];
    const subjects = await this.subjectAccess.find({
      where: { id: In(subjectIds) },
      select: ['id', 'name'],
    });
    const subjectNameMap = new Map(subjects.map((s) => [s.id, s.name]));

    const conceptGroups = await this.conceptGroupAccess.find({
      where: { subjectId: In(subjectIds) },
      relations: { concepts: true },
    });
    const subjectQuestionCount = new Map<number, number>();
    for (const cg of conceptGroups) {
      const count = cg.concepts.reduce(
        (sum, c) => sum + c.numberOfQuestions,
        0
      );
      subjectQuestionCount.set(
        cg.subjectId,
        (subjectQuestionCount.get(cg.subjectId) ?? 0) + count
      );
    }

    // Overall daily mastery: weighted average across subjects per date
    const overallDailyMastery: DailyMastery[] = [...dateSubjectMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, subjectEntries]) => {
        let weightedSum = 0;
        let totalQ = 0;
        for (const [subjectId, { mastery }] of subjectEntries) {
          if (mastery === null) continue;
          const q = subjectQuestionCount.get(subjectId) ?? 0;
          weightedSum += mastery * q;
          totalQ += q;
        }
        return {
          date,
          weightedMastery: totalQ > 0 ? weightedSum / totalQ : 0,
        };
      });

    // Per-subject history
    const subjectDailyMap = new Map<number, DailyMastery[]>();
    for (const row of rows) {
      if (row.weightedMastery === null) continue;
      if (!subjectDailyMap.has(row.subjectId))
        subjectDailyMap.set(row.subjectId, []);
      subjectDailyMap
        .get(row.subjectId)!
        .push({ date: row.date, weightedMastery: row.weightedMastery });
    }
    const subjectHistory = [...subjectDailyMap.entries()].map(
      ([subjectId, dailyStats]) => ({
        subjectId,
        subjectName: subjectNameMap.get(subjectId) ?? '',
        dailyStats: dailyStats.sort((a, b) => a.date.localeCompare(b.date)),
      })
    );

    // Heatmap: total daily attempts across all subjects
    const activityMap = [...dateSubjectMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, subjectEntries]) => ({
        date,
        count: [...subjectEntries.values()].reduce(
          (sum, e) => sum + e.attempts,
          0
        ),
      }));

    const overallAccuracy =
      totalAttempts > 0
        ? (totalCorrect / totalAttempts / 10) * 100
        : 0;

    return {
      totalAttempts,
      overallAccuracy,
      streakDays,
      overallDailyMastery,
      subjectHistory,
      activityMap,
    };
  }

  private computeStreak(sortedDatesDesc: string[]): number {
    if (sortedDatesDesc.length === 0) return 0;
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000)
      .toISOString()
      .split('T')[0];
    if (
      sortedDatesDesc[0] !== today &&
      sortedDatesDesc[0] !== yesterday
    )
      return 0;

    let streak = 1;
    for (let i = 1; i < sortedDatesDesc.length; i++) {
      const prev = new Date(sortedDatesDesc[i - 1]);
      const curr = new Date(sortedDatesDesc[i]);
      const diffDays = Math.round(
        (prev.getTime() - curr.getTime()) / 86400000
      );
      if (diffDays === 1) streak++;
      else break;
    }
    return streak;
  }
}
