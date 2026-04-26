import { bindings } from 'src/bindings';
import { CategoryService } from 'src/logic/CategoryService';
import { PostCategoryRequest } from 'src/model/api/Category';
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
    case '/api/category/{id}/subject':
      return await categoryIdSubject();
  }

  throw new BadRequestError('unexpected resource');
};

const categoryDefault = async () => {
  switch (event.httpMethod) {
    case 'GET':
      return await service.getCategory();
    case 'POST':
      if (event.body === null)
        throw new BadRequestError('body should not be empty');

      return await service.createCategory(
        JSON.parse(event.body) as PostCategoryRequest
      );
  }

  throw new Error('unexpected httpMethod');
};

const categoryIdSubject = async () => {
  if (event.pathParameters === null)
    throw new BadRequestError('pathParameters should not be empty');
  switch (event.httpMethod) {
    case 'GET':
      return await service.getSubjectsByCategoryId(event.pathParameters.id);
  }

  throw new Error('unexpected httpMethod');
};
