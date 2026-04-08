import { bindings } from 'src/bindings';
import { ReplyService } from 'src/logic/ReplyService';
import { GetReplyParams, PostReplyRequest } from 'src/model/api/Reply';
import { BadRequestError } from 'src/model/error';
import { LambdaEvent } from 'src/model/Lambda';

let event: LambdaEvent;
let service: ReplyService;

export default async (lambdaEvent: LambdaEvent) => {
  event = lambdaEvent;
  service = bindings.get(ReplyService);

  switch (event.resource) {
    case '/api/reply':
      return await replyDefault();
  }

  throw new BadRequestError('unexpected resource');
};

const replyDefault = async () => {
  switch (event.httpMethod) {
    case 'GET':
      return await service.getReplyList(
        event.queryStringParameters as GetReplyParams | null
      );
    case 'POST':
      if (event.body === null)
        throw new BadRequestError('body should not be empty');

      return await service.reply(JSON.parse(event.body) as PostReplyRequest);
  }

  throw new Error('unexpected httpMethod');
};
