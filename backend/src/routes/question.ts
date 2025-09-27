import { BadRequestError } from 'src/model/error';
import { LambdaEvent } from 'src/model/Lambda';

let event: LambdaEvent;

export default async (lambdaEvent: LambdaEvent) => {
  event = lambdaEvent;

  switch (event.resource) {
    case '/api/question':
      return await authDefault();
  }

  throw new BadRequestError('unexpected resource');
};

const authDefault = async () => {
  switch (event.httpMethod) {
    case 'GET':
      return Date.now();
  }

  throw new Error('unexpected httpMethod');
};
