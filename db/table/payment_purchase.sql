-- One row per one-time purchase of a fixed number of access days.
--
-- Separate from payment_order, which its own comment defines as "one row
-- per recurring-payment agreement". The two are not variations of each
-- other:
--
--   * payment_order has period_type / frequency / exec_times, a cancel
--     action, and UNIQUE(active_user_id) so a user cannot hold two live
--     agreements and be charged twice a month forever. None of that
--     applies here -- a day pass has no schedule, nothing to cancel, and
--     buying a second one is a perfectly good thing to do.
--   * a day pass can sit unpaid for days. ATM and convenience-store
--     payments issue a code and the money arrives whenever the consumer
--     gets round to it, so `created` is not a transient state here the
--     way it is for a card authorisation -- it is most of the row's life.
--
-- Entitlement still lives in user_subscription, which this extends. A
-- paid pass does NOT insert a user_subscription row: that table allows
-- one active row per user (unique_active_subscription), so stacking is
-- done by pushing current_period_end further out.
CREATE TABLE IF NOT EXISTS castor.payment_purchase (
    id INT UNSIGNED AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,

    plan VARCHAR(32) NOT NULL, -- days30, days90, days365

    provider VARCHAR(32) NOT NULL DEFAULT 'ecpay',

    -- The ECPay MerchantTradeNo: ours to generate, max 20 characters,
    -- alphanumeric only, and the identifier every notification for this
    -- purchase carries. UNIQUE because ECPay rejects a reused one, and
    -- because the callbacks are the only thing that marks a purchase
    -- paid -- ECPay retries them up to four times, so the handler has to
    -- be able to recognise a repeat rather than grant the days twice.
    merchant_trade_no VARCHAR(20) NOT NULL,

    -- Both frozen at checkout and never re-read from the plan catalog,
    -- for the same reason donation.amount is: the price and the length
    -- are what was sold at that moment, and changing the catalog must
    -- not rewrite what a past purchase says was bought.
    amount INT UNSIGNED NOT NULL,
    days SMALLINT UNSIGNED NOT NULL,

    -- Which ECPay method the user chose: Credit, ATM, CVS or BARCODE.
    -- Fixed per purchase rather than ChoosePayment=ALL, because the
    -- expiry parameter differs per method AND shares a name across two
    -- of them with different units -- StoreExpireDate is minutes for CVS
    -- and days for BARCODE -- so a single order cannot carry a correct
    -- expiry for a method that has not been chosen yet.
    choose_payment VARCHAR(16) NOT NULL,

    -- created    -- form handed to the browser; nothing is reserved and
    --               the user may simply close the tab
    -- awaiting   -- ECPay issued a code or virtual account (their
    --               PaymentInfoURL notification). The money has NOT
    --               arrived. For ATM/CVS/BARCODE this is where the row
    --               spends most of its life; a card never enters it.
    -- paid       -- payment confirmed, days granted
    -- expired    -- the code's deadline passed with no payment
    -- failed     -- ECPay reported the payment as failed
    status VARCHAR(16) NOT NULL,

    -- ECPay's own PaymentType for the completed payment, e.g.
    -- Credit_CreditCard or ATM_TAISHIN. Theirs, not ours: what we sent
    -- as `Credit` comes back as `Credit_CreditCard`. Kept because it is
    -- the only record of which bank or chain actually took the money,
    -- and because refundability depends on it -- ECPay's DoAction
    -- refund API covers credit card only, so an ATM or store payment
    -- can be refunded only by hand in their back office.
    payment_type VARCHAR(32) NULL,

    -- The payment instructions, as issued. Nullable because a card
    -- payment never has any, and because they arrive in a later
    -- notification than the one that creates this row.
    bank_code VARCHAR(10) NULL, -- ATM
    v_account VARCHAR(32) NULL, -- ATM virtual account
    payment_no VARCHAR(32) NULL, -- convenience-store code
    barcode_1 VARCHAR(32) NULL, -- store barcode, three segments
    barcode_2 VARCHAR(32) NULL,
    barcode_3 VARCHAR(32) NULL,

    -- When the code or virtual account stops being payable. Stored as a
    -- moment rather than the raw duration ECPay was sent, because the
    -- units are not comparable between methods and nothing downstream
    -- should have to remember which was which.
    expire_at DATETIME(3) NULL,

    -- ECPay's trade number. Only useful for looking the purchase up in
    -- their back office, so nothing branches on it.
    ecpay_trade_no VARCHAR(32) NULL,

    paid_at DATETIME(3) NULL,

    -- What user_subscription.current_period_end was pushed to when this
    -- was paid. A record of what the purchase actually bought, which the
    -- subscription row alone cannot show once a second pass stacks onto
    -- it.
    granted_until DATETIME(3) NULL,

    created_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES castor.user(id),
    UNIQUE KEY unique_purchase_merchant_trade_no (merchant_trade_no),
    INDEX idx_user_created (user_id, created_at),
    -- The sweep that expires unpaid codes, and the one that stops a
    -- recurring agreement after a pass is paid, both scan by status.
    INDEX idx_status_expire (status, expire_at)
);
