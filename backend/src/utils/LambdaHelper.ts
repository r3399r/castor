import { HttpError } from 'src/model/error/HttpError';
import { LambdaOutput } from 'src/model/Lambda';

export const credentialSymbol = Symbol('credential');

export const successOutput = <T>(res: T): LambdaOutput => ({
  statusCode: 200,
  headers: {
    'Access-Control-Allow-Origin': '*', // Required for CORS support to work,
  },
  body: typeof res === 'string' ? res : JSON.stringify(res),
});

export const errorOutput = (e: unknown): LambdaOutput => {
  const error: HttpError = e as HttpError;

  return {
    statusCode: error.status ?? 500,
    headers: {
      'Access-Control-Allow-Origin': '*', // Required for CORS support to work
    },
    body: JSON.stringify({
      status: error.status,
      name: error.name,
      message: error.message,
      code: error.code,
    }),
  };
};

// export const initLambda = (event?: LambdaEvent): void => {
//   bind<string>(credentialSymbol, event?.headers?.['x-credential'] ?? 'xx');
// };

// const bind = <T>(bindingId: symbol, values: T): void => {
//   if (bindings.isBound(bindingId) === false)
//     bindings.bind<T>(bindingId).toConstantValue(values);
//   else bindings.rebind<T>(bindingId).toConstantValue(values);
// };
