import { SQS } from 'aws-sdk';
import { bindings } from 'src/bindings';
import { DbAccess } from 'src/dao/DbAccess';
import { GatewayTimeoutError } from 'src/model/error/5XX/GatewayTimeoutError';
import { LambdaContext, LambdaEvent, LambdaOutput } from 'src/model/Lambda';
import category from 'src/routes/category';
import question from 'src/routes/question';
import user from 'src/routes/user';
import { errorOutput, initLambda, successOutput } from 'src/utils/LambdaHelper';

const apiProcess = async (event: LambdaEvent): Promise<LambdaOutput> => {
  const db = bindings.get(DbAccess);
  let output: LambdaOutput;
  await db.startTransaction();
  initLambda(event);

  try {
    let res: unknown;

    const resource = event.resource.split('/')[2];
    switch (resource) {
      case 'question':
        res = await question(event);
        break;
      case 'user':
        res = await user(event);
        break;
      case 'category':
        res = await category(event);
        break;
    }

    output = successOutput(res);
    await db.commitTransaction();
  } catch (e) {
    console.error(e);
    await db.rollbackTransaction();

    output = errorOutput(e);
  } finally {
    await db.cleanup();
  }

  return output;
};

export const api = async (
  event: LambdaEvent,
  context: LambdaContext
): Promise<LambdaOutput> => {
  console.log(event);

  const startTime = Date.now();

  const output = await Promise.race([
    apiProcess(event),
    new Promise<LambdaOutput>((resolve) =>
      setTimeout(
        () => resolve(errorOutput(new GatewayTimeoutError('Gateway Timeout'))),
        context.getRemainingTimeInMillis() - 2000
      )
    ),
  ]);

  // logger sqs
  const sqs = bindings.get(SQS);
  try {
    await sqs
      .sendMessage({
        MessageBody: JSON.stringify({
          project: process.env.PROJECT ?? '',
          resource: event.resource,
          path: event.path,
          httpMethod: event.httpMethod,
          queryStringParameters: event.queryStringParameters
            ? JSON.stringify(event.queryStringParameters)
            : null,
          body: event.body,
          elapsedTime: Date.now() - startTime,
          statusCode: output.statusCode,
          dateRequested: new Date().toISOString(),
          version: event.headers
            ? (event.headers['x-api-version'] ?? null)
            : null,
          ip: event.requestContext.identity.sourceIp,
        }),
        QueueUrl: process.env.LOGGER_QUEUE_URL ?? '',
      })
      .promise();
  } catch (e) {
    console.error(e);
  }

  return output;
};
