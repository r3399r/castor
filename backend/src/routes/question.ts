import { bindings } from 'src/bindings';
import { QuestionService } from 'src/logic/QuestionService';
import {
  GetQuestionAdaptiveParams,
  GetQuestionParams,
  GetQuestionTagParams,
  PostQuestionRequest,
  PostQuestionStartRequest,
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
    case '/api/question/start':
      return await questionStart();
    case '/api/question/complete':
      return await questionComplete();
    case '/api/question/tag':
      return await questionTag();
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

const questionStart = async () => {
  switch (event.httpMethod) {
    case 'POST':
      if (event.body === null)
        throw new BadRequestError('body should not be empty');

      return await service.startQuestion(
        JSON.parse(event.body) as PostQuestionStartRequest
      );
  }

  throw new Error('unexpected httpMethod');
};

const questionComplete = async () => {
  switch (event.httpMethod) {
    case 'POST':
      if (event.body === null)
        throw new BadRequestError('body should not be empty');

    // return await service.completeQuestion(
    //   JSON.parse(event.body) as PostQuestionCompleteRequest
    // );
  }

  throw new Error('unexpected httpMethod');
};

const questionTag = async () => {
  switch (event.httpMethod) {
    case 'GET':
      return await service.getAllTags(
        event.queryStringParameters as GetQuestionTagParams | null
      );
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
