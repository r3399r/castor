import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  buildPeriodCheckoutParams,
  decryptData,
  dotNetUrlEncode,
  encryptData,
  formatEcpayDate,
  genCheckMacValue,
  generateMerchantTradeNo,
  parseEcpayDate,
  verifyCheckMacValue,
} from 'src/lib/ecpay';

/**
 * ECPay's signing and encoding, which is the part of the integration
 * that fails silently.
 *
 * A wrong encoding rule does not throw: it produces a perfectly
 * well-formed CheckMacValue that ECPay rejects at their gateway, or --
 * worse, on the inbound side -- makes us reject a real payment
 * notification and lose a paid subscription. None of that is reachable
 * from a type checker, so it is pinned here against ECPay's own
 * published worked example.
 */

// From ECPay's "檢查碼機制" appendix. Documentation test values only.
const SAMPLE_HASH_KEY = 'pwFHCqoQZGmho4w6';
const SAMPLE_HASH_IV = 'EkRm7iFT261dpevs';

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.ECPAY_HASH_KEY = SAMPLE_HASH_KEY;
  process.env.ECPAY_HASH_IV = SAMPLE_HASH_IV;
  process.env.ECPAY_MERCHANT_ID = '3002607';
  process.env.PUBLIC_BASE_URL = 'https://example.test';
  delete process.env.ECPAY_MODE;
});

afterAll(() => {
  process.env = originalEnv;
});

describe('genCheckMacValue', () => {
  it("reproduces ECPay's published worked example", () => {
    // Exactly the parameters and values from the appendix, whose
    // documented answer is the hash below. If this ever fails, the
    // encoding changed and every order we sign is being rejected.
    expect(
      genCheckMacValue({
        MerchantID: '3002607',
        MerchantTradeNo: 'ecpay20230312153023',
        MerchantTradeDate: '2023/03/12 15:30:23',
        PaymentType: 'aio',
        TotalAmount: '30000',
        TradeDesc: '促銷方案',
        ItemName: 'Apple iphone 15',
        ReturnURL: 'https://www.ecpay.com.tw/receive.php',
        ChoosePayment: 'ALL',
        EncryptType: '1',
      })
    ).toBe('6C51C9E6888DE861FD62FB1DD17029FC742634498FD813DC43D4243B5685B840');
  });

  it('does not depend on the order the parameters were written in', () => {
    const a = genCheckMacValue({ B: '2', A: '1', C: '3' });
    const b = genCheckMacValue({ C: '3', A: '1', B: '2' });
    expect(a).toBe(b);
  });
});

describe('dotNetUrlEncode', () => {
  // The three places JavaScript and .NET disagree. Each one is a silent
  // rejection by ECPay rather than an error on our side.
  it('encodes a space as + rather than %20', () => {
    expect(dotNetUrlEncode('a b')).toBe('a+b');
  });

  it('escapes ~ and \', which encodeURIComponent leaves raw', () => {
    expect(dotNetUrlEncode('~')).toBe('%7e');
    expect(dotNetUrlEncode("'")).toBe('%27');
  });

  it('leaves the characters .NET also leaves raw', () => {
    expect(dotNetUrlEncode("-_.!*()")).toBe("-_.!*()");
  });
});

describe('verifyCheckMacValue', () => {
  it('accepts a payload signed with the same key', () => {
    const payload = { MerchantTradeNo: 'CS1', RtnCode: '1' };
    expect(
      verifyCheckMacValue({ ...payload, CheckMacValue: genCheckMacValue(payload) })
    ).toBe(true);
  });

  it('rejects a payload whose amount was altered after signing', () => {
    const payload = { MerchantTradeNo: 'CS1', RtnCode: '1', TradeAmt: '199' };
    const CheckMacValue = genCheckMacValue(payload);
    expect(verifyCheckMacValue({ ...payload, TradeAmt: '1', CheckMacValue })).toBe(false);
  });

  it('rejects a payload carrying no CheckMacValue at all', () => {
    expect(verifyCheckMacValue({ MerchantTradeNo: 'CS1' })).toBe(false);
  });
});

describe('AES payload encryption', () => {
  it('round-trips a JSON payload', () => {
    const payload = { MerchantID: '3002607', MerchantTradeNo: 'CS1', Action: 'Cancel' };
    expect(decryptData(encryptData(payload))).toEqual(payload);
  });

  it('survives the characters the URL-encoding step rewrites', () => {
    // A literal + must come back a +, not a space: the decode replaces
    // + with space, and only survives because a real plus is %2b.
    const payload = { RtnMsg: 'a + b 促銷 ~ end' };
    expect(decryptData(encryptData(payload))).toEqual(payload);
  });
});

describe('ECPay timestamps', () => {
  it('formats in GMT+8 regardless of the host timezone', () => {
    // Lambda runs in UTC; ECPay reads this as Taipei wall-clock, so the
    // naive local-time formatting is eight hours wrong.
    expect(formatEcpayDate(new Date('2024-03-12T07:30:23.000Z'))).toBe('2024/03/12 15:30:23');
  });

  it('parses an authorisation time back out of GMT+8', () => {
    expect(parseEcpayDate('2024/03/12 15:30:23')?.toISOString()).toBe('2024-03-12T07:30:23.000Z');
  });

  it('returns null for a value ECPay did not send', () => {
    expect(parseEcpayDate(undefined)).toBeNull();
    expect(parseEcpayDate('')).toBeNull();
  });
});

describe('generateMerchantTradeNo', () => {
  it('stays inside ECPay limits: at most 20 alphanumeric characters', () => {
    for (let i = 0; i < 50; i += 1) {
      const no = generateMerchantTradeNo();
      expect(no.length).toBeLessThanOrEqual(20);
      expect(no).toMatch(/^[A-Z0-9]+$/);
    }
  });

  it('does not repeat within the same millisecond', () => {
    const generated = new Set(Array.from({ length: 200 }, () => generateMerchantTradeNo()));
    expect(generated.size).toBe(200);
  });
});

describe('buildPeriodCheckoutParams', () => {
  const params = () =>
    buildPeriodCheckoutParams({
      merchantTradeNo: 'CS123',
      tradeDate: new Date('2024-03-12T07:30:23.000Z'),
      itemName: '學益訂閱 月繳方案',
      tradeDesc: '學益 Learn for Good 訂閱',
      amount: 199,
      periodType: 'M',
      frequency: 1,
      execTimes: 99,
    });

  it('signs itself, and the signature verifies', () => {
    expect(verifyCheckMacValue(params())).toBe(true);
  });

  it('charges each period the same as the total, as ECPay requires', () => {
    const p = params();
    expect(p.PeriodAmount).toBe(p.TotalAmount);
  });

  it('asks for credit card, the only method recurring billing supports', () => {
    expect(params().ChoosePayment).toBe('Credit');
  });

  it('sends the browser back by GET, not by a POST the static site cannot answer', () => {
    const p = params();
    expect(p.ClientBackURL).toBe('https://example.test/subscription/result');
    expect(p.OrderResultURL).toBeUndefined();
  });

  it('builds both callback URLs from PUBLIC_BASE_URL', () => {
    const p = params();
    expect(p.ReturnURL).toBe('https://example.test/api/webhook/ecpay/notify');
    expect(p.PeriodReturnURL).toBe('https://example.test/api/webhook/ecpay/period');
  });
});
