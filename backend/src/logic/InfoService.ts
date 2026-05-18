import { GetInfoResponse } from '@castor/shared';
import { inject, injectable } from 'inversify';
import { CategoryAccess } from 'src/dao/CategoryAccess';
import { ExamAccess } from 'src/dao/ExamAccess';
import { QuestionAccess } from 'src/dao/QuestionAccess';
import { SubjectAccess } from 'src/dao/SubjectAccess';
import { UserAccess } from 'src/dao/UserAccess';

/**
 * Service class for Info
 */
@injectable()
export class InfoService {
  @inject(CategoryAccess)
  private readonly categoryAccess!: CategoryAccess;
  @inject(SubjectAccess)
  private readonly subjectAccess!: SubjectAccess;
  @inject(ExamAccess)
  private readonly examAccess!: ExamAccess;
  @inject(QuestionAccess)
  private readonly questionAccess!: QuestionAccess;
  @inject(UserAccess)
  private readonly userAccess!: UserAccess;

  public async getInfo(): Promise<GetInfoResponse> {
    const categoryCount = await this.categoryAccess.count();
    const subjectCount = await this.subjectAccess.count();
    const examCount = await this.examAccess.count();
    const questionCount = await this.questionAccess.count();
    const userCount = await this.userAccess.count();

    return {
      categoryCount,
      subjectCount,
      examCount,
      questionCount,
      userCount,
    };
  }
}
