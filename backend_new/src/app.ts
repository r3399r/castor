import { Hono } from 'hono';
import { toErrorResponse } from 'src/lib/errorResponse';
import { adminAuth, requireAdmin } from 'src/middleware/adminAuth';
import { requestLogger } from 'src/middleware/requestLogger';
import { requireSubscription } from 'src/middleware/requireSubscription';
import { requireUser } from 'src/middleware/requireUser';
import { transaction } from 'src/middleware/transaction';
import { analysis } from 'src/routes/analysis';
import { category } from 'src/routes/category';
import { charityCategory } from 'src/routes/charityCategory';
import { charityOrganization } from 'src/routes/charityOrganization';
import { concept } from 'src/routes/concept';
import { conceptGroup } from 'src/routes/conceptGroup';
import { donation } from 'src/routes/donation';
import { donationBatch } from 'src/routes/donationBatch';
import { exam } from 'src/routes/exam';
import { filterDimension } from 'src/routes/filterDimension';
import { filterOption } from 'src/routes/filterOption';
import { guardian } from 'src/routes/guardian';
import { info } from 'src/routes/info';
import { payment } from 'src/routes/payment';
import { question } from 'src/routes/question';
import { reply } from 'src/routes/reply';
import { species } from 'src/routes/species';
import { store } from 'src/routes/store';
import { subject } from 'src/routes/subject';
import { subscription } from 'src/routes/subscription';
import { tag } from 'src/routes/tag';
import { user } from 'src/routes/user';
import { wallet } from 'src/routes/wallet';
import { webhook } from 'src/routes/webhook';
import { wrongQuestion } from 'src/routes/wrongQuestion';

export const app = new Hono()
  .use('*', requestLogger)
  // Bound to the two paths that read the database, not /api/info/*, so the
  // health check at /api/info stays answerable with the database down.
  .use('/api/info/stats', transaction)
  .use('/api/info/popular', transaction)
  .use('/api/info/donation', transaction)
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
  // The partner foundations. Same posture as the catalog groups above:
  // adminAuth gates the writes and leaves GETs open, which here is
  // intended rather than tolerated -- a foundation's name, blurb and
  // website are exactly what the public transparency page publishes.
  // The seven public-interest categories. Read-only (the rows are seeded
  // and joined to the egg species by `code`), and open like the
  // organisation reads beside it: these names are printed on the public
  // transparency page. adminAuth is mounted for symmetry with that
  // sibling, and gates nothing today because there is no write to gate --
  // which is the point, since a write added later is covered by default.
  .use('/api/charity-category/*', adminAuth)
  .use('/api/charity-category/*', transaction)
  .route('/api/charity-category', charityCategory)
  .use('/api/charity-organization/*', adminAuth)
  .use('/api/charity-organization/*', transaction)
  .route('/api/charity-organization', charityOrganization)
  .use('/api/user/*', transaction)
  .route('/api/user', user)
  // The caller's own subscription. Behind requireUser but never behind
  // requireSubscription -- a non-subscriber has to be able to ask.
  .use('/api/subscription/*', transaction)
  .use('/api/subscription/*', requireUser)
  .route('/api/subscription', subscription)
  // Starting or replacing a paid agreement: a signed-in person asking to
  // be charged.
  .use('/api/payment/*', transaction)
  .use('/api/payment/*', requireUser)
  .route('/api/payment', payment)
  // Payment-provider callbacks, and the one group in this app with no
  // authentication middleware at all -- the caller is ECPay's server,
  // which has no Firebase token. Authenticity is checked inside the
  // routes, from the CheckMacValue signature. It has its own prefix so
  // that "unauthenticated" is a property of the prefix instead of an
  // exception carved out of /api/payment, where the next route added
  // would inherit it by accident.
  .use('/api/webhook/*', transaction)
  .route('/api/webhook', webhook)
  // Subscriber-only. requireSubscription reads the user row requireUser
  // resolves, so the order of these three matters.
  .use('/api/analysis/*', transaction)
  .use('/api/analysis/*', requireUser)
  .use('/api/analysis/*', requireSubscription)
  .route('/api/analysis', analysis)
  .use('/api/question/*', adminAuth)
  .use('/api/question/*', transaction)
  .use('/api/question/adaptive', requireUser)
  // requireAdmin on top of the group's adminAuth, which only gates
  // mutating methods -- this is a GET, so adminAuth alone would leave it
  // open to any signed-in user. It returns the full extraction
  // instruction and the subject's entire concept list.
  .use('/api/question/image/prompt', requireAdmin)
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
  // Read-only catalog view for the admin UI. requireAdmin, not adminAuth:
  // adminAuth lets GETs through, which on a GET-only route is no gate.
  .use('/api/species/*', transaction)
  .use('/api/species/*', requireAdmin)
  .route('/api/species', species)
  .use('/api/store/*', transaction)
  .use('/api/store/*', requireUser)
  .route('/api/store', store)
  .use('/api/guardian/*', transaction)
  .use('/api/guardian/*', requireUser)
  .route('/api/guardian', guardian)
  // A signed-in person spending one maxed spirit, and reading back what
  // they have already given. Next to /api/guardian because that is the
  // entitlement it draws on. The *public* record of the same donations
  // lives under /api/info, which has no Authorization forwarded to it.
  .use('/api/donation/*', transaction)
  .use('/api/donation/*', requireUser)
  .route('/api/donation', donation)
  // The payout side of the same feature. requireAdmin, not adminAuth:
  // adminAuth lets GETs through, and GET /unpaid names which user is owed
  // what -- the public view of these payouts is /api/info/donation, which
  // shows batches and never users.
  .use('/api/donation-batch/*', transaction)
  .use('/api/donation-batch/*', requireAdmin)
  .route('/api/donation-batch', donationBatch)
  .onError((err, c) => {
    console.error(err);
    const { status, body } = toErrorResponse(err);

    return c.json(body, status);
  });
