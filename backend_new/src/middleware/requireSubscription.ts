import { createMiddleware } from 'hono/factory';
import { ActiveSubscription, findActiveSubscription } from 'src/lib/subscription';
import { ForbiddenError } from 'src/model/error';
import { UserEnv } from './requireUser';

export type SubscriptionEnv = UserEnv & {
  Variables: UserEnv['Variables'] & { subscription: ActiveSubscription };
};

/**
 * Gate for subscriber-only routes. Must run after requireUser, whose
 * resolved user row it reads -- the two are deliberately separate checks:
 * "who is asking" and "may they have this" fail differently and deserve
 * different statuses.
 *
 * 403 with SUBSCRIPTION_REQUIRED rather than a bare 403, because the
 * frontend has to tell "you need to subscribe" (show the upgrade prompt)
 * apart from "something broke" (show an error). 401 would be wrong: the
 * caller is authenticated, they just lack entitlement, and a 401 would
 * send the client off to re-authenticate and land back here.
 *
 * Nothing is mounted behind this yet -- it ships with the subscription
 * feature so the first gated route can simply use it. It is covered by
 * regression/routes/subscription.test.ts against a stand-in route.
 */
export const requireSubscription = createMiddleware<SubscriptionEnv>(async (c, next) => {
  const user = c.get('user');
  const subscription = await findActiveSubscription(c.get('db'), user.id);
  if (subscription === undefined)
    throw new ForbiddenError('Subscription required', 'SUBSCRIPTION_REQUIRED');

  c.set('subscription', subscription);
  await next();
});
