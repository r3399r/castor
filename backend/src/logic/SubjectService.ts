import { inject, injectable } from 'inversify';
import { ExamAccess } from 'src/dao/ExamAccess';
import { SubjectAccess } from 'src/dao/SubjectAccess';
import {
  GetSubjectIdExamResponse,
  GetSubjectResponse,
  PostSubjectRequest,
  PostSubjectResponse,
} from 'src/model/api/Subject';
import { SubjectEntity } from 'src/model/entity/SubjectEntity';

/**
 * Service class for Subject
 */
@injectable()
export class SubjectService {
  @inject(SubjectAccess)
  private readonly subjectAccess!: SubjectAccess;
  @inject(ExamAccess)
  private readonly examAccess!: ExamAccess;

  public async getSubjects(): Promise<GetSubjectResponse> {
    return await this.subjectAccess.find();
  }

  public async getExamsById(id: string): Promise<GetSubjectIdExamResponse> {
    return await this.examAccess.find({
      where: { subjectId: Number(id) },
    });
  }

  public async createSubject(
    subject: PostSubjectRequest
  ): Promise<PostSubjectResponse> {
    const subjectEntity = new SubjectEntity();
    subjectEntity.name = subject.name;

    return await this.subjectAccess.save(subjectEntity);
  }
}
