import { config } from 'dotenv';
config({ path: '.env.local' });

import { desc, eq } from 'drizzle-orm';
import { closeDb, getDb } from 'src/db/client';
import {
  paymentChargeTable,
  paymentOrderTable,
  userSubscriptionTable,
} from 'src/db/schema';
import { formatEcpayDate, genCheckMacValue } from 'src/lib/ecpay';

/**
 * Plays ECPay's half of the conversation against the local backend.
 *
 * The browser-to-ECPay half of a subscription works from anywhere, but
 * the half that actually grants anything -- ECPay POSTing to
 * ReturnURL/PeriodReturnURL -- cannot reach a laptop: ECPay only calls
 * port 80 or 443 on a public domain name. Without a tunnel the feature
 * is untestable past the redirect, and even with one the renewal path
 * stays untestable, because ECPay charges on a real calendar and nobody
 * can wait a month to see the second period appear.
 *
 * So this sends the notifications itself, signed with the same HashKey
 * the backend verifies against. That exercises the real routes, the
 * real signature check and the real database -- everything except
 * whether ECPay accepts our checkout parameters, which only a tunnel
 * can answer.
 *
 *   npx tsx tools/simulateEcpayWebhook.ts first
 *   npx tsx tools/simulateEcpayWebhook.ts renew --order CSABC123
 *   npx tsx tools/simulateEcpayWebhook.ts replay
 *   npx tsx tools/simulateEcpayWebhook.ts declined
 *   npx tsx tools/simulateEcpayWebhook.ts simulated
 *
 * Every scenario prints the subscription rows before and after, because
 * the interesting failures are silent: a renewal that grants nothing, a
 * retry that grants twice, a simulated payment that grants at all.
 */

const SCENARIOS = ['first', 'renew', 'replay', 'declined', 'simulated'] as const;
type Scenario = (typeof SCENARIOS)[number];

const isScenario = (value: string): value is Scenario =>
  (SCENARIOS as readonly string[]).includes(value);

type Args = {
  scenario: Scenario;
  order?: string;
  amount?: number;
  pascalCase: boolean;
  baseUrl: string;
};

const parseArgs = (argv: string[]): Args => {
  const [scenario, ...rest] = argv;
  if (scenario === undefined || !isScenario(scenario))
    throw new Error(
      `usage: simulateEcpayWebhook <${SCENARIOS.join('|')}> ` +
        `[--order <MerchantTradeNo>] [--amount <n>] [--pascal-case] [--base-url <url>]`
    );

  const flag = (name: string): string | undefined => {
    const at = rest.indexOf(`--${name}`);
    return at === -1 ? undefined : rest[at + 1];
  };

  const amount = flag('amount');
  return {
    scenario,
    order: flag('order'),
    amount: amount === undefined ? undefined : Number(amount),
    pascalCase: rest.includes('--pascal-case'),
    baseUrl: flag('base-url') ?? `http://localhost:${process.env.PORT ?? 3001}`,
  };
};

type Order = typeof paymentOrderTable.$inferSelect;

/**
 * The order to act on: the one named, or else the most recent.
 *
 * Defaulting to the newest is what makes this usable right after
 * clicking subscribe in the browser -- the MerchantTradeNo is generated
 * server-side and never shown, so requiring it would mean a trip through
 * the database every single time.
 */
const findOrder = async (merchantTradeNo?: string): Promise<Order> => {
  const db = getDb();
  const rows =
    merchantTradeNo === undefined
      ? await db
          .select()
          .from(paymentOrderTable)
          .orderBy(desc(paymentOrderTable.id))
          .limit(1)
      : await db
          .select()
          .from(paymentOrderTable)
          .where(eq(paymentOrderTable.merchantTradeNo, merchantTradeNo))
          .limit(1);

  const [order] = rows;
  if (order === undefined)
    throw new Error(
      merchantTradeNo === undefined
        ? 'no payment_order rows at all -- start a checkout in the webapp first'
        : `no payment_order with merchant_trade_no=${merchantTradeNo}`
    );
  return order;
};

/** ECPay's own numbering, near enough: unique, numeric, ever-increasing. */
const freshGwsr = (): string => String(Date.now()).slice(-8);

type Payload = Record<string, string>;

/**
 * A notification shaped the way ECPay documents it.
 *
 * ECPay's page for this notification contradicts itself -- the field
 * list says ProcessDate and AuthCode, the schema on the same page says
 * process_date and auth_code -- so the backend reads both and this can
 * send either. Running the same scenario twice, once with
 * --pascal-case, is the only way to find out from here that neither
 * spelling is dropped.
 */
const buildPayload = (
  order: Order,
  args: Args,
  overrides: Payload = {}
): Payload => {
  const amount = String(args.amount ?? order.periodAmount);
  const now = formatEcpayDate(new Date());
  const cased = (snake: string, pascal: string): string =>
    args.pascalCase ? pascal : snake;

  const payload: Payload = {
    MerchantID: process.env.ECPAY_MERCHANT_ID ?? '3002607',
    MerchantTradeNo: order.merchantTradeNo,
    RtnCode: '1',
    RtnMsg: '付款成功',
    PeriodType: order.periodType,
    Frequency: String(order.frequency),
    ExecTimes: String(order.execTimes),
    Amount: amount,
    gwsr: freshGwsr(),
    [cased('process_date', 'ProcessDate')]: now,
    [cased('auth_code', 'AuthCode')]: '777777',
    FirstAuthAmount: amount,
    TotalSuccessTimes: '1',
    TotalSuccessAmount: amount,
    PeriodAmount: String(order.periodAmount),
    TradeNo: `EC${freshGwsr()}`,
    TradeAmt: amount,
    PaymentDate: now,
    PaymentType: 'Credit_CreditCard',
    ...overrides,
  };

  // Signed last, over whatever the overrides left behind: signing a
  // payload and then editing it is exactly the bug the backend's
  // signature check exists to catch.
  return { ...payload, CheckMacValue: genCheckMacValue(payload) };
};

type Sent = { status: number; body: string };

/**
 * Posts with no Content-Type, on purpose.
 *
 * CloudFront's /api/* behaviour forwards only Authorization and Accept,
 * so in production that header does not survive the trip. Sending it
 * here would make this script pass against a backend that breaks the
 * moment it is deployed.
 */
const send = async (baseUrl: string, path: string, payload: Payload): Promise<Sent> => {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    body: new URLSearchParams(payload).toString(),
  });
  return { status: res.status, body: (await res.text()).trim() };
};

const describeState = async (userId: number): Promise<string> => {
  const db = getDb();
  const subs = await db
    .select()
    .from(userSubscriptionTable)
    .where(eq(userSubscriptionTable.userId, userId))
    .orderBy(userSubscriptionTable.id);
  const charges = await db
    .select()
    .from(paymentChargeTable)
    .orderBy(paymentChargeTable.id);

  const lines = subs.map(
    (s) =>
      `    #${s.id} ${s.plan} ${s.status} ` +
      `${s.currentPeriodStart?.toISOString() ?? '?'} -> ` +
      `${s.currentPeriodEnd?.toISOString() ?? '?'}`
  );
  return (
    `  subscriptions (${subs.length}):\n${lines.join('\n') || '    (none)'}\n` +
    `  charges: ${charges.length}`
  );
};

const PERIOD = '/api/webhook/ecpay/period';
const NOTIFY = '/api/webhook/ecpay/notify';

const run = async (args: Args): Promise<void> => {
  const order = await findOrder(args.order);
  console.log(
    `order #${order.id} ${order.merchantTradeNo} plan=${order.plan} ` +
      `status=${order.status} userId=${order.userId} amount=${order.periodAmount}`
  );
  console.log('before:');
  console.log(await describeState(order.userId));

  const report = ({ status, body }: Sent, label: string): void =>
    console.log(`  ${label} -> HTTP ${status} ${JSON.stringify(body)}`);

  switch (args.scenario) {
    case 'first':
      report(await send(args.baseUrl, NOTIFY, buildPayload(order, args)), NOTIFY);
      break;

    case 'renew':
      // A later charge in the same agreement. TotalSuccessTimes is what
      // ECPay increments; the subscription period must chain onto the
      // one already paid for rather than restarting from today.
      report(
        await send(
          args.baseUrl,
          PERIOD,
          buildPayload(order, args, { TotalSuccessTimes: '2' })
        ),
        PERIOD
      );
      break;

    case 'replay': {
      // The same notification twice, gwsr and all. ECPay re-sends up to
      // four times when it does not get 1|OK, so the second must be
      // acknowledged and must grant nothing.
      const payload = buildPayload(order, args);
      report(await send(args.baseUrl, PERIOD, payload), `${PERIOD} (1st)`);
      report(await send(args.baseUrl, PERIOD, payload), `${PERIOD} (2nd, identical)`);
      break;
    }

    case 'declined':
      // A declined renewal must not revoke anything: ECPay keeps
      // retrying and the user has paid for the days they are in.
      report(
        await send(
          args.baseUrl,
          PERIOD,
          buildPayload(order, args, { RtnCode: '10100058', RtnMsg: '授權失敗' })
        ),
        PERIOD
      );
      break;

    case 'simulated':
      // ECPay's back office can replay a notification as a test. It
      // looks real; no money moved; it must buy nothing.
      report(
        await send(
          args.baseUrl,
          PERIOD,
          buildPayload(order, args, { SimulatePaid: '1' })
        ),
        PERIOD
      );
      break;
  }

  console.log('after:');
  console.log(await describeState(order.userId));
};

const main = async (): Promise<void> => {
  for (const name of ['ECPAY_HASH_KEY', 'ECPAY_HASH_IV'])
    if (!process.env[name])
      throw new Error(
        `${name} is not set in .env.local -- the signature would not match ` +
          `the one the backend computes, and every send would answer 400`
      );

  try {
    await run(parseArgs(process.argv.slice(2)));
  } finally {
    await closeDb();
  }
};

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
