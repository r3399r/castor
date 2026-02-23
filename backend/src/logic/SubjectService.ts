import { inject, injectable } from 'inversify';
import { SubjectAccess } from 'src/dao/SubjectAccess';
import {
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

  public async getSubjects(): Promise<GetSubjectResponse> {
    return await this.subjectAccess.find();
  }

  public async createSubject(
    subject: PostSubjectRequest
  ): Promise<PostSubjectResponse> {
    const subjectEntity = new SubjectEntity();
    subjectEntity.name = subject.name;

    return await this.subjectAccess.save(subjectEntity);
  }
}
