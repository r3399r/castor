import {
  GetSubjectConceptGroupResponse,
  GetSubjectExamResponse,
  GetSubjectResponse,
  GetSubjectTagResponse,
  PostSubjectRequest,
  PostSubjectResponse,
} from '@castor/shared';
import { inject, injectable } from 'inversify';
import { ConceptGroupAccess } from 'src/dao/ConceptGroupAccess';
import { ExamAccess } from 'src/dao/ExamAccess';
import { SubjectAccess } from 'src/dao/SubjectAccess';
import { TagAccess } from 'src/dao/TagAccess';
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
  @inject(ConceptGroupAccess)
  private readonly conceptGroupAccess!: ConceptGroupAccess;
  @inject(TagAccess)
  private readonly tagAccess!: TagAccess;

  public async getSubjects(): Promise<GetSubjectResponse> {
    return await this.subjectAccess.find({
      relations: {
        filterOptions: {
          dimension: true,
        },
      },
    });
  }

  public async getExamsById(id: string): Promise<GetSubjectExamResponse> {
    return await this.examAccess.find({
      where: { subject: { id: Number(id) } },
    });
  }

  public async getConceptGroupsById(
    id: string
  ): Promise<GetSubjectConceptGroupResponse> {
    return await this.conceptGroupAccess.find({
      where: { subjectId: Number(id) },
      relations: {
        concepts: true,
      },
    });
  }

  public async getTagsById(id: string): Promise<GetSubjectTagResponse> {
    return await this.tagAccess.find({ where: { subjectId: Number(id) } });
  }

  public async createSubject(
    subject: PostSubjectRequest
  ): Promise<PostSubjectResponse> {
    const subjectEntity = new SubjectEntity();
    subjectEntity.name = subject.name;
    subjectEntity.sortOrder = 0;

    return await this.subjectAccess.save(subjectEntity);
  }
}
