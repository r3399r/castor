import type { LambdaContext, LambdaEvent } from 'hono/aws-lambda';
import { createMiddleware } from 'hono/factory';
import { rememberApiOrigin } from 'src/lib/apiOrigin';

export type ApiOriginEnv = {
  Bindings: { event: LambdaEvent; lambdaContext: LambdaContext };
};

/**
 * Records the API Gateway stage URL this request arrived on, so the
 * ECPay callbacks can point at it. See src/lib/apiOrigin.ts for why this
 * is read off the event instead of injected by CloudFormation.
 *
 * Built from `apiId` and `stage` rather than from `requestContext.
 * domainName`, even though the latter is the actual host: these requests
 * reach us through CloudFront, which sets the Host header to whatever its
 * origin is configured as, so `domainName` describes the CDN's
 * configuration while `apiId` is the API's own identity and cannot be
 * rewritten in transit.
 *
 * Runs before next() because the value has to be in place before a route
 * builds an ECPay order. `c.env.event` is only populated by
 * hono/aws-lambda's handle(), so this is a no-op under local dev
 * (@hono/node-server) and leaves the configured fallback in charge --
 * the same shape as requestLogger beside it.
 */
export const apiOrigin = createMiddleware<ApiOriginEnv>(async (c, next) => {
  const event = c.env?.event;
  // `resource` is the marker for an APIGatewayProxyEvent: an HTTP API v2
  // or ALB event has no stage worth naming here.
  if (event && 'resource' in event) {
    const { apiId, stage } = event.requestContext;
    const region = process.env.AWS_REGION;
    if (apiId && stage && region)
      rememberApiOrigin(`https://${apiId}.execute-api.${region}.amazonaws.com/${stage}`);
  }

  await next();
});
