import { inject, injectable } from 'inversify';
import { QuestionAccess } from 'src/dao/QuestionAccess';
import { QuestionMinorAccess } from 'src/dao/QuestionMinorAccess';
import { PostQuestionRequest } from 'src/model/api/Question';
import { QuestionEntity } from 'src/model/entity/QuestionEntity';
import { QuestionMinorEntity } from 'src/model/entity/QuestionMinorEntity';

/**
 * Service class for User
 */
@injectable()
export class QuestionService {
  @inject(QuestionAccess)
  private readonly questionAccess!: QuestionAccess;
  @inject(QuestionMinorAccess)
  private readonly questionMinorAccess!: QuestionMinorAccess;

  public async createQuestion(data: PostQuestionRequest) {
    const questionEntity = new QuestionEntity();
    questionEntity.content = data.content;
    questionEntity.isFreeResponse = data.isFreeResponse;
    questionEntity.discussionUrl = data.discussionUrl;

    const newQuestionEntity = await this.questionAccess.save(questionEntity);

    const minor: QuestionMinorEntity[] = [];
    for (const m of data.minor) {
      const questionMinorEntity = new QuestionMinorEntity();
      questionMinorEntity.questionId = newQuestionEntity.id;
      questionMinorEntity.type = m.type;
      questionMinorEntity.orderIndex = m.orderIndex;
      questionMinorEntity.options = m.options;
      questionMinorEntity.answer = m.answer;

      const newMinorEntity =
        await this.questionMinorAccess.save(questionMinorEntity);
      minor.push(newMinorEntity);
    }

    return {
      ...newQuestionEntity,
      minor,
    };
  }
}
