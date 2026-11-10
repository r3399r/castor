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

// Only the function that would reach ECPay over the network is replaced.
// The signing stays real, so the webhook bodies below are signed exactly
// the way ECPay signs them.
vi.mock('src/lib/ecpay', async (importOriginal) => ({
  ...(await importOriginal<typeof import('src/lib/ecpay')>()),
  cancelPeriodOrder: vi.fn(),
}));
import { cancelPeriodOrder, genCheckMacValue } from 'src/lib/ecpay';

import {
  cancelOrdersSupersededByDayPass,
  expireUnpaidPurchases,
} from 'src/lib/paymentSweep';

const FIXTURE_UID = 'daypass-fixture-uid';
const DAY_MS = 24 * 60 * 60 * 1000;

const clearTables = async () => {
  const db = getDb();
  await db.delete(paymentChargeTable);
  await db.delete(paymentOrderTable);
  await db.delete(paymentPurchaseTable);
  await db.delete(userSubscriptionTable);
  await db.delete(userTable);
};

const seedUser = async () => {
  const [{ insertId }] = await getDb()
    .insert(userTable)
    .values({
      firebaseUid: FIXTURE_UID,
      email: `${FIXTURE_UID}@example.com`,
      createdAt: new Date(),
    });
  return insertId;
};

const notification = (fields: Record<string, string>): string => {
  const signed = { ...fields, CheckMacValue: genCheckMacValue(fields) };
  return new URLSearchParams(signed).toString();
};

const postWebhook = (path: string, body: string) =>
  app.request(path, {
    method: 'POST',
    // Deliberately no Content-Type: CloudFront does not forward it, so
    // the handler must not need it. A test that sent one would pass while
    // production failed.
    body,
  });

const checkout = (body: unknown) =>
  app.request('/api/payment/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const purchasesOf = async (userId: number) =>
  getDb()
    .select()
    .from(paymentPurchaseTable)
    .where(eq(paymentPurchaseTable.userId, userId))
    .orderBy(desc(paymentPurchaseTable.id));

const subscriptionsOf = async (userId: number) =>
  getDb()
    .select()
    .from(userSubscriptionTable)
    .where(eq(userSubscriptionTable.userId, userId))
    .orderBy(desc(userSubscriptionTable.id));

/** The payment-result notification for a day pass. */
const paidBody = (merchantTradeNo: string, overrides: Record<string, string> = {}) =>
  notification({
    MerchantID: '3002607',
    MerchantTradeNo: merchantTradeNo,
    RtnCode: '1',
    RtnMsg: '交易成功',
    TradeAmt: '549',
    TradeNo: 'ECDP0001',
    PaymentDate: '2024/03/12 15:30:23',
    PaymentType: 'ATM_TAISHIN',
    SimulatePaid: '0',
    ...overrides,
  });

/** The code-issued notification (ECPay's PaymentInfoURL). */
const infoBody = (merchantTradeNo: string, overrides: Record<string, string> = {}) =>
  notification({
    MerchantID: '3002607',
    MerchantTradeNo: merchantTradeNo,
    RtnCode: '2',
    RtnMsg: 'Succeeded',
    TradeAmt: '549',
    TradeNo: 'ECDP0001',
    TradeDate: '2024/03/12 15:00:00',
    PaymentType: 'ATM_TAISHIN',
    BankCode: '812',
    vAccount: '9103522175887271',
    ExpireDate: '2024/03/19',
    ...overrides,
  });

/** Buys a pass and returns the generated MerchantTradeNo. */
const buy = async (plan: string, method: string): Promise<string> => {
  vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);
  const res = await checkout({ plan, method });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { params: Record<string, string> };
  return body.params.MerchantTradeNo;
};

const seedOrder = async (userId: number, merchantTradeNo = 'CSREC1') => {
  const [{ insertId }] = await getDb().insert(paymentOrderTable).values({
    userId,
    plan: 'monthly',
    provider: 'ecpay',
    merchantTradeNo,
    status: 'active',
    periodType: 'M',
    frequency: 1,
    execTimes: 99,
    periodAmount: 179,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return insertId;
};

describe('day pass', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    process.env.ECPAY_MERCHANT_ID = '3002607';
    process.env.ECPAY_HASH_KEY = 'pwFHCqoQZGmho4w6';
    process.env.ECPAY_HASH_IV = 'EkRm7iFT261dpevs';
    process.env.ECPAY_MODE = 'stage';
    process.env.PUBLIC_BASE_URL = 'https://example.test';
    delete process.env.ECPAY_CALLBACK_BASE_URL;
    await clearTables();
  });

  afterAll(async () => {
    // Cleared here, not only in beforeEach: the last test's rows would
    // otherwise outlive this file, and `payment_purchase.user_id`
    // references `user`, so the next file's `delete from user` would fail
    // on a foreign key. A test file leaving rows behind is a bug in the
    // file, not in whoever runs after it.
    await clearTables();
    await closeDb();
  });

  describe('POST /api/payment/checkout', () => {
    it('creates a purchase and a signed one-time form', async () => {
      const userId = await seedUser();
      const merchantTradeNo = await buy('days90', 'ATM');

      const [purchase] = await purchasesOf(userId);
      expect(purchase).toMatchObject({
        plan: 'days90',
        // Frozen here, not read from the catalog later.
        amount: 549,
        days: 90,
        choosePayment: 'ATM',
        status: 'created',
        merchantTradeNo,
      });
    });

    it('records nothing in payment_order, which is for agreements only', async () => {
      // payment_order carries UNIQUE(active_user_id) so nobody holds two
      // live agreements. A day pass landing there would make buying one
      // while subscribed impossible.
      const userId = await seedUser();
      await buy('days30', 'Credit');

      const orders = await getDb()
        .select()
        .from(paymentOrderTable)
        .where(eq(paymentOrderTable.userId, userId));
      expect(orders).toEqual([]);
    });

    it('grants nothing by itself', async () => {
      const userId = await seedUser();
      await buy('days365', 'CVS');
      expect(await subscriptionsOf(userId)).toEqual([]);
    });

    it('requires a payment method, which the recurring plan does not', async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await checkout({ plan: 'days30' });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ code: 'PAYMENT_METHOD_REQUIRED' });
    });

    it('rejects a method ECPay was never going to accept', async () => {
      await seedUser();
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);

      const res = await checkout({ plan: 'days30', method: 'WebATM' });
      expect(res.status).toBe(400);
    });

    it('does not cancel a live agreement at checkout', async () => {
      // ECPay's cancel is one-way and an ATM payment can go unpaid for a
      // week. Cancelling here would leave someone who never pays with no
      // subscription and no pass.
      const userId = await seedUser();
      await seedOrder(userId);
      await buy('days90', 'ATM');

      expect(vi.mocked(cancelPeriodOrder)).not.toHaveBeenCalled();
      const [order] = await getDb()
        .select()
        .from(paymentOrderTable)
        .where(eq(paymentOrderTable.userId, userId));
      expect(order.status).toBe('active');
    });

    it('lets the same user buy a second pass', async () => {
      // Unlike an agreement, of which there may be only one.
      const userId = await seedUser();
      await buy('days30', 'Credit');
      await buy('days90', 'Credit');
      expect(await purchasesOf(userId)).toHaveLength(2);
    });

    describe('the form ECPay receives', () => {
      const paramsFor = async (plan: string, method: string) => {
        vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);
        const res = await checkout({ plan, method });
        return ((await res.json()) as { params: Record<string, string> }).params;
      };

      it('sends a fixed ChoosePayment, never ALL', async () => {
        await seedUser();
        // ECPay's own guidance: they add and change payment methods over
        // time, so a fixed value is what keeps result notifications
        // predictable.
        expect((await paramsFor('days30', 'CVS')).ChoosePayment).toBe('CVS');
      });

it('sends the browser back by GET only, never by a POST we cannot answer', async () => {
        // The webapp is a static export on S3: it cannot answer an HTTP
        // POST, which is what OrderResultURL would send. ClientRedirectURL
        // is unused for the same reason -- its HTTP method is not
        // documented anywhere readable, so it is not risked.
        await seedUser();

        for (const method of ['Credit', 'ATM', 'CVS', 'BARCODE']) {
          const params = await paramsFor('days30', method);
          expect(params.ClientBackURL).toBe('https://example.test/subscription/result');
          expect(params.OrderResultURL).toBeUndefined();
          expect(params.ClientRedirectURL).toBeUndefined();
        }
      });

      it('asks for the code only when there is a code to issue', async () => {
        // Without PaymentInfoURL ECPay has nowhere to post the virtual
        // account, and the payer never learns what to pay. A card needs
        // none of it.
        await seedUser();

        expect((await paramsFor('days30', 'Credit')).PaymentInfoURL).toBeUndefined();
        for (const method of ['ATM', 'CVS', 'BARCODE'])
          expect((await paramsFor('days30', method)).PaymentInfoURL).toBeDefined();
      });

      it('expresses the same seven days in each method’s own unit', async () => {
        // The reason the method is chosen before the order exists.
        // StoreExpireDate is minutes for CVS and days for BARCODE -- the
        // same name, two units -- and ATM uses a different field entirely.
        await seedUser();

        const atm = await paramsFor('days30', 'ATM');
        expect(atm.ExpireDate).toBe('7');
        expect(atm.StoreExpireDate).toBeUndefined();

        const cvs = await paramsFor('days30', 'CVS');
        expect(cvs.StoreExpireDate).toBe(String(7 * 24 * 60));
        expect(cvs.ExpireDate).toBeUndefined();

        const barcode = await paramsFor('days30', 'BARCODE');
        expect(barcode.StoreExpireDate).toBe('7');
        expect(barcode.ExpireDate).toBeUndefined();
      });

      it('points the server-to-server callbacks away from the CDN', async () => {
        // ECPay's integration notes require it: a callback aimed at a CDN
        // can be refused or rewritten. For ATM the notification arrives
        // days later, after cash has changed hands, so losing it means
        // money taken and nothing granted.
        process.env.ECPAY_CALLBACK_BASE_URL = 'https://origin.execute-api.test/prod';
        await seedUser();

        const atm = await paramsFor('days30', 'ATM');
        expect(atm.ReturnURL).toBe('https://origin.execute-api.test/prod/api/webhook/ecpay/notify');
        expect(atm.PaymentInfoURL).toBe(
          'https://origin.execute-api.test/prod/api/webhook/ecpay/payment-info'
        );
        // The browser still goes to the public domain.
        expect(atm.ClientBackURL).toBe('https://example.test/subscription/result');
      });

      it('signs the form, so neither amount nor callback can be edited', async () => {
        await seedUser();
        const params = await paramsFor('days90', 'ATM');
        const { CheckMacValue, ...rest } = params;
        expect(CheckMacValue).toBe(genCheckMacValue(rest));
      });
    });
  });

  describe('POST /api/webhook/ecpay/payment-info', () => {
    it('stores the virtual account and the real deadline', async () => {
      const userId = await seedUser();
      const no = await buy('days90', 'ATM');

      const res = await postWebhook('/api/webhook/ecpay/payment-info', infoBody(no));
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('1|OK');

      const [purchase] = await purchasesOf(userId);
      expect(purchase).toMatchObject({
        status: 'awaiting',
        bankCode: '812',
        vAccount: '9103522175887271',
        paymentType: 'ATM_TAISHIN',
      });
      // ATM's ExpireDate is a date, and the deadline is the end of that
      // day -- 23:59 Taipei, which is 15:59 UTC. Reading it as midnight
      // would cut a day off everyone who pays on the last day.
      expect(purchase.expireAt?.toISOString()).toBe('2024-03-19T15:59:59.000Z');
    });

    it('grants nothing: a code is not a payment', async () => {
      const userId = await seedUser();
      const no = await buy('days90', 'ATM');
      await postWebhook('/api/webhook/ecpay/payment-info', infoBody(no));

      expect(await subscriptionsOf(userId)).toEqual([]);
    });

    it('treats 10100073 as success, because for a store code it is', async () => {
      // ATM says 2, CVS and BARCODE say 10100073. Both mean "issued".
      // Reading either as an error cancels an order the consumer is on
      // their way to pay.
      const userId = await seedUser();
      const no = await buy('days30', 'CVS');

      await postWebhook(
        '/api/webhook/ecpay/payment-info',
        infoBody(no, {
          RtnCode: '10100073',
          PaymentType: 'CVS_CVS',
          PaymentNo: 'LLL22950436',
          ExpireDate: '2024/03/19 23:59:59',
          BankCode: '',
          vAccount: '',
        })
      );

      const [purchase] = await purchasesOf(userId);
      expect(purchase.status).toBe('awaiting');
      expect(purchase.paymentNo).toBe('LLL22950436');
      expect(purchase.expireAt?.toISOString()).toBe('2024-03-19T15:59:59.000Z');
    });

    it('marks a genuine issuing failure as failed', async () => {
      const userId = await seedUser();
      const no = await buy('days30', 'ATM');

      await postWebhook(
        '/api/webhook/ecpay/payment-info',
        infoBody(no, { RtnCode: '10100058', RtnMsg: '取號失敗' })
      );
      expect((await purchasesOf(userId))[0].status).toBe('failed');
    });

    it('does not undo a payment that arrived first', async () => {
      // ECPay retries anything unacknowledged, so an old code-issued
      // notification can land after the payment one.
      const userId = await seedUser();
      const no = await buy('days90', 'ATM');
      await postWebhook('/api/webhook/ecpay/notify', paidBody(no));

      await postWebhook('/api/webhook/ecpay/payment-info', infoBody(no));
      expect((await purchasesOf(userId))[0].status).toBe('paid');
    });

    it('rejects an unsigned body with 400, so our own signing bug is loud', async () => {
      await seedUser();
      const no = await buy('days30', 'ATM');
      const res = await postWebhook(
        '/api/webhook/ecpay/payment-info',
        new URLSearchParams({ MerchantTradeNo: no, RtnCode: '2' }).toString()
      );
      expect(res.status).toBe(400);
    });

    it('acknowledges a notification for a purchase it has never seen', async () => {
      // Retrying will not conjure the row, so bouncing it off ECPay four
      // times achieves nothing.
      const res = await postWebhook('/api/webhook/ecpay/payment-info', infoBody('CSNOSUCH'));
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('1|OK');
    });
  });

  describe('POST /api/webhook/ecpay/notify (day pass)', () => {
    it('grants the days and records what was granted', async () => {
      const userId = await seedUser();
      const no = await buy('days90', 'ATM');

      const res = await postWebhook('/api/webhook/ecpay/notify', paidBody(no));
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('1|OK');

      const [purchase] = await purchasesOf(userId);
      expect(purchase).toMatchObject({ status: 'paid', paymentType: 'ATM_TAISHIN' });
      expect(purchase.grantedUntil).not.toBeNull();

      const [subscription] = await subscriptionsOf(userId);
      expect(subscription).toMatchObject({ plan: 'days90', status: 'active' });
      const span =
        subscription.currentPeriodEnd.getTime() - subscription.currentPeriodStart.getTime();
      // Exactly 90 days: no renewal grace, which belongs to a recurring
      // period waiting on ECPay's clock, not to a pass paid up front.
      expect(span).toBe(90 * DAY_MS);
    });

    it('stacks onto time already paid for instead of replacing it', async () => {
      const userId = await seedUser();
      const first = await buy('days30', 'Credit');
      await postWebhook('/api/webhook/ecpay/notify', paidBody(first));
      const afterFirst = (await subscriptionsOf(userId))[0].currentPeriodEnd;

      const second = await buy('days90', 'Credit');
      await postWebhook('/api/webhook/ecpay/notify', paidBody(second));
      const afterSecond = (await subscriptionsOf(userId))[0].currentPeriodEnd;

      // The second pass begins where the first ended, so nothing already
      // bought is discarded.
      expect(afterSecond.getTime() - afterFirst.getTime()).toBe(90 * DAY_MS);
    });

    it('grants the days stored on the purchase, not today’s catalog', async () => {
      // Same freeze as donation.amount: re-pricing or re-sizing a plan
      // must not change what an already-paid purchase bought.
      const userId = await seedUser();
      const no = await buy('days30', 'Credit');
      await getDb()
        .update(paymentPurchaseTable)
        .set({ days: 5 })
        .where(eq(paymentPurchaseTable.merchantTradeNo, no));

      await postWebhook('/api/webhook/ecpay/notify', paidBody(no));

      const [subscription] = await subscriptionsOf(userId);
      expect(
        subscription.currentPeriodEnd.getTime() - subscription.currentPeriodStart.getTime()
      ).toBe(5 * DAY_MS);
    });

    it('grants once however many times ECPay retries', async () => {
      // Up to four retries a day for anything not acknowledged with 1|OK.
      const userId = await seedUser();
      const no = await buy('days90', 'Credit');

      await postWebhook('/api/webhook/ecpay/notify', paidBody(no));
      const once = (await subscriptionsOf(userId))[0].currentPeriodEnd;

      const again = await postWebhook('/api/webhook/ecpay/notify', paidBody(no));
      expect(again.status).toBe(200);
      expect((await subscriptionsOf(userId))[0].currentPeriodEnd).toEqual(once);
      expect(await subscriptionsOf(userId)).toHaveLength(1);
    });

    it('grants nothing for a simulated payment', async () => {
      // ECPay's back office can replay a notification as a test. It looks
      // real and no money moved.
      const userId = await seedUser();
      const no = await buy('days90', 'Credit');

      await postWebhook('/api/webhook/ecpay/notify', paidBody(no, { SimulatePaid: '1' }));

      expect(await subscriptionsOf(userId)).toEqual([]);
      expect((await purchasesOf(userId))[0].status).toBe('created');
    });

    it('leaves a pending result open rather than failing it', async () => {
      // ECPay says 10300066 means the result is not final and to confirm
      // in their back office -- marking it failed would discard a payment
      // that may still land.
      const userId = await seedUser();
      const no = await buy('days90', 'ATM');

      await postWebhook('/api/webhook/ecpay/notify', paidBody(no, { RtnCode: '10300066' }));

      expect((await purchasesOf(userId))[0].status).toBe('created');
      expect(await subscriptionsOf(userId)).toEqual([]);
    });

    it('marks a declined payment failed and grants nothing', async () => {
      const userId = await seedUser();
      const no = await buy('days90', 'Credit');

      await postWebhook('/api/webhook/ecpay/notify', paidBody(no, { RtnCode: '10100248' }));

      expect((await purchasesOf(userId))[0].status).toBe('failed');
      expect(await subscriptionsOf(userId)).toEqual([]);
    });

    it('does not touch payment_charge, which belongs to agreements', async () => {
      await seedUser();
      const no = await buy('days90', 'Credit');
      await postWebhook('/api/webhook/ecpay/notify', paidBody(no));

      expect(await getDb().select().from(paymentChargeTable)).toEqual([]);
    });
  });

  /**
   * The two states a day pass and a recurring agreement can be in at the
   * same time. Both of these were wrong before: the UI could not tell
   * them apart, and a pass left three paid days on the floor.
   */
  describe('a pass beside an agreement', () => {
    const me = async () => {
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);
      const res = await app.request('/api/subscription/me');
      expect(res.status).toBe(200);
      return (await res.json()) as { active: boolean; plan: string | null; autoRenew: boolean };
    };

    it('reports autoRenew false for a pass, so nothing offers to cancel it', async () => {
      // The cancel button keys off this. Deriving it from `active`
      // instead told a pass buyer their one-off purchase renewed every
      // month, and offered a cancel that succeeded while stopping
      // nothing.
      const userId = await seedUser();
      const no = await buy('days30', 'Credit');
      await postWebhook('/api/webhook/ecpay/notify', paidBody(no));

      expect(await me()).toMatchObject({ active: true, plan: 'days30', autoRenew: false });

      // Same entitlement, but now with an agreement behind it: the one
      // state where cancelling means something.
      await seedOrder(userId);
      expect((await me()).autoRenew).toBe(true);
    });

    it('does not eat the grace days when an agreement starts after a pass', async () => {
      // A recurring period stores its end with RENEWAL_GRACE added, and
      // the next one subtracts it again to find where the money actually
      // ran out. A pass has no grace in it, so subtracting there would
      // start the agreement three days before the pass expires.
      const userId = await seedUser();
      const no = await buy('days30', 'Credit');
      await postWebhook('/api/webhook/ecpay/notify', paidBody(no));
      const passEnd = (await subscriptionsOf(userId))[0].currentPeriodEnd;

      await seedOrder(userId);
      const res = await postWebhook(
        '/api/webhook/ecpay/period',
        notification({
          MerchantID: '3002607',
          MerchantTradeNo: 'CSREC1',
          RtnCode: '1',
          RtnMsg: '成功',
          Amount: '179',
          gwsr: '90000001',
          process_date: '2024/04/12 15:30:23',
          auth_code: '777777',
          TotalSuccessTimes: '1',
        })
      );
      expect(res.status).toBe(200);

      const [agreementPeriod] = await subscriptionsOf(userId);
      expect(agreementPeriod.plan).toBe('monthly');
      expect(agreementPeriod.currentPeriodStart).toEqual(passEnd);
    });
  });

  describe('GET /api/payment/purchases', () => {
    const list = async () => {
      vi.mocked(verifyIdTokenUid).mockResolvedValue(FIXTURE_UID);
      const res = await app.request('/api/payment/purchases');
      expect(res.status).toBe(200);
      return ((await res.json()) as { data: Record<string, unknown>[] }).data;
    };

    it('hands back the virtual account so the payer can come back for it', async () => {
      // They leave the site to pay, maybe days later and from another
      // device, and the number was shown once on a page they have closed.
      await seedUser();
      const no = await buy('days90', 'ATM');
      await postWebhook('/api/webhook/ecpay/payment-info', infoBody(no));

      const [purchase] = await list();
      expect(purchase).toMatchObject({
        status: 'awaiting',
        choosePayment: 'ATM',
        bankCode: '812',
        vAccount: '9103522175887271',
        days: 90,
      });
    });

    it('rejects a caller with no identity', async () => {
      vi.mocked(verifyIdTokenUid).mockResolvedValue(null);
      expect((await app.request('/api/payment/purchases')).status).toBe(401);
    });

    it('shows only the caller’s own purchases', async () => {
      // Scoped by the query rather than by an id in the path, so there is
      // no id to guess at.
      await seedUser();
      await buy('days30', 'Credit');

      const [{ insertId: otherUserId }] = await getDb()
        .insert(userTable)
        .values({
          firebaseUid: 'someone-else',
          email: 'someone-else@example.com',
          createdAt: new Date(),
        });
      await getDb().insert(paymentPurchaseTable).values({
        userId: otherUserId,
        plan: 'days365',
        provider: 'ecpay',
        merchantTradeNo: 'CSOTHER1',
        amount: 1999,
        days: 365,
        choosePayment: 'Credit',
        status: 'paid',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const rows = await list();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ plan: 'days30' });
    });

    it('puts the newest first, which is the one being paid', async () => {
      await seedUser();
      await buy('days30', 'ATM');
      await buy('days90', 'ATM');

      const rows = await list();
      expect(rows[0]).toMatchObject({ plan: 'days90' });
    });
  });

  describe('the housekeep sweeps', () => {
    it('expires an unpaid code once its deadline has passed', async () => {
      const userId = await seedUser();
      const no = await buy('days90', 'ATM');
      await postWebhook('/api/webhook/ecpay/payment-info', infoBody(no));
      await getDb()
        .update(paymentPurchaseTable)
        .set({ expireAt: new Date(Date.now() - DAY_MS) })
        .where(eq(paymentPurchaseTable.merchantTradeNo, no));

      expect(await expireUnpaidPurchases(getDb())).toBe(1);
      expect((await purchasesOf(userId))[0].status).toBe('expired');
    });

    it('leaves a code that is still payable alone', async () => {
      const userId = await seedUser();
      const no = await buy('days90', 'ATM');
      await postWebhook('/api/webhook/ecpay/payment-info', infoBody(no));
      await getDb()
        .update(paymentPurchaseTable)
        .set({ expireAt: new Date(Date.now() + DAY_MS) })
        .where(eq(paymentPurchaseTable.merchantTradeNo, no));

      expect(await expireUnpaidPurchases(getDb())).toBe(0);
      expect((await purchasesOf(userId))[0].status).toBe('awaiting');
    });

    it('never expires a purchase that was paid', async () => {
      const userId = await seedUser();
      const no = await buy('days90', 'ATM');
      await postWebhook('/api/webhook/ecpay/payment-info', infoBody(no));
      await postWebhook('/api/webhook/ecpay/notify', paidBody(no));
      await getDb()
        .update(paymentPurchaseTable)
        .set({ expireAt: new Date(Date.now() - DAY_MS) })
        .where(eq(paymentPurchaseTable.merchantTradeNo, no));

      expect(await expireUnpaidPurchases(getDb())).toBe(0);
      expect((await purchasesOf(userId))[0].status).toBe('paid');
    });

    it('stops a recurring agreement once a pass has been paid', async () => {
      // Otherwise ECPay keeps charging monthly on top of the prepaid
      // days, and the user only finds out on their card statement.
      const userId = await seedUser();
      await seedOrder(userId, 'CSREC1');
      const no = await buy('days365', 'Credit');
      await postWebhook('/api/webhook/ecpay/notify', paidBody(no));

      expect(await cancelOrdersSupersededByDayPass(getDb())).toBe(1);
      expect(vi.mocked(cancelPeriodOrder)).toHaveBeenCalledWith('CSREC1');

      const [order] = await getDb()
        .select()
        .from(paymentOrderTable)
        .where(eq(paymentOrderTable.userId, userId));
      expect(order.status).toBe('cancelled');
    });

    it('keeps every day the user paid for when it cancels', async () => {
      // The agreement stopping is not the period ending.
      const userId = await seedUser();
      await seedOrder(userId, 'CSREC1');
      const no = await buy('days365', 'Credit');
      await postWebhook('/api/webhook/ecpay/notify', paidBody(no));
      const before = (await subscriptionsOf(userId))[0];

      await cancelOrdersSupersededByDayPass(getDb());

      const after = (await subscriptionsOf(userId))[0];
      expect(after.currentPeriodEnd).toEqual(before.currentPeriodEnd);
      expect(after.status).toBe('active');
    });

    it('leaves the order active when ECPay refuses, so tomorrow retries', async () => {
      // Marking it cancelled locally after a failed cancel is the worst
      // outcome available: ECPay would keep charging and nothing here
      // would ever look at it again.
      const userId = await seedUser();
      await seedOrder(userId, 'CSREC1');
      const no = await buy('days365', 'Credit');
      await postWebhook('/api/webhook/ecpay/notify', paidBody(no));
      vi.mocked(cancelPeriodOrder).mockRejectedValue(new Error('ECPay said no'));

      expect(await cancelOrdersSupersededByDayPass(getDb())).toBe(0);

      const [order] = await getDb()
        .select()
        .from(paymentOrderTable)
        .where(eq(paymentOrderTable.userId, userId));
      expect(order.status).toBe('active');
    });

    it('does not cancel anything for a pass that was never paid', async () => {
      const userId = await seedUser();
      await seedOrder(userId, 'CSREC1');
      await buy('days365', 'ATM');

      expect(await cancelOrdersSupersededByDayPass(getDb())).toBe(0);
      expect(vi.mocked(cancelPeriodOrder)).not.toHaveBeenCalled();
    });

    it('is a no-op on the second run, since cancelling clears the work', async () => {
      // No "cancel requested" column: the work is derived from a paid
      // purchase next to an active order, so cancelling the order is what
      // stops it matching.
      const userId = await seedUser();
      await seedOrder(userId, 'CSREC1');
      const no = await buy('days365', 'Credit');
      await postWebhook('/api/webhook/ecpay/notify', paidBody(no));

      expect(await cancelOrdersSupersededByDayPass(getDb())).toBe(1);
      expect(await cancelOrdersSupersededByDayPass(getDb())).toBe(0);
      expect(vi.mocked(cancelPeriodOrder)).toHaveBeenCalledTimes(1);
    });
  });
});
