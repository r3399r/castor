import { Concept } from 'src/model/entity/ConceptEntity';
import { ConceptGroup } from 'src/model/entity/ConceptGroupEntity';

export type PostConceptResponse = Concept;

export type PostConceptRequest = {
  conceptGroupId: number;
  name: string;
};

export type PostConceptGroupResponse = ConceptGroup;

export type PostConceptGroupRequest = {
  subjectId: number;
  name: string;
};
