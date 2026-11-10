/**
 * The API Gateway origin this function is actually reached on, learned
 * from the invocation event rather than configured at deploy time.
 *
 * Why learned and not an environment variable: putting
 * `https://${RestApi}.execute-api...` in ApiFunction's Environment makes
 * the function depend on the API, while SAM already makes the API depend
 * on the function -- `AWS::Serverless::Api` generates a definition body
 * with this function's ARN embedded in the Lambda integration. The two
 * together are a cycle, and CloudFormation rejects the entire stack:
 *
 *   Circular dependency between resources: [CloudFrontDistribution,
 *   RestApiStage, RestApi, ApiFunctionAnyRoutePermissionStage,
 *   Route53RecordSet, ApiFunction, RestApiDeployment...]
 *
 * Nothing in the template can break that cycle while still naming the
 * generated API id, because the id does not exist until the API is
 * created. The invocation event carries it for free, and it is the
 * stronger value anyway: it is the origin a request genuinely arrived
 * on, not a second copy of the API's identity that can drift from it.
 *
 * The honest alternative is an API Gateway custom domain
 * (`AWS::ApiGateway::DomainName` + an ACM certificate), which would make
 * the callback origin a fixed name with no reference to the generated id
 * at all. That is the right long-term answer and a separate change: it
 * needs a certificate and a DNS record, neither of which exists yet.
 */
let observed: string | undefined;

export const rememberApiOrigin = (origin: string): void => {
  observed = origin;
};

/** Undefined until the first API Gateway invocation of this container. */
export const knownApiOrigin = (): string | undefined => observed;

/**
 * For tests only.
 *
 * This value is process-wide and outlives a single request on purpose --
 * it is the same for every invocation of a container. That also means one
 * test can leave it set for the next, so a suite that cares which origin
 * the ECPay callbacks carry clears it first.
 */
export const forgetApiOrigin = (): void => {
  observed = undefined;
};
