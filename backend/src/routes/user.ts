import { bindings } from 'src/bindings';
import { UserService } from 'src/logic/UserService';
import { GetUserDetailParams } from 'src/model/api/User';
import { BadRequestError } from 'src/model/error';
import { LambdaEvent } from 'src/model/Lambda';

let event: LambdaEvent;
let service: UserService;

export default async (lambdaEvent: LambdaEvent) => {
  event = lambdaEvent;
  service = bindings.get(UserService);

  switch (event.resource) {
    case '/api/user/detail':
      return await userDetail();
    case '/api/user/sync':
      return await userSync();
  }

  throw new BadRequestError('unexpected resource');
};

const userDetail = async () => {
  switch (event.httpMethod) {
    case 'GET':
      return await service.getUserDetail(
        event.queryStringParameters as GetUserDetailParams | null
      );
  }

  throw new Error('unexpected httpMethod');
};

const userSync = async () => {
  switch (event.httpMethod) {
    case 'POST':
      return await service.syncFirebaseUser();
  }

  throw new Error('unexpected httpMethod');
};
