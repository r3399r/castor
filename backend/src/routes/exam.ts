import { PostExamRequest } from '@castor/shared';
import { bindings } from 'src/bindings';
import { ExamService } from 'src/logic/ExamService';
import { BadRequestError } from 'src/model/error';
import { LambdaEvent } from 'src/model/Lambda';

let event: LambdaEvent;
let service: ExamService;

export default async (lambdaEvent: LambdaEvent) => {
  event = lambdaEvent;
  service = bindings.get(ExamService);

  switch (event.resource) {
    case '/api/exam':
      return await examDefault();
  }

  throw new BadRequestError('unexpected resource');
};

const examDefault = async () => {
  switch (event.httpMethod) {
    case 'POST':
      if (event.body === null)
        throw new BadRequestError('body should not be empty');

      return await service.createExam(
        JSON.parse(event.body) as PostExamRequest
      );
  }

  throw new Error('unexpected httpMethod');
};
