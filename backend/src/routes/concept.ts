import { bindings } from 'src/bindings';
import { ConceptService } from 'src/logic/ConceptService';
import {
  PostConceptGroupRequest,
  PostConceptRequest,
} from 'src/model/api/Concept';
import { BadRequestError } from 'src/model/error';
import { LambdaEvent } from 'src/model/Lambda';

let event: LambdaEvent;
let service: ConceptService;

export default async (lambdaEvent: LambdaEvent) => {
  event = lambdaEvent;
  service = bindings.get(ConceptService);

  switch (event.resource) {
    case '/api/concept':
      return await conceptDefault();
    case '/api/concept/group':
      return await conceptGroup();
  }

  throw new BadRequestError('unexpected resource');
};

const conceptDefault = async () => {
  switch (event.httpMethod) {
    case 'POST':
      if (event.body === null)
        throw new BadRequestError('body should not be empty');

      return await service.createConcept(
        JSON.parse(event.body) as PostConceptRequest
      );
  }

  throw new Error('unexpected httpMethod');
};

const conceptGroup = async () => {
  switch (event.httpMethod) {
    case 'POST':
      if (event.body === null)
        throw new BadRequestError('body should not be empty');

      return await service.createConceptGroup(
        JSON.parse(event.body) as PostConceptGroupRequest
      );
  }

  throw new Error('unexpected httpMethod');
};
