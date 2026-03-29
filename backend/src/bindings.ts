import { SQS } from 'aws-sdk';
import { Container } from 'inversify';
import { CategoryAccess } from './dao/CategoryAccess';
import { ConceptAccess } from './dao/ConceptAccess';
import { ConceptGroupAccess } from './dao/ConceptGroupAccess';
import { DbAccess } from './dao/DbAccess';
import { ExamAccess } from './dao/ExamAccess';
import { QuestionAccess } from './dao/QuestionAccess';
import { QuestionMinorAccess } from './dao/QuestionMinorAccess';
import { ReplyAccess } from './dao/ReplyAccess';
import { SubjectAccess } from './dao/SubjectAccess';
import { TagAccess } from './dao/TagAccess';
import { UserAccess } from './dao/UserAccess';
import { UserStatsAccess } from './dao/UserStatsAccess';
import { CategoryService } from './logic/CategoryService';
import { ConceptService } from './logic/ConceptService';
import { ExamService } from './logic/ExamService';
import { QuestionService } from './logic/QuestionService';
import { ReplyService } from './logic/ReplyService';
import { StatsService } from './logic/StatsService';
import { SubjectService } from './logic/SubjectService';
import { TagService } from './logic/TagService';
import { UserService } from './logic/UserService';
import { CategoryEntity } from './model/entity/CategoryEntity';
import { ConceptEntity } from './model/entity/ConceptEntity';
import { ConceptGroupEntity } from './model/entity/ConceptGroupEntity';
import { ExamEntity } from './model/entity/ExamEntity';
import { QuestionEntity } from './model/entity/QuestionEntity';
import { QuestionMinorEntity } from './model/entity/QuestionMinorEntity';
import { ReplyEntity } from './model/entity/ReplyEntity';
import { SubjectEntity } from './model/entity/SubjectEntity';
import { TagEntity } from './model/entity/TagEntity';
import { UserEntity } from './model/entity/UserEntity';
import { UserStatsEntity } from './model/entity/UserStatsEntity';
import { Database, dbEntitiesBindingId } from './utils/Database';

const container: Container = new Container();

container.bind(Database).toSelf().inSingletonScope();

// db entities
container.bind<Function>(dbEntitiesBindingId).toConstantValue(QuestionEntity);
container
  .bind<Function>(dbEntitiesBindingId)
  .toConstantValue(QuestionMinorEntity);
container.bind<Function>(dbEntitiesBindingId).toConstantValue(UserEntity);
container.bind<Function>(dbEntitiesBindingId).toConstantValue(ReplyEntity);
container.bind<Function>(dbEntitiesBindingId).toConstantValue(CategoryEntity);
container.bind<Function>(dbEntitiesBindingId).toConstantValue(TagEntity);
container.bind<Function>(dbEntitiesBindingId).toConstantValue(UserStatsEntity);
container.bind<Function>(dbEntitiesBindingId).toConstantValue(ConceptEntity);
container
  .bind<Function>(dbEntitiesBindingId)
  .toConstantValue(ConceptGroupEntity);
container.bind<Function>(dbEntitiesBindingId).toConstantValue(ExamEntity);
container.bind<Function>(dbEntitiesBindingId).toConstantValue(SubjectEntity);

// db access
container.bind(DbAccess).toSelf();
container.bind(QuestionAccess).toSelf();
container.bind(QuestionMinorAccess).toSelf();
container.bind(ReplyAccess).toSelf();
container.bind(UserAccess).toSelf();
container.bind(CategoryAccess).toSelf();
container.bind(UserStatsAccess).toSelf();
container.bind(TagAccess).toSelf();
container.bind(ConceptAccess).toSelf();
container.bind(ConceptGroupAccess).toSelf();
container.bind(ExamAccess).toSelf();
container.bind(SubjectAccess).toSelf();

// service
container.bind(QuestionService).toSelf();
container.bind(UserService).toSelf();
container.bind(CategoryService).toSelf();
container.bind(StatsService).toSelf();
container.bind(ExamService).toSelf();
container.bind(SubjectService).toSelf();
container.bind(ConceptService).toSelf();
container.bind(TagService).toSelf();
container.bind(ReplyService).toSelf();

// AWS
container.bind(SQS).toDynamicValue(() => new SQS());

export { container as bindings };
