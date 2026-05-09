import {
  PostConceptGroupRequest,
  PostConceptGroupResponse,
  PostConceptRequest,
  PostConceptResponse,
} from '@castor/shared';
import { inject, injectable } from 'inversify';
import { ConceptAccess } from 'src/dao/ConceptAccess';
import { ConceptGroupAccess } from 'src/dao/ConceptGroupAccess';
import { ConceptEntity } from 'src/model/entity/ConceptEntity';
import { ConceptGroupEntity } from 'src/model/entity/ConceptGroupEntity';

/**
 * Service class for Concept
 */
@injectable()
export class ConceptService {
  @inject(ConceptAccess)
  private readonly conceptAccess!: ConceptAccess;

  @inject(ConceptGroupAccess)
  private readonly conceptGroupAccess!: ConceptGroupAccess;

  public async createConcept(
    data: PostConceptRequest
  ): Promise<PostConceptResponse> {
    const conceptEntity = new ConceptEntity();
    conceptEntity.conceptGroupId = data.conceptGroupId;
    conceptEntity.name = data.name;
    conceptEntity.numberOfQuestions = 0;

    return await this.conceptAccess.save(conceptEntity);
  }

  public async createConceptGroup(
    data: PostConceptGroupRequest
  ): Promise<PostConceptGroupResponse> {
    const conceptGroupEntity = new ConceptGroupEntity();
    conceptGroupEntity.subjectId = data.subjectId;
    conceptGroupEntity.name = data.name;

    return await this.conceptGroupAccess.save(conceptGroupEntity);
  }
}
