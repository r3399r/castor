import { bindings } from 'src/bindings';
import { UserService } from 'src/logic/UserService';
import { BadRequestError } from 'src/model/error';
import { LambdaEvent } from 'src/model/Lambda';

let event: LambdaEvent;
let service: UserService;

export default async (lambdaEvent: LambdaEvent) => {
  event = lambdaEvent;
  service = bindings.get(UserService);

  switch (event.resource) {
    case '/api/user/stats':
      return await userStats();
    case '/api/user/sync':
      return await userSync();
    case '/api/user/history':
      return await userHistory();
  }

  throw new BadRequestError('unexpected resource');
};

const userStats = async () => {
  switch (event.httpMethod) {
    case 'GET':
      return await service.getUserStats();
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

const userHistory = async () => {
  switch (event.httpMethod) {
    case 'GET':
      return await service.getUserHistory();
  }

  throw new Error('unexpected httpMethod');
};
