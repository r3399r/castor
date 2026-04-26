import { bindings } from 'src/bindings';
import { TagService } from 'src/logic/TagService';
import { PostTagRequest } from 'src/model/api/Tag';
import { BadRequestError } from 'src/model/error';
import { LambdaEvent } from 'src/model/Lambda';

let event: LambdaEvent;
let service: TagService;

export default async (lambdaEvent: LambdaEvent) => {
  event = lambdaEvent;
  service = bindings.get(TagService);

  switch (event.resource) {
    case '/api/tag':
      return await tagDefault();
  }

  throw new BadRequestError('unexpected resource');
};

const tagDefault = async () => {
  switch (event.httpMethod) {
    case 'POST':
      if (event.body === null)
        throw new BadRequestError('body should not be empty');

      return await service.createTag(JSON.parse(event.body) as PostTagRequest);
  }

  throw new Error('unexpected httpMethod');
};
