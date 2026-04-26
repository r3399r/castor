import { ConceptGroup } from 'src/model/entity/ConceptGroupEntity';
import { Exam } from 'src/model/entity/ExamEntity';
import { Subject } from 'src/model/entity/SubjectEntity';
import { Tag } from 'src/model/entity/TagEntity';

export type GetSubjectResponse = Subject[];

export type PostSubjectResponse = Subject;

export type PostSubjectRequest = {
  name: string;
};

export type GetSubjectIdExamResponse = Exam[];

export type GetSubjectIdConceptGroupResponse = ConceptGroup[];

export type GetSubjectIdTagResponse = Tag[];
