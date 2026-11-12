import { desc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from 'src/app';
import { closeDb, getDb } from 'src/db/client';
import {
  paymentChargeTable,
  paymentOrderTable,
  paymentPurchaseTable,
  userSubscriptionTable,
  userTable,
} from 'src/db/schema';

vi.mock('src/lib/firebaseAdmin', () => ({ verifyIdToken: vi.fn(), verifyIdTokenUid: vi.fn() }));
import { verifyIdTokenUid } from 'src/lib/firebaseAdmin';

// Only the one function that would reach ECPay over the network is
// replaced. The signing stays real, so what the webhook tests feed in is
// signed exactly the way ECPay signs it.
vi.mock('src/lib/ecpay', async (importOriginal) => ({
  ...(await importOriginal<typeof import('src/lib/ecpay')>()),
  cancelPeriodOrder: vi.fn(),
}));
import { cancelPeriodOrder, genCheckMacValue } from 'src/lib/ecpay';
import { subscriptionStatusSchema } from 'src/routes/subscription';

const FIXTURE_UID = 'payment-fixture-uid';
const DAY_MS = 24 * 60 * 60 * 1000;

const clearTables = async () => {
  const db = getDb();
  // Charges reference orders; orders, purchases and subscriptions all
  // reference user. payment_purchase is cleared here even though this file
  // never writes it: `delete from user` below fails on its foreign key if
  // any row survives, which is what happens when a file that does write it
  // has run first.
  await db.delete(paymentChargeTable);
  await db.delete(paymentOrderTable);
  await db.delete(paymentPurchaseTable);
  await db.delete(userSubscriptionTable);
  await db.delete(userTable);
};

const seedUser = async () => {
  const [{ insertId }] = await getDb()
    .insert(userTable)
    .values({ firebaseUid: FIXTURE_UID, email: `${FIXTURE_UID}@example.com`, createdAt: new Date() });
  return insertId;
};

const seedOrder = async (
  userId: number,
  { merchantTradeNo = 'CSTEST1', status = 'created', plan = 'monthly' } = {}
) => {
  const [{ insertId }] = await getDb().insert(paymentOrderTable).values({
    userId,
    plan,
    provider: 'ecpay',
    merchantTradeNo,
    status,
    periodType: plan === 'annual' ? 'Y' : 'M',
    frequency: 1,
    execTimes: 99,
    periodAmount: plan === 'annual' ? 1990 : 199,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return insertId;
};

/** A notification body, signed the way ECPay signs one. */
const notification = (fields: Record<string, string>): string => {
  const signed = { ...fields, CheckMacValue: genCheckMacValue(fields) };
  return new URLSearchParams(signed).toString();
};

const postWebhook = (path: string, body: string) =>
  app.request(path, {
    method: 'POST',
    // Deliberately no Content-Type: CloudFront does not forward it, so
    // the handler must not need it. A test that sent one would pass
    // while production failed.
    body,
  });

const subscriptionsOf = async (userId: number) =>
  getDb()
    .select()
    .from(userSubscriptionTable)
    .where(eq(userSubscriptionTable.userId, userId))
    .orderBy(desc(userSubscriptionTable.id));

describe('payment', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    process.env.ECPAY_MERCHANT_ID = '3002607';
    process.env.ECPAY_HASH_KEY = 'pwFHCqoQZGmho4w6';
    process.env.ECPAY_HASH_IV = 'EkRm7iFT261dpevs';
    process.env.PUBLIC_BASE_URL = 'https://example.test';
    delete process.env.ECPAY_MODE;
    await clearTables();
  });

  afterAll(async () => {
    await clearTables();
    await closeDb();
  });

  describe('POST /api/payment/checkout', () => {
    it('rejects with 401 when there is no valid identity', async () => {
      const res = await app.request('/api/payment/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'monthly' }),
      });
      expect(res.status).toBe(401);
    });

    it('records a created order and returns a form that verifies', async () => {
      const userId = await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/payment/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'monthly' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { action: string; params: Record<string, string> };

      expect(body.action).toContain('payment-stage.ecpay.com.tw');
      expect(body.params.TotalAmount).toBe('179');
      expect(body.params.ChoosePayment).toBe('Credit');

      const [order] = await getDb()
        .select()
        .from(paymentOrderTable)
        .where(eq(paymentOrderTable.userId, userId));
      expect(order.status).toBe('created');
      expect(order.merchantTradeNo).toBe(body.params.MerchantTradeNo);
    });

    // Nothing is charged until the webhook says so, so a checkout alone
    // must not hand out access.
    it('grants no entitlement by itself', async () => {
      const userId = await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      await app.request('/api/payment/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'monthly' }),
      });

      expect(await subscriptionsOf(userId)).toEqual([]);
    });

    it('refuses to re-buy the plan the user is already paying for', async () => {
      const userId = await seedUser();
      await seedOrder(userId, { status: 'active' });
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/payment/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'monthly' }),
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ code: 'ALREADY_SUBSCRIBED' });
    });

    // ECPay cannot amend an agreement, so switching plan has to stop the
    // old one. If that call fails the whole request must roll back,
    // rather than leaving a user paying for two plans.
    //
    // The live order names `annual`, which the catalog no longer offers.
    // That is not a contrivance to keep this test alive: it is the only
    // shape this branch can still take now that there is one recurring
    // plan, and it is what a subscriber on the retired yearly plan
    // actually hits when they buy the current one.
    it('stops the previous agreement when switching plan', async () => {
      const userId = await seedUser();
      await seedOrder(userId, {
        status: 'active',
        merchantTradeNo: 'CSOLD1',
        plan: 'annual',
      });
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/payment/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'monthly' }),
      });
      expect(res.status).toBe(200);
      expect(vi.mocked(cancelPeriodOrder)).toHaveBeenCalledWith('CSOLD1');

      const [old] = await getDb()
        .select()
        .from(paymentOrderTable)
        .where(eq(paymentOrderTable.merchantTradeNo, 'CSOLD1'));
      expect(old.status).toBe('cancelled');
    });

    it('rolls everything back when ECPay refuses the cancellation', async () => {
      const userId = await seedUser();
      await seedOrder(userId, {
        status: 'active',
        merchantTradeNo: 'CSOLD1',
        plan: 'annual',
      });
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);
      vi.mocked(cancelPeriodOrder).mockRejectedValue(new Error('ECPay said no'));

      const res = await app.request('/api/payment/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'monthly' }),
      });
      expect(res.status).toBe(500);

      const orders = await getDb()
        .select()
        .from(paymentOrderTable)
        .where(eq(paymentOrderTable.userId, userId));
      expect(orders).toHaveLength(1);
      expect(orders[0].status).toBe('active');
    });
  });

  describe('POST /api/webhook/ecpay/notify', () => {
    const paidBody = (merchantTradeNo = 'CSTEST1', tradeNo = 'EC0001') =>
      notification({
        MerchantID: '3002607',
        MerchantTradeNo: merchantTradeNo,
        RtnCode: '1',
        RtnMsg: '交易成功',
        TradeAmt: '199',
        TradeNo: tradeNo,
        PaymentDate: '2024/03/12 15:30:23',
        PaymentType: 'Credit_CreditCard',
        SimulatePaid: '0',
      });

    it('grants a period and activates the order', async () => {
      const userId = await seedUser();
      await seedOrder(userId);

      const res = await postWebhook('/api/webhook/ecpay/notify', paidBody());
      expect(res.status).toBe(200);
      // The exact string ECPay needs; anything else and it retries.
      expect(await res.text()).toBe('1|OK');

      const subs = await subscriptionsOf(userId);
      expect(subs).toHaveLength(1);
      expect(subs[0].status).toBe('active');
      expect(subs[0].plan).toBe('monthly');
      expect(subs[0].provider).toBe('ecpay');
      expect(subs[0].providerRef).toBe('CSTEST1');
      expect(subs[0].currentPeriodEnd.getTime()).toBeGreaterThan(Date.now());

      const [order] = await getDb()
        .select()
        .from(paymentOrderTable)
        .where(eq(paymentOrderTable.userId, userId));
      expect(order.status).toBe('active');
      expect(order.ecpayTradeNo).toBe('EC0001');
    });

    // The failure this whole design is built around: ECPay retries any
    // notification it did not get 1|OK for, and a second period is both
    // free money for the user and invisible to us.
    it('does not grant twice when ECPay retries the same notification', async () => {
      const userId = await seedUser();
      await seedOrder(userId);

      const first = await postWebhook('/api/webhook/ecpay/notify', paidBody());
      const second = await postWebhook('/api/webhook/ecpay/notify', paidBody());
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(await second.text()).toBe('1|OK');

      expect(await subscriptionsOf(userId)).toHaveLength(1);
      const charges = await getDb().select().from(paymentChargeTable);
      expect(charges).toHaveLength(1);
    });

    it('rejects a payload whose signature does not check out', async () => {
      const userId = await seedUser();
      await seedOrder(userId);

      const tampered = new URLSearchParams({
        MerchantID: '3002607',
        MerchantTradeNo: 'CSTEST1',
        RtnCode: '1',
        TradeAmt: '199',
        TradeNo: 'EC0001',
        CheckMacValue: 'F'.repeat(64),
      }).toString();

      const res = await postWebhook('/api/webhook/ecpay/notify', tampered);
      expect(res.status).toBe(400);
      expect(await subscriptionsOf(userId)).toEqual([]);
      expect(await getDb().select().from(paymentChargeTable)).toEqual([]);
    });

    // The signature check is constant-time, and the primitive behind it
    // throws when the two values differ in length. The case above cannot
    // catch that, because a 64-character forgery is the same length as a
    // real digest. A throw would surface as a 500, and ECPay answers a
    // 500 by re-sending the notification up to four times.
    it('rejects a truncated signature with 400 rather than failing', async () => {
      const userId = await seedUser();
      await seedOrder(userId);

      const truncated = new URLSearchParams({
        MerchantID: '3002607',
        MerchantTradeNo: 'CSTEST1',
        RtnCode: '1',
        TradeAmt: '199',
        TradeNo: 'EC0001',
        CheckMacValue: 'F',
      }).toString();

      const res = await postWebhook('/api/webhook/ecpay/notify', truncated);
      expect(res.status).toBe(400);
      expect(await subscriptionsOf(userId)).toEqual([]);
      expect(await getDb().select().from(paymentChargeTable)).toEqual([]);
    });

    it('marks a declined first authorisation failed and grants nothing', async () => {
      const userId = await seedUser();
      await seedOrder(userId);

      const res = await postWebhook(
        '/api/webhook/ecpay/notify',
        notification({
          MerchantID: '3002607',
          MerchantTradeNo: 'CSTEST1',
          RtnCode: '10100058',
          RtnMsg: '請確認卡片資訊',
          TradeAmt: '199',
          TradeNo: 'EC0001',
        })
      );
      expect(res.status).toBe(200);

      expect(await subscriptionsOf(userId)).toEqual([]);
      const [order] = await getDb()
        .select()
        .from(paymentOrderTable)
        .where(eq(paymentOrderTable.userId, userId));
      expect(order.status).toBe('failed');
    });

    // A back-office test replay looks exactly like a real payment.
    it('grants nothing for a simulated payment', async () => {
      const userId = await seedUser();
      await seedOrder(userId);

      const res = await postWebhook(
        '/api/webhook/ecpay/notify',
        notification({
          MerchantID: '3002607',
          MerchantTradeNo: 'CSTEST1',
          RtnCode: '1',
          TradeAmt: '199',
          TradeNo: 'EC0001',
          SimulatePaid: '1',
        })
      );
      expect(res.status).toBe(200);
      expect(await subscriptionsOf(userId)).toEqual([]);
    });

    it('acknowledges a notification for an order it has never seen', async () => {
      const res = await postWebhook('/api/webhook/ecpay/notify', paidBody('CSUNKNOWN'));
      // Retrying would not help, so it is acknowledged rather than left
      // to bounce until ECPay gives up.
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('1|OK');
    });
  });

  describe('POST /api/webhook/ecpay/period', () => {
    const renewalBody = (gwsr: string) =>
      notification({
        MerchantID: '3002607',
        MerchantTradeNo: 'CSTEST1',
        RtnCode: '1',
        RtnMsg: '成功',
        Amount: '199',
        gwsr,
        process_date: '2024/04/12 15:30:23',
        auth_code: '777777',
        TotalSuccessTimes: '2',
      });

    // ECPay's own page for this notification contradicts itself: the
    // field list names ProcessDate and AuthCode, the schema beside it
    // names process_date and auth_code. Reading only one spelling loses
    // the authorisation date and code on every renewal, and loses them
    // quietly -- both columns are nullable and nothing branches on them,
    // so the first sign of it would be a reconciliation that cannot be
    // done.
    it('records the authorisation details under either spelling', async () => {
      const userId = await seedUser();
      await seedOrder(userId, { status: 'active' });

      const pascalCase = notification({
        MerchantID: '3002607',
        MerchantTradeNo: 'CSTEST1',
        RtnCode: '1',
        RtnMsg: '成功',
        Amount: '199',
        gwsr: '77777777',
        ProcessDate: '2024/04/12 15:30:23',
        AuthCode: '654321',
        TotalSuccessTimes: '2',
      });

      const res = await postWebhook('/api/webhook/ecpay/period', pascalCase);
      expect(res.status).toBe(200);

      const [charge] = await getDb().select().from(paymentChargeTable);
      expect(charge.authCode).toBe('654321');
      expect(charge.processDate).not.toBeNull();
    });

    it('queues the renewed period behind the one already paid for', async () => {
      const userId = await seedUser();
      await seedOrder(userId, { status: 'active' });
      const existingEnd = new Date(Date.now() + 5 * DAY_MS);
      await getDb().insert(userSubscriptionTable).values({
        userId,
        plan: 'monthly',
        status: 'active',
        currentPeriodStart: new Date(Date.now() - 25 * DAY_MS),
        currentPeriodEnd: existingEnd,
        provider: 'ecpay',
        providerRef: 'CSTEST1',
        createdAt: new Date(),
      });

      const res = await postWebhook('/api/webhook/ecpay/period', renewalBody('88888888'));
      expect(res.status).toBe(200);

      const subs = await subscriptionsOf(userId);
      expect(subs).toHaveLength(2);
      const [latest, previous] = subs;
      // The superseded period is closed so the new one can be the single
      // active row the unique index allows.
      expect(previous.status).toBe('expired');
      expect(latest.status).toBe('active');
      // The new period starts where the old one was actually paid up to,
      // not at "now" -- renewing early must not cost the user days.
      expect(latest.currentPeriodStart.getTime()).toBeGreaterThan(Date.now() + DAY_MS);
      expect(latest.currentPeriodEnd.getTime()).toBeGreaterThan(existingEnd.getTime());
    });

    // The grace is added to every stored period end; chaining onto it
    // instead of onto the nominal end would compound it into more than a
    // free month a year.
    it('does not compound the renewal grace across periods', async () => {
      const userId = await seedUser();
      await seedOrder(userId, { status: 'active' });

      await postWebhook('/api/webhook/ecpay/period', renewalBody('1001'));
      await postWebhook('/api/webhook/ecpay/period', renewalBody('1002'));
      await postWebhook('/api/webhook/ecpay/period', renewalBody('1003'));

      const subs = await subscriptionsOf(userId);
      expect(subs).toHaveLength(3);
      const first = subs[2];
      const last = subs[0];
      // Three monthly periods from the same start: about 92 days, plus
      // one grace. Compounding would add three.
      const spanDays =
        (last.currentPeriodEnd.getTime() - first.currentPeriodStart.getTime()) / DAY_MS;
      expect(spanDays).toBeGreaterThan(89 + 3);
      expect(spanDays).toBeLessThan(93 + 3.5);
    });

    it('treats each authorisation as distinct even on the same order', async () => {
      const userId = await seedUser();
      await seedOrder(userId, { status: 'active' });

      await postWebhook('/api/webhook/ecpay/period', renewalBody('2001'));
      await postWebhook('/api/webhook/ecpay/period', renewalBody('2001'));
      await postWebhook('/api/webhook/ecpay/period', renewalBody('2002'));

      expect(await subscriptionsOf(userId)).toHaveLength(2);
    });

    // ECPay retries a failed charge up to six times before giving up.
    // Revoking on the first failure would cut short days already paid for.
    it('leaves an active agreement and its entitlement alone when a renewal fails', async () => {
      const userId = await seedUser();
      await seedOrder(userId, { status: 'active' });
      await getDb().insert(userSubscriptionTable).values({
        userId,
        plan: 'monthly',
        status: 'active',
        currentPeriodStart: new Date(Date.now() - 25 * DAY_MS),
        currentPeriodEnd: new Date(Date.now() + 2 * DAY_MS),
        createdAt: new Date(),
      });

      const res = await postWebhook(
        '/api/webhook/ecpay/period',
        notification({
          MerchantID: '3002607',
          MerchantTradeNo: 'CSTEST1',
          RtnCode: '10100058',
          RtnMsg: '授權失敗',
          Amount: '199',
          gwsr: '3001',
        })
      );
      expect(res.status).toBe(200);

      const subs = await subscriptionsOf(userId);
      expect(subs).toHaveLength(1);
      expect(subs[0].status).toBe('active');

      const [order] = await getDb()
        .select()
        .from(paymentOrderTable)
        .where(eq(paymentOrderTable.userId, userId));
      expect(order.status).toBe('active');
    });
  });

  describe('POST /api/subscription/cancel', () => {
    it('stops the agreement but keeps access to the end of the paid period', async () => {
      const userId = await seedUser();
      await seedOrder(userId, { status: 'active' });
      const end = new Date(Date.now() + 10 * DAY_MS);
      await getDb().insert(userSubscriptionTable).values({
        userId,
        plan: 'monthly',
        status: 'active',
        currentPeriodStart: new Date(Date.now() - 20 * DAY_MS),
        currentPeriodEnd: end,
        createdAt: new Date(),
      });
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/subscription/cancel', { method: 'POST' });
      expect(res.status).toBe(200);
      expect(vi.mocked(cancelPeriodOrder)).toHaveBeenCalledWith('CSTEST1');
      // Auto-renew is off, so /me reports inactive straight away.
      expect(await res.json()).toMatchObject({ active: false });

      const subs = await subscriptionsOf(userId);
      expect(subs[0].status).toBe('cancelled');
      // The period itself is untouched: still paid for, still in the future.
      expect(subs[0].currentPeriodEnd.getTime()).toBe(end.getTime());

      const [order] = await getDb()
        .select()
        .from(paymentOrderTable)
        .where(eq(paymentOrderTable.userId, userId));
      expect(order.status).toBe('cancelled');
      expect(order.cancelledAt).not.toBeNull();
    });

    it('changes nothing when ECPay refuses, rather than claiming success', async () => {
      const userId = await seedUser();
      await seedOrder(userId, { status: 'active' });
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);
      vi.mocked(cancelPeriodOrder).mockRejectedValue(new Error('ECPay said no'));

      const res = await app.request('/api/subscription/cancel', { method: 'POST' });
      expect(res.status).toBe(500);

      const [order] = await getDb()
        .select()
        .from(paymentOrderTable)
        .where(eq(paymentOrderTable.userId, userId));
      expect(order.status).toBe('active');
    });

    // A subscription granted by hand has no agreement behind it, and
    // "stop renewing me" is already true.
    it('succeeds for a user with no payment order at all', async () => {
      const userId = await seedUser();
      await getDb().insert(userSubscriptionTable).values({
        userId,
        plan: 'monthly',
        status: 'active',
        currentPeriodStart: new Date(Date.now() - DAY_MS),
        currentPeriodEnd: new Date(Date.now() + 10 * DAY_MS),
        createdAt: new Date(),
      });
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await app.request('/api/subscription/cancel', { method: 'POST' });
      expect(res.status).toBe(200);
      expect(vi.mocked(cancelPeriodOrder)).not.toHaveBeenCalled();
      expect((await subscriptionsOf(userId))[0].status).toBe('cancelled');
    });

    /**
     * The same schema GET /me answers with, checked on this route too:
     * the two reporting the same shape differently is exactly what one
     * description per response is for.
     */
    it('sends exactly what the OpenAPI document describes', async () => {
      const userId = await seedUser();
      await seedOrder(userId, { status: 'active' });
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const body: unknown = await (
        await app.request('/api/subscription/cancel', { method: 'POST' })
      ).json();

      const parsed = subscriptionStatusSchema.safeParse(body);
      expect(parsed.error?.issues ?? []).toEqual([]);
      expect(parsed.success).toBe(true);
      expect(Object.keys(body as object).sort()).toEqual([
        'active',
        'autoRenew',
        'entitled',
        'expiresAt',
        'plan',
      ]);
    });
  });

  describe('GET /api/info/plans', () => {
    type PlanInfo = {
      kind: string;
      code: string;
      amount: number;
      periodType?: string;
      frequency?: number;
      days?: number;
    };

    it('is readable without signing in, since the pricing page is', async () => {
      const res = await app.request('/api/info/plans');
      expect(res.status).toBe(200);
      const plans = (await res.json()) as PlanInfo[];
      expect(plans.map((p) => p.code)).toEqual(['monthly', 'days30', 'days90', 'days365']);
    });

    it('states the amount for every plan, since the client renders no price of its own', async () => {
      // The whole reason this endpoint exists: a price shown in one place
      // and signed in another is a bug that charges a real card the wrong
      // number.
      const plans = (await (await app.request('/api/info/plans')).json()) as PlanInfo[];
      expect(plans.find((p) => p.code === 'monthly')?.amount).toBe(179);
      expect(plans.find((p) => p.code === 'days30')?.amount).toBe(199);
      expect(plans.find((p) => p.code === 'days90')?.amount).toBe(549);
      expect(plans.find((p) => p.code === 'days365')?.amount).toBe(1999);
    });

    it('describes the two kinds differently, so the client need not guess', async () => {
      // A recurring plan is "charged every N periods, indefinitely"; a day
      // pass is "N days, once". There is no periodType that honestly
      // describes the second -- 'D' with frequency 30 reads as "charged
      // every 30 days", which is exactly what it is not.
      const plans = (await (await app.request('/api/info/plans')).json()) as PlanInfo[];

      const monthly = plans.find((p) => p.code === 'monthly')!;
      expect(monthly).toMatchObject({ kind: 'recurring', periodType: 'M', frequency: 1 });
      expect(monthly.days).toBeUndefined();

      const pass = plans.find((p) => p.code === 'days90')!;
      expect(pass).toMatchObject({ kind: 'dayPass', days: 90 });
      expect(pass.periodType).toBeUndefined();
    });
  });
});
