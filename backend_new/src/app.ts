import { Hono } from 'hono';
import { toErrorResponse } from 'src/lib/errorResponse';
import { adminAuth } from 'src/middleware/adminAuth';
import { requireUser } from 'src/middleware/requireUser';
import { transaction } from 'src/middleware/transaction';
import { category } from 'src/routes/category';
import { concept } from 'src/routes/concept';
import { conceptGroup } from 'src/routes/conceptGroup';
import { exam } from 'src/routes/exam';
import { filterDimension } from 'src/routes/filterDimension';
import { filterOption } from 'src/routes/filterOption';
import { info } from 'src/routes/info';
import { question } from 'src/routes/question';
import { reply } from 'src/routes/reply';
import { subject } from 'src/routes/subject';
import { tag } from 'src/routes/tag';
import { user } from 'src/routes/user';
import { wallet } from 'src/routes/wallet';
import { wrongQuestion } from 'src/routes/wrongQuestion';

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
  .use('/api/filter-dimension/*', adminAuth)
  .use('/api/filter-dimension/*', transaction)
  .route('/api/filter-dimension', filterDimension)
  .use('/api/filter-option/*', adminAuth)
  .use('/api/filter-option/*', transaction)
  .route('/api/filter-option', filterOption)
  .use('/api/user/*', transaction)
  .route('/api/user', user)
  .use('/api/question/*', adminAuth)
  .use('/api/question/*', transaction)
  .use('/api/question/adaptive', requireUser)
  .route('/api/question', question)
  .use('/api/reply/*', transaction)
  .use('/api/reply/*', requireUser)
  .route('/api/reply', reply)
  .use('/api/wrong-question/*', transaction)
  .use('/api/wrong-question/*', requireUser)
  .route('/api/wrong-question', wrongQuestion)
  .use('/api/wallet/*', transaction)
  .use('/api/wallet/*', requireUser)
  .route('/api/wallet', wallet)
  .onError((err, c) => {
    console.error(err);
    const { status, body } = toErrorResponse(err);

    return c.json(body, status);
  });
