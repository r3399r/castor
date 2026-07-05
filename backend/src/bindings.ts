import { SQS } from 'aws-sdk';
import { Container } from 'inversify';
import { CategoryAccess } from './dao/CategoryAccess';
import { ConceptAccess } from './dao/ConceptAccess';
import { ConceptGroupAccess } from './dao/ConceptGroupAccess';
import { DbAccess } from './dao/DbAccess';
import { ExamAccess } from './dao/ExamAccess';
import { PendingReplyAccess } from './dao/PendingReplyAccess';
import { QuestionAccess } from './dao/QuestionAccess';
import { ReplyAccess } from './dao/ReplyAccess';
import { SubjectAccess } from './dao/SubjectAccess';
import { TagAccess } from './dao/TagAccess';
import { UserAccess } from './dao/UserAccess';
import { UserConceptStatAccess } from './dao/UserConceptStatAccess';
import { UserStatHistoryAccess } from './dao/UserStatHistoryAccess';
import { CategoryService } from './logic/CategoryService';
import { ConceptService } from './logic/ConceptService';
import { ExamService } from './logic/ExamService';
import { FacebookService } from './logic/FacebookService';
import { HousekeepService } from './logic/HousekeepService';
import { InfoService } from './logic/InfoService';
import { PreviewService } from './logic/PreviewService';
import { QuestionService } from './logic/QuestionService';
import { ReplyService } from './logic/ReplyService';
import { SubjectService } from './logic/SubjectService';
import { TagService } from './logic/TagService';
import { UserService } from './logic/UserService';
import { CategoryEntity } from './model/entity/CategoryEntity';
import { ConceptEntity } from './model/entity/ConceptEntity';
import { ConceptGroupEntity } from './model/entity/ConceptGroupEntity';
import { ExamEntity } from './model/entity/ExamEntity';
import { FilterDimensionEntity } from './model/entity/FilterDimensionEntity';
import { FilterOptionEntity } from './model/entity/FilterOptionEntity';
import { PendingReplyEntity } from './model/entity/PendingReplyEntity';
import { QuestionEntity } from './model/entity/QuestionEntity';
import { ReplyEntity } from './model/entity/ReplyEntity';
import { SubjectEntity } from './model/entity/SubjectEntity';
import { TagEntity } from './model/entity/TagEntity';
import { UserConceptStatEntity } from './model/entity/UserConceptStatEntity';
import { UserEntity } from './model/entity/UserEntity';
import { UserStatHistoryEntity } from './model/entity/UserStatHistoryEntity';
import { Database, dbEntitiesBindingId } from './utils/Database';

const container: Container = new Container();

container.bind(Database).toSelf().inSingletonScope();

// db entities
container.bind<Function>(dbEntitiesBindingId).toConstantValue(QuestionEntity);
container.bind<Function>(dbEntitiesBindingId).toConstantValue(UserEntity);
container.bind<Function>(dbEntitiesBindingId).toConstantValue(ReplyEntity);
container.bind<Function>(dbEntitiesBindingId).toConstantValue(CategoryEntity);
container.bind<Function>(dbEntitiesBindingId).toConstantValue(TagEntity);
container.bind<Function>(dbEntitiesBindingId).toConstantValue(ConceptEntity);
container
  .bind<Function>(dbEntitiesBindingId)
  .toConstantValue(ConceptGroupEntity);
container.bind<Function>(dbEntitiesBindingId).toConstantValue(ExamEntity);
container.bind<Function>(dbEntitiesBindingId).toConstantValue(SubjectEntity);
container
  .bind<Function>(dbEntitiesBindingId)
  .toConstantValue(FilterDimensionEntity);
container
  .bind<Function>(dbEntitiesBindingId)
  .toConstantValue(FilterOptionEntity);
container
  .bind<Function>(dbEntitiesBindingId)
  .toConstantValue(UserConceptStatEntity);
container
  .bind<Function>(dbEntitiesBindingId)
  .toConstantValue(PendingReplyEntity);
container
  .bind<Function>(dbEntitiesBindingId)
  .toConstantValue(UserStatHistoryEntity);

// db access
container.bind(DbAccess).toSelf();
container.bind(QuestionAccess).toSelf();
container.bind(ReplyAccess).toSelf();
container.bind(UserAccess).toSelf();
container.bind(CategoryAccess).toSelf();
container.bind(TagAccess).toSelf();
container.bind(ConceptAccess).toSelf();
container.bind(ConceptGroupAccess).toSelf();
container.bind(ExamAccess).toSelf();
container.bind(SubjectAccess).toSelf();
container.bind(UserConceptStatAccess).toSelf();
container.bind(UserStatHistoryAccess).toSelf();
container.bind(PendingReplyAccess).toSelf();

// service
container.bind(QuestionService).toSelf();
container.bind(UserService).toSelf();
container.bind(CategoryService).toSelf();
container.bind(FacebookService).toSelf();
container.bind(HousekeepService).toSelf();
container.bind(ExamService).toSelf();
container.bind(SubjectService).toSelf();
container.bind(ConceptService).toSelf();
container.bind(TagService).toSelf();
container.bind(ReplyService).toSelf();
container.bind(PreviewService).toSelf();
container.bind(InfoService).toSelf();

// AWS
container.bind(SQS).toDynamicValue(() => new SQS());

export { container as bindings };
