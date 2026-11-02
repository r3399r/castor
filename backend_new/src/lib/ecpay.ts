import crypto from 'node:crypto';
import { BadGatewayError } from 'src/model/error';

/**
 * Everything that speaks ECPay's wire format, in one place.
 *
 * ECPay uses two unrelated authentication schemes and mixing them up is
 * the easy mistake: the checkout form (AioCheckOut) is signed with a
 * SHA256 `CheckMacValue`, while the newer JSON APIs (here, cancelling a
 * recurring agreement) carry an AES-128-CBC encrypted `Data` field. Both
 * derive from the same HashKey/HashIV pair, which is why they look
 * interchangeable and are not.
 *
 * Nothing here touches the database or the request context, so the
 * signing and encoding can be tested on their own against ECPay's
 * published sample values -- which is the only way to find out that an
 * encoding rule is wrong before a real card is declined.
 */

export const ECPAY_PROVIDER = 'ecpay';

/** ECPay's acknowledgement string. Anything else and it retries. */
export const ECPAY_ACK = '1|OK';

const requiredEnv = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value === '')
    throw new BadGatewayError(`${name} is not configured`, 'ECPAY_NOT_CONFIGURED');
  return value;
};

// Stage and production are different hosts, and the two APIs do not even
// share a hostname within one environment, so they are a lookup rather
// than something derived from a single base URL.
const ENDPOINTS = {
  stage: {
    checkout: 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5',
    periodAction: 'https://ecpayment-stage.ecpay.com.tw/1.0.0/Cashier/CreditCardPeriodAction',
  },
  production: {
    checkout: 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5',
    periodAction: 'https://ecpayment.ecpay.com.tw/1.0.0/Cashier/CreditCardPeriodAction',
  },
} as const;

/**
 * Which ECPay to talk to. Defaults to stage, and production has to be
 * asked for by name: the failure mode of guessing wrong in that
 * direction is a real card being charged from a test deploy, while
 * guessing wrong the other way just means nothing gets paid and someone
 * notices immediately.
 */
const endpoints = () =>
  process.env.ECPAY_MODE === 'production' ? ENDPOINTS.production : ENDPOINTS.stage;

export const checkoutUrl = (): string => endpoints().checkout;

/**
 * Public origin of the deployed site, used to build the three URLs ECPay
 * calls back on. One variable rather than three because CloudFront
 * serves the webapp and /api/* from the same distribution. ECPay
 * requires a domain name here -- an IP is rejected.
 */
const baseUrl = (): string => requiredEnv('PUBLIC_BASE_URL').replace(/\/+$/, '');

export const returnUrl = (): string => `${baseUrl()}/api/webhook/ecpay/notify`;
export const periodReturnUrl = (): string => `${baseUrl()}/api/webhook/ecpay/period`;
export const clientBackUrl = (): string => `${baseUrl()}/subscription/result`;

/**
 * ECPay encodes with .NET's `HttpUtility.UrlEncode`, which differs from
 * JavaScript's `encodeURIComponent` in exactly three places, and every
 * one of them is silent: a mismatch produces a well-formed CheckMacValue
 * that ECPay simply rejects.
 *
 * - space is `+`, not `%20`
 * - `~` and `'` are escaped by .NET; encodeURIComponent leaves them raw
 *
 * The characters .NET leaves raw that encodeURIComponent also leaves raw
 * (`-_.!*()`) need no handling, which is why this is three replaces and
 * not a translation table.
 */
export const dotNetUrlEncode = (value: string): string =>
  encodeURIComponent(value).replace(/%20/g, '+').replace(/~/g, '%7e').replace(/'/g, '%27');

/**
 * ECPay's checksum: sort the parameters by key, sandwich them between
 * HashKey and HashIV, URL-encode the whole string, lowercase it, SHA256
 * it, uppercase the digest.
 *
 * `CheckMacValue` itself is never part of the input, so callers
 * verifying an inbound notification must strip it first -- verify()
 * below does.
 */
export const genCheckMacValue = (params: Record<string, string>): string => {
  const hashKey = requiredEnv('ECPAY_HASH_KEY');
  const hashIv = requiredEnv('ECPAY_HASH_IV');

  const body = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  const raw = `HashKey=${hashKey}&${body}&HashIV=${hashIv}`;

  return crypto
    .createHash('sha256')
    .update(dotNetUrlEncode(raw).toLowerCase())
    .digest('hex')
    .toUpperCase();
};

/**
 * Whether a notification really came from ECPay.
 *
 * This is the only authentication a webhook route has -- it carries no
 * token and cannot, since ECPay's servers are the caller. A plain
 * comparison is enough: forging the value requires the HashKey, and
 * there is nothing to learn from how long the comparison took.
 */
export const verifyCheckMacValue = (payload: Record<string, string>): boolean => {
  const { CheckMacValue, ...rest } = payload;
  if (CheckMacValue === undefined) return false;
  return genCheckMacValue(rest) === CheckMacValue.toUpperCase();
};

// ECPay timestamps are Taipei wall-clock with no offset in the string,
// and Lambda runs in UTC, so neither direction can use the host's local
// time. Done by hand rather than with a date library because this is the
// only place in the backend that needs a fixed-offset conversion.
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, '0');

/** `yyyy/MM/dd HH:mm:ss` in GMT+8, which is the only format ECPay takes. */
export const formatEcpayDate = (date: Date): string => {
  const t = new Date(date.getTime() + TAIPEI_OFFSET_MS);
  return (
    `${t.getUTCFullYear()}/${pad(t.getUTCMonth() + 1)}/${pad(t.getUTCDate())} ` +
    `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}`
  );
};

/** The inverse, for the authorisation times ECPay reports back. */
export const parseEcpayDate = (value: string | undefined): Date | null => {
  if (value === undefined) return null;
  const m = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value.trim());
  if (m === null) return null;
  return new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])) -
      TAIPEI_OFFSET_MS
  );
};

/**
 * A MerchantTradeNo: ours to invent, at most 20 characters, letters and
 * digits only, and unique forever because ECPay rejects a reused one.
 *
 * Time-ordered prefix so the orders sort usefully in ECPay's back
 * office, with random bytes after it because two checkouts in the same
 * millisecond are possible and the collision would only surface at their
 * gateway. payment_order.merchant_trade_no is UNIQUE as well, so a
 * collision fails here instead.
 */
export const generateMerchantTradeNo = (): string =>
  `CS${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`.toUpperCase().slice(0, 20);

/**
 * AES-128-CBC with PKCS7, keyed by HashKey/HashIV -- the scheme the
 * JSON APIs use instead of CheckMacValue. The payload is URL-encoded
 * before encryption (ECPay's rule, not a transport requirement), so the
 * same .NET encoding applies here too.
 */
export const encryptData = (payload: unknown): string => {
  const cipher = crypto.createCipheriv(
    'aes-128-cbc',
    requiredEnv('ECPAY_HASH_KEY'),
    requiredEnv('ECPAY_HASH_IV')
  );
  return Buffer.concat([
    cipher.update(dotNetUrlEncode(JSON.stringify(payload)), 'utf8'),
    cipher.final(),
  ]).toString('base64');
};

export const decryptData = <T>(data: string): T => {
  const decipher = crypto.createDecipheriv(
    'aes-128-cbc',
    requiredEnv('ECPAY_HASH_KEY'),
    requiredEnv('ECPAY_HASH_IV')
  );
  const plain = Buffer.concat([
    decipher.update(Buffer.from(data, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  // `+` is a space in the .NET encoding and decodeURIComponent does not
  // know that; a literal plus arrives as %2b, so this is unambiguous.
  return JSON.parse(decodeURIComponent(plain.replace(/\+/g, ' '))) as T;
};

export type PeriodCheckoutInput = {
  merchantTradeNo: string;
  tradeDate: Date;
  /** Shown on ECPay's payment page and on the cardholder's statement. */
  itemName: string;
  tradeDesc: string;
  amount: number;
  periodType: 'D' | 'M' | 'Y';
  frequency: number;
  execTimes: number;
};

/**
 * The complete set of hidden form fields the browser POSTs to ECPay to
 * open a recurring agreement, CheckMacValue included.
 *
 * Returned to the client rather than posted from here on purpose: the
 * cardholder has to end up on ECPay's own page to enter their card, so
 * the redirect has to originate in their browser. The signature is still
 * computed server-side, so the client cannot alter the amount or the
 * callback URLs -- which is also why ReturnURL is built from
 * PUBLIC_BASE_URL and never accepted as a request parameter.
 */
export const buildPeriodCheckoutParams = (input: PeriodCheckoutInput): Record<string, string> => {
  const params: Record<string, string> = {
    MerchantID: requiredEnv('ECPAY_MERCHANT_ID'),
    MerchantTradeNo: input.merchantTradeNo,
    MerchantTradeDate: formatEcpayDate(input.tradeDate),
    PaymentType: 'aio',
    TotalAmount: String(input.amount),
    TradeDesc: input.tradeDesc,
    ItemName: input.itemName,
    ReturnURL: returnUrl(),
    // GET, unlike OrderResultURL's browser POST. The webapp is a static
    // export on S3 and cannot answer a POST at all, so OrderResultURL
    // would land the paying user on an error page.
    ClientBackURL: clientBackUrl(),
    // Recurring is credit-card only -- ECPay rejects the order outright
    // with any other ChoosePayment.
    ChoosePayment: 'Credit',
    EncryptType: '1',
    PeriodAmount: String(input.amount), // ECPay requires this to equal TotalAmount
    PeriodType: input.periodType,
    Frequency: String(input.frequency),
    ExecTimes: String(input.execTimes),
    PeriodReturnURL: periodReturnUrl(),
  };

  return { ...params, CheckMacValue: genCheckMacValue(params) };
};

type PeriodActionResponse = {
  TransCode?: number;
  TransMsg?: string;
  Data?: string;
};

type PeriodActionResult = {
  RtnCode?: number;
  RtnMsg?: string;
};

/**
 * Stops ECPay charging a recurring agreement.
 *
 * One-way: ECPay cannot re-enable a cancelled order, only a new one can
 * be created. Everything upstream of this -- resuming a subscription,
 * changing plan -- therefore has to mean "cancel and open a new
 * agreement", and the first charge of that new agreement happens
 * immediately.
 *
 * Success needs both the outer TransCode (did the request arrive intact)
 * and the encrypted RtnCode (did the cancellation happen). Checking only
 * the first reports success for a cancellation that never took effect,
 * and the user keeps being charged.
 */
export const cancelPeriodOrder = async (merchantTradeNo: string): Promise<void> => {
  const merchantId = requiredEnv('ECPAY_MERCHANT_ID');

  const res = await fetch(endpoints().periodAction, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      MerchantID: merchantId,
      // Seconds, GMT+8, and ECPay only accepts a 10-minute window around
      // its own clock.
      RqHeader: { Timestamp: Math.floor(Date.now() / 1000) },
      Data: encryptData({ MerchantID: merchantId, MerchantTradeNo: merchantTradeNo, Action: 'Cancel' }),
    }),
  });

  if (!res.ok)
    throw new BadGatewayError(`ECPay cancel failed: HTTP ${res.status}`, 'ECPAY_CANCEL_FAILED');

  const body = (await res.json()) as PeriodActionResponse;
  if (body.TransCode !== 1 || body.Data === undefined)
    throw new BadGatewayError(
      `ECPay cancel rejected: ${body.TransMsg ?? 'no message'}`,
      'ECPAY_CANCEL_FAILED'
    );

  const result = decryptData<PeriodActionResult>(body.Data);
  if (result.RtnCode !== 1)
    throw new BadGatewayError(
      `ECPay cancel rejected: ${result.RtnMsg ?? 'no message'}`,
      'ECPAY_CANCEL_FAILED'
    );
};
