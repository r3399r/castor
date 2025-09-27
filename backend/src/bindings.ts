import { SQS } from 'aws-sdk';
import { Container } from 'inversify';

const container: Container = new Container();

// AWS
container.bind(SQS).toDynamicValue(() => new SQS());

export { container as bindings };
