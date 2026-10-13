import { and, desc, eq, gt, inArray } from 'drizzle-orm';
import { userSubscriptionTable } from 'src/db/schema';
import { TransactionEnv } from 'src/middleware/transaction';

type Db = TransactionEnv['Variables']['db'];

export const SUBSCRIPTION_STATUS_ACTIVE = 'active';

export type ActiveSubscription = {
  plan: string;
  currentPeriodEnd: Date;
};

/**
 * The caller's live subscription, or undefined when they have none.
 *
 * Two conditions, not one: the row must still say 'active' *and* its
 * period must not have elapsed. Checking the end date as well means a
 * lapsed subscription stops granting access on its own, with no sweeper
 * job to run and nothing to go wrong if that job is ever missed -- the
 * status column only has to be corrected when a provider webhook says so,
 * and a late webhook cannot silently extend access.
 *
 * The table permits at most one active row per user (enforced by the
 * generated activeUserId column, see db/table/user_subscription.sql), so
 * there is no ordering to decide between candidates here.
 */
export const findActiveSubscription = async (
  db: Db,
  userId: number
): Promise<ActiveSubscription | undefined> => {
  const [row] = await db
    .select({
      plan: userSubscriptionTable.plan,
      currentPeriodEnd: userSubscriptionTable.currentPeriodEnd,
    })
    .from(userSubscriptionTable)
    .where(
      and(
        eq(userSubscriptionTable.userId, userId),
        eq(userSubscriptionTable.status, SUBSCRIPTION_STATUS_ACTIVE),
        gt(userSubscriptionTable.currentPeriodEnd, new Date())
      )
    )
    .limit(1);

  return row;
};

export type SubscriptionPeriod = {
  id: number;
  plan: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
};

/**
 * Every subscription period the user has had, newest first.
 *
 * Ordered by createdAt rather than by period start so that a correction
 * inserted after the fact still reads as the latest thing that happened,
 * which is what someone reading a history wants to see. Walks
 * idx_user_created.
 */
export const listSubscriptionHistory = async (
  db: Db,
  userId: number
): Promise<SubscriptionPeriod[]> =>
  db
    .select({
      id: userSubscriptionTable.id,
      plan: userSubscriptionTable.plan,
      status: userSubscriptionTable.status,
      currentPeriodStart: userSubscriptionTable.currentPeriodStart,
      currentPeriodEnd: userSubscriptionTable.currentPeriodEnd,
    })
    .from(userSubscriptionTable)
    .where(eq(userSubscriptionTable.userId, userId))
    .orderBy(desc(userSubscriptionTable.createdAt));

export const SUBSCRIPTION_STATUS_CANCELLED = 'cancelled';

/** Default length of a period granted by hand, in days. */
export const DEFAULT_GRANT_DAYS = 30;

/**
 * Live subscriptions for a set of users, keyed by user id.
 *
 * The single-user lookup repeated per row would be one query per user on
 * a listing page; this keeps it to one for the page.
 */
export const findActiveSubscriptions = async (
  db: Db,
  userIds: number[]
): Promise<Map<number, ActiveSubscription>> => {
  if (userIds.length === 0) return new Map();

  const rows = await db
    .select({
      userId: userSubscriptionTable.userId,
      plan: userSubscriptionTable.plan,
      currentPeriodEnd: userSubscriptionTable.currentPeriodEnd,
    })
    .from(userSubscriptionTable)
    .where(
      and(
        inArray(userSubscriptionTable.userId, userIds),
        eq(userSubscriptionTable.status, SUBSCRIPTION_STATUS_ACTIVE),
        gt(userSubscriptionTable.currentPeriodEnd, new Date())
      )
    );

  return new Map(
    rows.map((r) => [r.userId, { plan: r.plan, currentPeriodEnd: r.currentPeriodEnd }])
  );
};

/**
 * Turns a user's subscription on or off, idempotently.
 *
 * Granting when one is already live is a no-op rather than a second row:
 * the table allows only one active period per user, so inserting blindly
 * would hit unique_active_subscription. Revoking marks the period
 * cancelled instead of deleting it, because the row is the history --
 * deleting would erase the fact that they ever subscribed.
 *
 * Returns the resulting state, so the caller never has to re-read to
 * find out what happened.
 */
export const setSubscription = async (
  db: Db,
  userId: number,
  active: boolean,
  { plan = 'monthly', days = DEFAULT_GRANT_DAYS }: { plan?: string; days?: number } = {}
): Promise<ActiveSubscription | undefined> => {
  const existing = await db
    .select({
      id: userSubscriptionTable.id,
      plan: userSubscriptionTable.plan,
      currentPeriodEnd: userSubscriptionTable.currentPeriodEnd,
    })
    .from(userSubscriptionTable)
    .where(
      and(
        eq(userSubscriptionTable.userId, userId),
        eq(userSubscriptionTable.status, SUBSCRIPTION_STATUS_ACTIVE)
      )
    )
    .limit(1);
  const current = existing[0];

  if (!active) {
    if (current !== undefined)
      await db
        .update(userSubscriptionTable)
        .set({ status: SUBSCRIPTION_STATUS_CANCELLED, updatedAt: new Date() })
        .where(eq(userSubscriptionTable.id, current.id));
    return undefined;
  }

  // Already live -- including a row whose period has elapsed but which
  // nothing has swept yet. Extending it would be a different operation
  // from "make sure this user has access", which is what this is.
  if (current !== undefined && current.currentPeriodEnd > new Date())
    return { plan: current.plan, currentPeriodEnd: current.currentPeriodEnd };

  // A lapsed-but-still-'active' row has to be closed first, or the new
  // period collides with it on unique_active_subscription.
  if (current !== undefined)
    await db
      .update(userSubscriptionTable)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(eq(userSubscriptionTable.id, current.id));

  const now = new Date();
  const currentPeriodEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  await db.insert(userSubscriptionTable).values({
    userId,
    plan,
    status: SUBSCRIPTION_STATUS_ACTIVE,
    currentPeriodStart: now,
    currentPeriodEnd,
    createdAt: now,
  });

  return { plan, currentPeriodEnd };
};
