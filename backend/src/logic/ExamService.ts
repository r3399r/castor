import { PostExamRequest, PostExamResponse } from '@castor/shared';
import { inject, injectable } from 'inversify';
import { ExamAccess } from 'src/dao/ExamAccess';
import { ExamEntity } from 'src/model/entity/ExamEntity';

/**
 * Service class for Exam
 */
@injectable()
export class ExamService {
  @inject(ExamAccess)
  private readonly examAccess!: ExamAccess;

  public async createExam(exam: PostExamRequest): Promise<PostExamResponse> {
    const examEntity = new ExamEntity();
    examEntity.name = exam.name;

    return await this.examAccess.save(examEntity);
  }
}
