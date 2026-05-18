import { bindings } from 'src/bindings';
import { InfoService } from 'src/logic/InfoService';
import { BadRequestError } from 'src/model/error';
import { LambdaEvent } from 'src/model/Lambda';

let event: LambdaEvent;
let service: InfoService;

export default async (lambdaEvent: LambdaEvent) => {
  event = lambdaEvent;
  service = bindings.get(InfoService);

  switch (event.resource) {
    case '/api/info':
      return await infoDefault();
  }

  throw new BadRequestError('unexpected resource');
};

const infoDefault = async () => {
  switch (event.httpMethod) {
    case 'GET':
      return await service.getInfo();
  }

  throw new Error('unexpected httpMethod');
};
