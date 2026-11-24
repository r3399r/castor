import { createMiddleware } from 'hono/factory';
import { ActiveSubscription, findEntitledSubscription } from 'src/lib/subscription';
import { isBetaMode } from 'src/lib/beta';
import { ForbiddenError } from 'src/model/error';
import { UserEnv } from './requireUser';

/**
 * `subscription` is possibly undefined because beta mode grants access
 * with no period behind it -- see src/lib/beta.ts. Nothing downstream
 * reads it today; a route that starts to needs to handle its absence
 * rather than assume the gate implies a row.
 */
export type SubscriptionEnv = UserEnv & {
  Variables: UserEnv['Variables'] & { subscription: ActiveSubscription | undefined };
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
 * Mounted on /api/analysis/* as a prefix gate, and on the single route
 * PUT /api/wrong-question/:id/note -- a path gate, because the rest of
 * that resource is free. Also covered by
 * regression/routes/subscription.test.ts against a stand-in route.
 *
 * Under BETA_MODE this passes everyone through. The lookup still runs,
 * so a real subscriber's period is still published to the context --
 * beta adds access, it does not replace what is there.
 */
export const requireSubscription = createMiddleware<SubscriptionEnv>(async (c, next) => {
  const user = c.get('user');
  const subscription = await findEntitledSubscription(c.get('db'), user.id);
  if (subscription === undefined && !isBetaMode())
    throw new ForbiddenError('Subscription required', 'SUBSCRIPTION_REQUIRED');

  c.set('subscription', subscription);
  await next();
});
