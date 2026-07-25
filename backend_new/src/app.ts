import { Hono } from 'hono';
import { toErrorResponse } from 'src/lib/errorResponse';
import { adminAuth } from 'src/middleware/adminAuth';
import { transaction } from 'src/middleware/transaction';
import { category } from 'src/routes/category';
import { info } from 'src/routes/info';
import { subject } from 'src/routes/subject';

export const app = new Hono()
  .route('/api/info', info)
  .use('/api/category/*', adminAuth)
  .use('/api/category/*', transaction)
  .route('/api/category', category)
  .use('/api/subject/*', adminAuth)
  .use('/api/subject/*', transaction)
  .route('/api/subject', subject)
  .onError((err, c) => {
    console.error(err);
    const { status, body } = toErrorResponse(err);

    return c.json(body, status);
  });
