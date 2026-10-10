import { and, desc, eq, gt } from 'drizzle-orm';
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
