import { inject, injectable } from 'inversify';
import { In } from 'typeorm';
import { QuestionAccess } from 'src/dao/QuestionAccess';
import { ReplyAccess } from 'src/dao/ReplyAccess';
import { PostReplyRequest } from 'src/model/api/Reply';
import { Question } from 'src/model/entity/QuestionEntity';
import { ReplyEntity } from 'src/model/entity/ReplyEntity';
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

  private calTrueFalseScore(
    repliedAnswer: string,
    correctAnswer: string
  ): number {
    return repliedAnswer === correctAnswer ? 10 : 0;
  }

  private calSingleScore(repliedAnswer: string, correctAnswer: string): number {
    return repliedAnswer === correctAnswer ? 10 : 0;
  }

  private calMultipleScore(
    repliedAnswer: string,
    correctAnswer: string
  ): number {
    const optionCount = correctAnswer.length;
    let incorrectCount = 0;
    for (let i = 0; i < optionCount; i++)
      if (repliedAnswer.at(i) !== correctAnswer.at(i)) incorrectCount++;

    const score = ((optionCount - 2 * incorrectCount) / optionCount) * 10;

    return score < 0 ? 0 : score;
  }

  private calFillScore(repliedAnswer: string, correctAnswer: string): number {
    for (let i = 0; i < correctAnswer.length; i++)
      if (repliedAnswer.at(i) !== correctAnswer.at(i)) return 0;

    return 10;
  }

  private async replyOne(
    question: Question,
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
    question.adjustedDifficulty =
      (question.scoringTotal / question.attempCount + question.difficulty) / 2;
    await this.questionAccess.save(question);

    const replyEntity = new ReplyEntity();
    replyEntity.questionId = question.id;
    replyEntity.userId = userId;
    replyEntity.score = score;
    replyEntity.repliedAnswer = repliedAnswer;
    await this.replyAccess.save(replyEntity);
  }

  public async reply(data: PostReplyRequest) {
    const user = await this.userService.getUser();
    if (user === null) throw new UnauthorizedError('User not found');

    const questionIds = data.map((d) => d.questionId);
    const questions = await this.questionAccess.find({
      where: { id: In(questionIds) },
    });
    Promise.all(
      data.map((d) => {
        const question = questions.find((q) => q.id === d.questionId);
        if (!question)
          throw new Error(`Question with id ${d.questionId} not found`);
        this.replyOne(question, d.repliedAnswer, user.id);
      })
    );

    // TODO: use loader to optimize the above code to avoid N+1 query problem when updating group question difficulty
    // const groupIds = new Set(questions.flatMap(q => q.parentId ? [q.parentId] : []))
    // for (const groupId of groupIds) {
    //   const groupQuestions = await this.questionAccess.find({ where: { parentId: groupId } });
    //   const difficulty = groupQuestions.reduce((acc, q) => acc + q.adjustedDifficulty, 0) / groupQuestions.length;
    //   const groupQuestion = await this.questionAccess.findOneOrFail({ where: { id: groupId } });
    //   groupQuestion.adjustedDifficulty = difficulty;
    //   await this.questionAccess.save(groupQuestion);
    // }
  }
}
