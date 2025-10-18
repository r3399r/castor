import { SQS } from 'aws-sdk';
import { Container } from 'inversify';
import { CategoryAccess } from './dao/CategoryAccess';
import { DbAccess } from './dao/DbAccess';
import { QuestionAccess } from './dao/QuestionAccess';
import { QuestionMinorAccess } from './dao/QuestionMinorAccess';
import { ReplyAccess } from './dao/ReplyAccess';
import { UserAccess } from './dao/UserAccess';
import { QuestionService } from './logic/QuestionService';
import { UserService } from './logic/UserService';
import { CategoryEntity } from './model/entity/CategoryEntity';
import { QuestionEntity } from './model/entity/QuestionEntity';
import { QuestionMinorEntity } from './model/entity/QuestionMinorEntity';
import { ReplyEntity } from './model/entity/ReplyEntity';
import { TagEntity } from './model/entity/TagEntity';
import { UserEntity } from './model/entity/UserEntity';
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

// db access
container.bind(DbAccess).toSelf();
container.bind(QuestionAccess).toSelf();
container.bind(QuestionMinorAccess).toSelf();
container.bind(ReplyAccess).toSelf();
container.bind(UserAccess).toSelf();
container.bind(CategoryAccess).toSelf();

// service
container.bind(QuestionService).toSelf();
container.bind(UserService).toSelf();

// AWS
container.bind(SQS).toDynamicValue(() => new SQS());

export { container as bindings };
