import { Hono } from 'hono';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from 'src/app';
import { closeDb, getDb } from 'src/db/client';
import { userSubscriptionTable, userTable } from 'src/db/schema';
import { toErrorResponse } from 'src/lib/errorResponse';
import { requireSubscription } from 'src/middleware/requireSubscription';
import { requireUser } from 'src/middleware/requireUser';
import { transaction } from 'src/middleware/transaction';

vi.mock('src/lib/firebaseAdmin', () => ({ verifyIdToken: vi.fn(), verifyIdTokenUid: vi.fn() }));
import { verifyIdToken, verifyIdTokenUid } from 'src/lib/firebaseAdmin';
import { ADMIN_EMAILS } from 'src/middleware/adminAuth';

const FIXTURE_UID = 'subscription-fixture-uid';

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);
const daysAhead = (days: number) => new Date(Date.now() + days * DAY_MS);

/**
 * A stand-in for the first route that will sit behind the gate.
 *
 * requireSubscription ships before anything uses it, so without this it
 * would go out completely unexercised. Built with the same middleware
 * order and the same onError as the real app, so what it proves carries
 * over when a real route is mounted.
 */
const gatedApp = new Hono()
  .use('/gated/*', transaction)
  .use('/gated/*', requireUser)
  .use('/gated/*', requireSubscription)
  .get('/gated/thing', (c) => c.json({ ok: true }))
  .onError((err, c) => {
    const { status, body } = toErrorResponse(err);
    return c.json(body, status);
  });

const clearTables = async () => {
  const db = getDb();
  // Subscriptions first -- the foreign key points at user.
  await db.delete(userSubscriptionTable);
  await db.delete(userTable);
};

const seedUser = async () => {
  const [{ insertId }] = await getDb()
    .insert(userTable)
    .values({ firebaseUid: FIXTURE_UID, email: `${FIXTURE_UID}@example.com`, createdAt: new Date() });
  return insertId;
};

const grant = async (
  userId: number,
  { status = 'active', endsInDays = 30, plan = 'monthly' } = {}
) => {
  await getDb().insert(userSubscriptionTable).values({
    userId,
    plan,
    status,
    currentPeriodStart: daysAgo(1),
    currentPeriodEnd: daysAhead(endsInDays),
    createdAt: new Date(),
  });
};

describe('subscription', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    await clearTables();
  });

  afterAll(async () => {
    await clearTables();
    await closeDb();
  });

  describe('GET /api/subscription/me', () => {
    it('rejects with 401 when there is no valid identity', async () => {
      vi.mocked(verifyIdTokenUid).mockResolvedValue(null);
      const res = await app.request('/api/subscription/me');
      expect(res.status).toBe(401);
    });

    // 200, not 403: a non-subscriber asking "am I subscribed?" is the
    // case this endpoint exists for, and the locked UI is drawn from it.
    it('answers 200 with active:false when there is no subscription', async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/subscription/me');
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ active: false, plan: null, expiresAt: null });
    });

    it('reports the plan and expiry when subscribed', async () => {
      const userId = await seedUser();
      await grant(userId, { plan: 'annual' });
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/subscription/me');
      const body = (await res.json()) as { active: boolean; plan: string; expiresAt: string };
      expect(body.active).toBe(true);
      expect(body.plan).toBe('annual');
      expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('reports inactive once the period has elapsed', async () => {
      const userId = await seedUser();
      await grant(userId, { endsInDays: -1 });
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/subscription/me');
      expect(await res.json()).toMatchObject({ active: false });
    });
  });

  describe('GET /api/subscription/history', () => {
    it('returns an empty list for a user who never subscribed', async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/subscription/history');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });

    // The point of one-row-per-period: a renewal must not erase what came
    // before it.
    it('lists every past period alongside the current one, newest first', async () => {
      const userId = await seedUser();
      await grant(userId, { status: 'expired', plan: 'monthly' });
      await grant(userId, { status: 'cancelled', plan: 'monthly' });
      await grant(userId, { status: 'active', plan: 'annual' });
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/subscription/history');
      const body = (await res.json()) as { plan: string; status: string }[];

      expect(body).toHaveLength(3);
      expect(body[0]).toMatchObject({ plan: 'annual', status: 'active' });
      expect(body.map((r) => r.status).sort()).toEqual(['active', 'cancelled', 'expired']);
    });

    it('does not leak another user\'s periods', async () => {
      const userId = await seedUser();
      await grant(userId);
      const [{ insertId: otherId }] = await getDb()
        .insert(userTable)
        .values({ firebaseUid: 'other-uid', email: 'other@example.com', createdAt: new Date() });
      await grant(otherId, { plan: 'annual' });
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/subscription/history');
      const body = (await res.json()) as { plan: string }[];
      expect(body).toHaveLength(1);
      expect(body[0].plan).toBe('monthly');
    });
  });

  describe('requireSubscription', () => {
    it('rejects with 403 SUBSCRIPTION_REQUIRED when the user has no subscription', async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await gatedApp.request('/gated/thing');
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' });
    });

    it('admits a user with an active subscription', async () => {
      const userId = await seedUser();
      await grant(userId);
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await gatedApp.request('/gated/thing');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    });

    // The check is status AND period, so a row nothing has swept yet must
    // stop granting access the moment it lapses.
    it('rejects a row still marked active whose period has ended', async () => {
      const userId = await seedUser();
      await grant(userId, { endsInDays: -1 });
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await gatedApp.request('/gated/thing');
      expect(res.status).toBe(403);
    });

    it('admits a cancelled subscription until its paid period ends', async () => {
      const userId = await seedUser();
      await grant(userId, { status: 'cancelled' });
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await gatedApp.request('/gated/thing');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    });

    it('rejects a cancelled subscription after its paid period ends', async () => {
      const userId = await seedUser();
      await grant(userId, { status: 'cancelled', endsInDays: -1 });
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await gatedApp.request('/gated/thing');
      expect(res.status).toBe(403);
    });

    it('checks identity before entitlement', async () => {
      vi.mocked(verifyIdTokenUid).mockResolvedValue(null);
      const res = await gatedApp.request('/gated/thing');
      expect(res.status).toBe(401);
    });
  });

  describe('user_subscription table', () => {
    // The generated active_user_id column is what stops a retried payment
    // webhook creating two live subscriptions for one person.
    it('refuses a second active subscription for the same user', async () => {
      const userId = await seedUser();
      await grant(userId);
      await expect(grant(userId, { plan: 'annual' })).rejects.toThrow();
    });

    it('allows many non-active periods to coexist with one active period', async () => {
      const userId = await seedUser();
      await grant(userId, { status: 'expired' });
      await grant(userId, { status: 'cancelled' });
      await grant(userId, { status: 'past_due' });
      await grant(userId, { status: 'active' });

      const rows = await getDb().select().from(userSubscriptionTable);
      expect(rows).toHaveLength(4);
      expect(rows.filter((r) => r.status === 'active')).toHaveLength(1);
    });
  });

  describe('PUT /api/user/:id/subscription', () => {
    const putSubscription = (userId: number, body: unknown) =>
      app.request(`/api/user/${userId}/subscription`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

    const asAdmin = () => vi.mocked(verifyIdToken).mockResolvedValue(ADMIN_EMAILS[0]);

    // The whole point of the gate: a user must not be able to hand
    // themselves paid features.
    it('refuses a caller who is not an admin', async () => {
      const userId = await seedUser();
      vi.mocked(verifyIdToken).mockResolvedValue(null);

      const res = await putSubscription(userId, { active: true });
      expect(res.status).toBe(401);

      const rows = await getDb().select().from(userSubscriptionTable);
      expect(rows).toHaveLength(0);
    });

    it('404s for an unknown user', async () => {
      asAdmin();
      const res = await putSubscription(999_999, { active: true });
      expect(res.status).toBe(404);
    });

    it('grants a subscription and reports the resulting state', async () => {
      const userId = await seedUser();
      asAdmin();

      const res = await putSubscription(userId, { active: true });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { active: boolean; plan: string; expiresAt: string };
      expect(body.active).toBe(true);
      expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());

      // And the gate now actually lets them through.
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);
      expect((await gatedApp.request('/gated/thing')).status).toBe(200);
    });

    it('revokes a subscription, and the gate closes again', async () => {
      const userId = await seedUser();
      await grant(userId);
      asAdmin();

      const res = await putSubscription(userId, { active: false });
      expect((await res.json()) as { active: boolean }).toMatchObject({ active: false });

      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);
      expect((await gatedApp.request('/gated/thing')).status).toBe(403);
    });

    // Revoking keeps the row -- it is the history -- rather than deleting.
    it('keeps the revoked period as history', async () => {
      const userId = await seedUser();
      await grant(userId);
      asAdmin();
      await putSubscription(userId, { active: false });

      const rows = await getDb().select().from(userSubscriptionTable);
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('cancelled');
    });

    // Clicking the button twice must not fail or create a second period:
    // the table only permits one active row per user.
    it('is idempotent when granting twice', async () => {
      const userId = await seedUser();
      asAdmin();

      await putSubscription(userId, { active: true });
      const second = await putSubscription(userId, { active: true });
      expect(second.status).toBe(200);

      const rows = await getDb().select().from(userSubscriptionTable);
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('active');
    });

    it('is idempotent when revoking twice', async () => {
      const userId = await seedUser();
      await grant(userId);
      asAdmin();

      await putSubscription(userId, { active: false });
      const second = await putSubscription(userId, { active: false });
      expect(second.status).toBe(200);

      const rows = await getDb().select().from(userSubscriptionTable);
      expect(rows.filter((r) => r.status === 'active')).toHaveLength(0);
    });

    // A row left saying 'active' after its period elapsed would otherwise
    // collide with the new one on unique_active_subscription.
    it('replaces a lapsed-but-still-active row rather than colliding with it', async () => {
      const userId = await seedUser();
      await grant(userId, { endsInDays: -1 });
      asAdmin();

      const res = await putSubscription(userId, { active: true });
      expect(res.status).toBe(200);

      const rows = await getDb().select().from(userSubscriptionTable);
      expect(rows).toHaveLength(2);
      expect(rows.filter((r) => r.status === 'active')).toHaveLength(1);
    });

    it('honours a custom period length', async () => {
      const userId = await seedUser();
      asAdmin();

      const res = await putSubscription(userId, { active: true, days: 1, plan: 'annual' });
      const body = (await res.json()) as { plan: string; expiresAt: string };
      expect(body.plan).toBe('annual');
      const ends = new Date(body.expiresAt).getTime() - Date.now();
      expect(ends).toBeLessThan(2 * 24 * 60 * 60 * 1000);
    });

    it('rejects a malformed body', async () => {
      const userId = await seedUser();
      asAdmin();
      const res = await putSubscription(userId, { active: 'yes' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/user -- admin listing', () => {
    it('reports each user\'s entitlement', async () => {
      const userId = await seedUser();
      await grant(userId, { plan: 'annual' });
      vi.mocked(verifyIdToken).mockResolvedValue(ADMIN_EMAILS[0]);

      const res = await app.request('/api/user');
      const body = (await res.json()) as {
        data: { id: number; subscription: { active: boolean; plan: string | null } }[];
      };
      const row = body.data.find((u) => u.id === userId);
      expect(row?.subscription).toMatchObject({ active: true, plan: 'annual' });
    });
  });
});
