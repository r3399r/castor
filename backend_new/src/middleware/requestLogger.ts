import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { createMiddleware } from 'hono/factory';
import type { LambdaContext, LambdaEvent } from 'hono/aws-lambda';

export type RequestLoggerEnv = {
  Bindings: { event: LambdaEvent; lambdaContext: LambdaContext };
};

const sqs = new SQSClient({});

/**
 * Same downstream consumer/queue as the legacy backend's SQS request logger
 * (backend/src/lambda/api.ts) and spica -- best-effort, never fails the
 * actual response. c.env.event is only populated by hono/aws-lambda's
 * handle(), so this is a no-op under local dev (@hono/node-server) and for
 * non-REST-API event shapes (only APIGatewayProxyEvent carries `resource`
 * and `requestContext.identity.sourceIp`).
 */
export const requestLogger = createMiddleware<RequestLoggerEnv>(
  async (c, next) => {
    const startTime = Date.now();
    await next();

    const event = c.env?.event;
    if (!event || !('resource' in event)) return;

    try {
      await sqs.send(
        new SendMessageCommand({
          QueueUrl: process.env.LOGGER_QUEUE_URL ?? '',
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
            statusCode: c.res.status,
            dateRequested: new Date().toISOString(),
            version: event.headers ? (event.headers['x-api-version'] ?? null) : null,
            ip: event.requestContext.identity.sourceIp,
          }),
        })
      );
    } catch (e) {
      console.error(e);
    }
  }
);
