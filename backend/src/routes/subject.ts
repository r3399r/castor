import { PostSubjectRequest } from '@castor/shared';
import { bindings } from 'src/bindings';
import { SubjectService } from 'src/logic/SubjectService';
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
    case '/api/subject/{id}/exam':
      return await subjectIdExam();
    case '/api/subject/{id}/concept-group':
      return await subjectIdConceptGroup();
    case '/api/subject/{id}/tag':
      return await subjectIdTag();
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

const subjectIdExam = async () => {
  if (event.pathParameters === null)
    throw new BadRequestError('pathParameters should not be empty');
  switch (event.httpMethod) {
    case 'GET':
      return await service.getExamsById(event.pathParameters.id);
  }

  throw new Error('unexpected httpMethod');
};

const subjectIdConceptGroup = async () => {
  if (event.pathParameters === null)
    throw new BadRequestError('pathParameters should not be empty');
  switch (event.httpMethod) {
    case 'GET':
      return await service.getConceptGroupsById(event.pathParameters.id);
  }

  throw new Error('unexpected httpMethod');
};

const subjectIdTag = async () => {
  if (event.pathParameters === null)
    throw new BadRequestError('pathParameters should not be empty');
  switch (event.httpMethod) {
    case 'GET':
      return await service.getTagsById(event.pathParameters.id);
  }

  throw new Error('unexpected httpMethod');
};
