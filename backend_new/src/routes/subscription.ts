import { Hono } from 'hono';
import { findActiveSubscription, listSubscriptionHistory } from 'src/lib/subscription';
import { UserEnv } from 'src/middleware/requireUser';

/**
 * The signed-in caller's own subscription.
 *
 * Both routes sit behind requireUser but deliberately NOT behind
 * requireSubscription: these are the endpoints a non-subscriber is
 * expected to call. Gating them would mean the only way to discover you
 * are not subscribed is to be refused, which is the wrong shape for a
 * page that has to render an upgrade prompt.
 */
export const subscription = new Hono<UserEnv>()
  /**
   * Current status. Returns 200 with active:false rather than a 403 --
   * "you are not subscribed" is the successful answer to this question.
   */
  .get('/me', async (c) => {
    const user = c.get('user');
    console.log(`GET /api/subscription/me userId=${user.id}`);

    const active = await findActiveSubscription(c.get('db'), user.id);

    return c.json({
      active: active !== undefined,
      plan: active?.plan ?? null,
      expiresAt: active?.currentPeriodEnd ?? null,
    });
  })
  /**
   * Every period the user has had, newest first -- renewals, lapses and
   * cancellations included, since each is its own row.
   */
  .get('/history', async (c) => {
    const user = c.get('user');
    console.log(`GET /api/subscription/history userId=${user.id}`);

    return c.json(await listSubscriptionHistory(c.get('db'), user.id));
  });
