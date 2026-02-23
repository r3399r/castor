import { bindings } from 'src/bindings';
import { SubjectService } from 'src/logic/SubjectService';
import { PostSubjectRequest } from 'src/model/api/Subject';
import { BadRequestError } from 'src/model/error';
import { LambdaEvent } from 'src/model/Lambda';

let event: LambdaEvent;
let service: SubjectService;

export default async (lambdaEvent: LambdaEvent) => {
  event = lambdaEvent;
  service = bindings.get(SubjectService);

  switch (event.resource) {
    case '/api/subject':
      return await subjectDefault();
  }

  throw new BadRequestError('unexpected resource');
};

const subjectDefault = async () => {
  switch (event.httpMethod) {
    case 'GET':
      return await service.getSubjects();
    case 'POST':
      if (event.body === null)
        throw new BadRequestError('body should not be empty');

      return await service.createSubject(
        JSON.parse(event.body) as PostSubjectRequest
      );
  }

  throw new Error('unexpected httpMethod');
};
