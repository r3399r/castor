import { Hono } from 'hono';
import { toErrorResponse } from 'src/lib/errorResponse';
import { adminAuth } from 'src/middleware/adminAuth';
import { transaction } from 'src/middleware/transaction';
import { category } from 'src/routes/category';
import { concept } from 'src/routes/concept';
import { conceptGroup } from 'src/routes/conceptGroup';
import { exam } from 'src/routes/exam';
import { info } from 'src/routes/info';
import { subject } from 'src/routes/subject';
import { tag } from 'src/routes/tag';

export const app = new Hono()
  .route('/api/info', info)
  .use('/api/category/*', adminAuth)
  .use('/api/category/*', transaction)
  .route('/api/category', category)
  .use('/api/subject/*', adminAuth)
  .use('/api/subject/*', transaction)
  .route('/api/subject', subject)
  .use('/api/exam/*', adminAuth)
  .use('/api/exam/*', transaction)
  .route('/api/exam', exam)
  .use('/api/tag/*', adminAuth)
  .use('/api/tag/*', transaction)
  .route('/api/tag', tag)
  .use('/api/concept-group/*', adminAuth)
  .use('/api/concept-group/*', transaction)
  .route('/api/concept-group', conceptGroup)
  .use('/api/concept/*', adminAuth)
  .use('/api/concept/*', transaction)
  .route('/api/concept', concept)
  .onError((err, c) => {
    console.error(err);
    const { status, body } = toErrorResponse(err);

    return c.json(body, status);
  });
