import { PostPreviewRequest } from '@castor/shared';
import { bindings } from 'src/bindings';
import { PreviewService } from 'src/logic/PreviewService';
import { BadRequestError } from 'src/model/error';
import { LambdaEvent } from 'src/model/Lambda';

let event: LambdaEvent;
let service: PreviewService;

export default async (lambdaEvent: LambdaEvent) => {
  event = lambdaEvent;
  service = bindings.get(PreviewService);

  switch (event.resource) {
    case '/api/preview':
      return await previewDefault();
  }

  throw new BadRequestError('unexpected resource');
};

const previewDefault = async () => {
  switch (event.httpMethod) {
    case 'POST':
      if (event.body === null)
        throw new BadRequestError('body should not be empty');

      return await service.preview(
        JSON.parse(event.body) as PostPreviewRequest
      );
  }

  throw new Error('unexpected httpMethod');
};
