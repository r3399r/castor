import {
  GetReplyParams,
  GetReplyResponse,
  PostReplyRequest,
  PostReplyResponse,
  Question,
} from '@castor/shared';
import { differenceInDays } from 'date-fns';
import { inject, injectable } from 'inversify';
import { In } from 'typeorm';
import { LIMIT, OFFSET } from 'src/constant/Pagination';
import { PendingReplyAccess } from 'src/dao/PendingReplyAccess';
import { QuestionAccess } from 'src/dao/QuestionAccess';
import { ReplyAccess } from 'src/dao/ReplyAccess';
import { UserConceptStatAccess } from 'src/dao/UserConceptStatAccess';
import { UserStatHistoryAccess } from 'src/dao/UserStatHistoryAccess';
import { ReplyEntity } from 'src/model/entity/ReplyEntity';
import { UserConceptStatEntity } from 'src/model/entity/UserConceptStatEntity';
import { UserStatHistoryEntity } from 'src/model/entity/UserStatHistoryEntity';
import { UnauthorizedError } from 'src/model/error';
import { genPagination } from 'src/utils/paginator';
import { UserService } from './UserService';

/**
 * Service class for Reply
 */
@injectable()
export class ReplyService {
  @inject(QuestionAccess)
  private readonly questionAccess!: QuestionAccess;
  @inject(ReplyAccess)
  private readonly replyAccess!: ReplyAccess;
  @inject(UserService)
  private readonly userService!: UserService;
  @inject(UserConceptStatAccess)
  private readonly userConceptStatAccess!: UserConceptStatAccess;
  @inject(UserStatHistoryAccess)
  private readonly userStatHistoryAccess!: UserStatHistoryAccess;
  @inject(PendingReplyAccess)
  private readonly pendingReplyAccess!: PendingReplyAccess;

  private calTrueFalseScore(replied: string, correct: string): number {
    return replied === correct ? 10 : 0;
  }

  private calSingleScore(replied: string, correct: string): number {
    return replied === correct ? 10 : 0;
  }

  private calMultipleScore(replied: string, correct: string): number {
    const optionCount = correct.length;
    let incorrectCount = 0;
    for (let i = 0; i < optionCount; i++)
      if (replied.at(i) !== correct.at(i)) incorrectCount++;

    const score = ((optionCount - 2 * incorrectCount) / optionCount) * 10;

    return score < 0 ? 0 : score;
  }

  private calFillScore(replied: string, correct: string): number {
    for (let i = 0; i < correct.length; i++)
      if (replied.at(i) !== correct.at(i)) return 0;

    return 10;
  }

  private async replyOne(
    question: Question,
    parentQuestion: Question | null,
    repliedAnswer: string,
    userId: number
  ) {
    let score = 0;
    switch (question.type) {
      case 'TRUE_FALSE':
        score = this.calTrueFalseScore(repliedAnswer, question.answer ?? '');
        break;
      case 'SINGLE':
        score = this.calSingleScore(repliedAnswer, question.answer ?? '');
        break;
      case 'MULTIPLE':
        score = this.calMultipleScore(repliedAnswer, question.answer ?? '');
        break;
      case 'FILL':
        score = this.calFillScore(repliedAnswer, question.answer ?? '');
        break;
    }

    question.attempCount += 1;
    question.scoringTotal += score;

    const weight =
      question.attempCount > 1068 ? 1 : question.attempCount / 1068;
    question.adjustedDifficulty =
      weight * (10 - question.scoringTotal / question.attempCount) +
      (1 - weight) * question.difficulty;

    await this.questionAccess.save(question);

    const result = {
      questionId: question.id,
      repliedAnswer,
      correctAnswer: question.answer ?? '',
      score,
      fbPostId: parentQuestion ? parentQuestion.fbPostId : question.fbPostId,
    };

    const replyEntity = new ReplyEntity();
    replyEntity.questionId = question.id;
    replyEntity.subjectId = question.subjectId;
    replyEntity.userId = userId;
    replyEntity.parentId = parentQuestion ? parentQuestion.id : null;
    replyEntity.score = score;
    replyEntity.repliedAnswer = repliedAnswer;
    await this.replyAccess.save(replyEntity);

    const conceptIds = new Set<number>();
    question.concept.forEach((c) => conceptIds.add(c.id));
    if (parentQuestion)
      parentQuestion.concept.forEach((c) => conceptIds.add(c.id));

    if (conceptIds.size === 0) return result;

    const userConceptStatList = await this.userConceptStatAccess.find({
      where: {
        userId,
        conceptId: In([...conceptIds]),
      },
    });
    for (const conceptId of conceptIds) {
      const stat = userConceptStatList.find((s) => s.conceptId === conceptId);
      if (stat) {
        const deltaDay = stat.lastAttemptAt
          ? differenceInDays(new Date(), stat.lastAttemptAt)
          : 0;
        const decayFactor = Math.exp(-deltaDay / 7);

        stat.attemptCount += 1;
        stat.scoringTotal += score;
        stat.lastAttemptAt = new Date().toISOString();
        stat.weightedSum = stat.weightedSum * decayFactor + score;
        stat.decaySum = stat.decaySum * decayFactor + 1;

        const accuracy = stat.scoringTotal / stat.attemptCount;
        const recentPerformance = stat.weightedSum / stat.decaySum;
        const exposure =
          stat.attemptCount >= 20
            ? 10
            : (10 * Math.log10(stat.attemptCount + 1)) / Math.log10(21);
        stat.mastery =
          0.5 * accuracy + 0.3 * recentPerformance + 0.2 * exposure;

        await this.userConceptStatAccess.save(stat);
      } else {
        const userConceptEntity = new UserConceptStatEntity();
        userConceptEntity.userId = userId;
        userConceptEntity.conceptId = conceptId;
        userConceptEntity.attemptCount = 1;
        userConceptEntity.scoringTotal = score;
        userConceptEntity.lastAttemptAt = new Date().toISOString();
        userConceptEntity.weightedSum = score;
        userConceptEntity.decaySum = 1;

        const accuracy = score;
        const recentPerformance = score;
        const exposure = (10 * Math.log10(2)) / Math.log10(21);
        userConceptEntity.mastery =
          0.5 * accuracy + 0.3 * recentPerformance + 0.2 * exposure;

        await this.userConceptStatAccess.save(userConceptEntity);
      }
    }

    return result;
  }

  private async upsertStatHistory(
    userId: number,
    subjectId: number,
    batchAttempts: number,
    batchCorrect: number
  ): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    const concepts = await this.userConceptStatAccess.findByUserAndSubject(
      userId,
      subjectId
    );
    const totalQ = concepts.reduce((sum, c) => sum + c.numberOfQuestions, 0);
    const weightedMastery =
      totalQ > 0
        ? concepts.reduce(
            (sum, c) => sum + (c.mastery ?? 0) * c.numberOfQuestions,
            0
          ) / totalQ
        : null;

    const existing = await this.userStatHistoryAccess.findOne({
      where: { userId, subjectId, date: today },
    });

    if (existing) {
      existing.weightedMastery = weightedMastery;
      existing.dailyAttempts += batchAttempts;
      existing.dailyCorrect += batchCorrect;
      await this.userStatHistoryAccess.save(existing);
    } else {
      const entity = new UserStatHistoryEntity();
      entity.userId = userId;
      entity.subjectId = subjectId;
      entity.date = today;
      entity.weightedMastery = weightedMastery;
      entity.dailyAttempts = batchAttempts;
      entity.dailyCorrect = batchCorrect;
      await this.userStatHistoryAccess.save(entity);
    }
  }

  public async reply(data: PostReplyRequest): Promise<PostReplyResponse> {
    const user = await this.userService.getUser();
    if (user === null) throw new UnauthorizedError('User not found');

    const questionMap = new Map<number, Question>();

    const questionIds = data.map((d) => d.questionId);
    const questions = await this.questionAccess.find({
      where: { id: In(questionIds) },
      relations: { concept: true },
    });
    questions.forEach((q) => questionMap.set(q.id, q));

    const parentQuestionIds = questions.flatMap((q) =>
      q.parentId ? [q.parentId] : []
    );
    if (parentQuestionIds.length > 0) {
      const parentQuestions = await this.questionAccess.find({
        where: { id: In(parentQuestionIds) },
        relations: { concept: true },
      });
      parentQuestions.forEach((q) => questionMap.set(q.id, q));
    }

    const pendingReplies = await this.pendingReplyAccess.find({
      where: { userId: user.id },
    });
    for (const pendingReply of pendingReplies)
      if (questionMap.has(pendingReply.questionId))
        await this.pendingReplyAccess.delete(pendingReply.id);

    const responses: PostReplyResponse = [];
    const subjectBatch = new Map<number, { attempts: number; correct: number }>();

    for (const d of data) {
      const question = questionMap.get(d.questionId) ?? null;
      const parentQuestion = questionMap.get(question?.parentId ?? -1) ?? null;
      if (!question) continue;
      const res = await this.replyOne(
        question,
        parentQuestion,
        d.repliedAnswer,
        user.id
      );
      responses.push(res);

      const sid = question.subjectId;
      const entry = subjectBatch.get(sid) ?? { attempts: 0, correct: 0 };
      entry.attempts += 1;
      entry.correct += res.score;
      subjectBatch.set(sid, entry);
    }

    for (const parentId of new Set([...parentQuestionIds])) {
      const parentQuestion = questionMap.get(parentId);
      if (!parentQuestion) continue;

      const childrenQuestions = await this.questionAccess.find({
        where: { parentId },
      });
      const difficulty =
        childrenQuestions.reduce((acc, q) => acc + q.adjustedDifficulty, 0) /
        childrenQuestions.length;
      parentQuestion.adjustedDifficulty = difficulty;
      await this.questionAccess.save(parentQuestion);
    }

    for (const [subjectId, { attempts, correct }] of subjectBatch)
      await this.upsertStatHistory(user.id, subjectId, attempts, correct);

    return responses;
  }

  public async getReplyList(
    params: GetReplyParams | null
  ): Promise<GetReplyResponse> {
    const user = await this.userService.getUser();
    if (user === null) throw new UnauthorizedError('User not found');

    const limit = params?.limit ? Number(params.limit) : LIMIT;
    const offset = params?.offset ? Number(params.offset) : OFFSET;

    const [replies, total] = await this.replyAccess.findAndCount({
      where: { userId: user.id },
      relations: {
        question: true,
        parent: true,
        subject: true,
      },
      take: limit,
      skip: offset,
      order: { createdAt: 'DESC' },
    });

    return {
      data: replies,
      paginate: genPagination(total, limit, offset),
    };
  }
}
