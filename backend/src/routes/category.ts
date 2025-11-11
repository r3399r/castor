import { bindings } from 'src/bindings';
import { CategoryService } from 'src/logic/CategoryService';
import { BadRequestError } from 'src/model/error';
import { LambdaEvent } from 'src/model/Lambda';

let event: LambdaEvent;
let service: CategoryService;

export default async (lambdaEvent: LambdaEvent) => {
  event = lambdaEvent;
  service = bindings.get(CategoryService);

  switch (event.resource) {
    case '/api/category':
      return await categoryDefault();
    case '/api/category/user':
      return await categoryUser();
  }

  throw new BadRequestError('unexpected resource');
};

const categoryDefault = async () => {
  switch (event.httpMethod) {
    case 'GET':
      return await service.getCategory();
  }

  throw new Error('unexpected httpMethod');
};

const categoryUser = async () => {
  switch (event.httpMethod) {
    case 'GET':
      return await service.getCategoryOfUser();
  }

  throw new Error('unexpected httpMethod');
};
