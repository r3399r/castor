import { bindings } from 'src/bindings';
import { QuestionService } from 'src/logic/QuestionService';
import {
  GetQuestionAdaptiveParams,
  GetQuestionParams,
  PostQuestionRequest,
} from 'src/model/api/Question';
import { BadRequestError } from 'src/model/error';
import { LambdaEvent } from 'src/model/Lambda';

let event: LambdaEvent;
let service: QuestionService;

export default async (lambdaEvent: LambdaEvent) => {
  event = lambdaEvent;
  service = bindings.get(QuestionService);

  switch (event.resource) {
    case '/api/question':
      return await questionDefault();
    case '/api/question/{uuid}':
      return await questionUuid();
    case '/api/question/adaptive':
      return await questionAdaptive();
  }

  throw new BadRequestError('unexpected resource');
};

const questionDefault = async () => {
  switch (event.httpMethod) {
    case 'GET':
      return await service.getQuestionList(
        event.queryStringParameters as GetQuestionParams | null
      );
    case 'POST':
      if (event.body === null)
        throw new BadRequestError('body should not be empty');

      return await service.createQuestion(
        JSON.parse(event.body) as PostQuestionRequest
      );
  }

  throw new Error('unexpected httpMethod');
};

const questionUuid = async () => {
  if (event.pathParameters === null)
    throw new BadRequestError('pathParameters should not be empty');
  switch (event.httpMethod) {
    case 'GET':
      return await service.getQuestionByUuid(event.pathParameters.uuid);
  }

  throw new Error('unexpected httpMethod');
};

const questionAdaptive = async () => {
  switch (event.httpMethod) {
    case 'GET':
      return await service.getAdaptiveQuestion(
        event.queryStringParameters as GetQuestionAdaptiveParams | null
      );
  }

  throw new Error('unexpected httpMethod');
};
