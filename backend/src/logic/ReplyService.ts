import { differenceInDays } from 'date-fns';
import { inject, injectable } from 'inversify';
import { In } from 'typeorm';
import { QuestionAccess } from 'src/dao/QuestionAccess';
import { ReplyAccess } from 'src/dao/ReplyAccess';
import { UserConceptStatAccess } from 'src/dao/UserConceptStatAccess';
import { PostReplyRequest, PostReplyResponse } from 'src/model/api/Reply';
import { Question } from 'src/model/entity/QuestionEntity';
import { ReplyEntity } from 'src/model/entity/ReplyEntity';
import { UserConceptStatEntity } from 'src/model/entity/UserConceptStatEntity';
import { UnauthorizedError } from 'src/model/error';
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
      weight * (question.scoringTotal / question.attempCount) +
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

    const responses: PostReplyResponse = [];
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

    return responses;
  }
}
