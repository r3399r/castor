import { inject, injectable } from 'inversify';
import { ExamAccess } from 'src/dao/ExamAccess';
import { PostExamRequest, PostExamResponse } from 'src/model/api/Exam';
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
    examEntity.subjectId = exam.subjectId;
    examEntity.name = exam.name;

    return await this.examAccess.save(examEntity);
  }
}
