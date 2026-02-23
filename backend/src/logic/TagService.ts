import { inject, injectable } from 'inversify';
import { TagAccess } from 'src/dao/TagAccess';
import { PostTagRequest, PostTagResponse } from 'src/model/api/Tag';
import { TagEntity } from 'src/model/entity/TagEntity';

/**
 * Service class for Tag
 */
@injectable()
export class TagService {
  @inject(TagAccess)
  private readonly tagAccess!: TagAccess;

  public async createTag(data: PostTagRequest): Promise<PostTagResponse> {
    const tagEntity = new TagEntity();
    tagEntity.subjectId = data.subjectId;
    tagEntity.name = data.name;

    return await this.tagAccess.save(tagEntity);
  }
}
