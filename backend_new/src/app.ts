import { Hono } from 'hono';
import { toErrorResponse } from 'src/lib/errorResponse';
import { transaction } from 'src/middleware/transaction';
import { category } from 'src/routes/category';
import { info } from 'src/routes/info';

export const app = new Hono()
  .route('/api/info', info)
  .use('/api/category/*', transaction)
  .route('/api/category', category)
  .onError((err, c) => {
    console.error(err);
    const { status, body } = toErrorResponse(err);

    return c.json(body, status);
  });
