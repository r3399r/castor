import { SQS } from 'aws-sdk';
import { Container } from 'inversify';
import { CategoryAccess } from './dao/CategoryAccess';
import { ConceptAccess } from './dao/ConceptAccess';
import { DbAccess } from './dao/DbAccess';
import { QuestionAccess } from './dao/QuestionAccess';
import { QuestionMinorAccess } from './dao/QuestionMinorAccess';
import { ReplyAccess } from './dao/ReplyAccess';
import { TagAccess } from './dao/TagAccess';
import { UserAccess } from './dao/UserAccess';
import { UserStatsAccess } from './dao/UserStatsAccess';
import { CategoryService } from './logic/CategoryService';
import { QuestionService } from './logic/QuestionService';
import { StatsService } from './logic/StatsService';
import { UserService } from './logic/UserService';
import { CategoryEntity } from './model/entity/CategoryEntity';
import { ConceptEntity } from './model/entity/ConceptEntity';
import { ConceptGroupEntity } from './model/entity/ConceptGroupEntity';
import { QuestionEntity } from './model/entity/QuestionEntity';
import { QuestionMinorEntity } from './model/entity/QuestionMinorEntity';
import { ReplyEntity } from './model/entity/ReplyEntity';
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

// service
container.bind(QuestionService).toSelf();
container.bind(UserService).toSelf();
container.bind(CategoryService).toSelf();
container.bind(StatsService).toSelf();

// AWS
container.bind(SQS).toDynamicValue(() => new SQS());

export { container as bindings };
