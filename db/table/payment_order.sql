-- One row per recurring-payment agreement with the provider, NOT per
-- charge and not per subscription period.
--
-- The split from user_subscription is deliberate and follows what that
-- table's comment already anticipated: user_subscription answers "may
-- this user have paid features, and until when", which must stay
-- readable with the provider unreachable. This table answers "what did
-- we agree with ECPay, and is it still charging", which is provider
-- state we do not own. Entitlement must not depend on a row here, so
-- nothing in the access check reads this table.
--
-- ECPay's 信用卡定期定額 is the product behind it: the cardholder
-- authorises once, and ECPay then charges on its own schedule
-- (period_type/frequency/exec_times) until the executions run out, the
-- card expires, six consecutive charges fail, or we cancel. Those are
-- ECPay's terms, not ours -- see the status column.
CREATE TABLE IF NOT EXISTS castor.payment_order (
    id INT UNSIGNED AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    plan VARCHAR(32) NOT NULL, -- monthly, annual; matches user_subscription.plan
    provider VARCHAR(32) NOT NULL DEFAULT 'ecpay',

    -- ECPay's MerchantTradeNo: ours to generate, max 20 characters,
    -- alphanumeric only, and the one identifier that appears in every
    -- notification ECPay sends for this agreement. It is therefore also
    -- what user_subscription.provider_ref points at. UNIQUE because
    -- ECPay rejects a reused one, and we would rather fail on insert
    -- than at their gateway.
    merchant_trade_no VARCHAR(20) NOT NULL,

    -- created   -- form handed to the browser; nothing has been paid and
    --              possibly never will be (the user can close the tab)
    -- active    -- first authorisation succeeded; ECPay is scheduling
    -- cancelled -- we called CreditCardPeriodAction/Cancel. One-way:
    --              ECPay cannot re-enable an order, only a new one can
    --              be created, which is why resuming a subscription is a
    --              new row here rather than a status change
    -- terminated-- ECPay stopped it by itself (executions exhausted,
    --              card expired, or six consecutive failures)
    -- failed    -- first authorisation was declined, so ECPay never
    --              scheduled anything
    status VARCHAR(16) NOT NULL,

    period_type CHAR(1) NOT NULL, -- D, M or Y, as sent to ECPay
    frequency SMALLINT UNSIGNED NOT NULL, -- every N period_types
    exec_times SMALLINT UNSIGNED NOT NULL, -- total charges ECPay will attempt
    period_amount INT UNSIGNED NOT NULL, -- NTD per charge, integer only

    -- ECPay's own trade number for the first authorisation. Only useful
    -- for looking an order up in their back office, so it is nullable
    -- and nothing branches on it.
    ecpay_trade_no VARCHAR(32) NULL,

    created_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    cancelled_at DATETIME(3) NULL,

    -- Same generated-column trick as user_subscription, for the same
    -- reason and against a sharper failure: two active agreements mean
    -- the user is charged twice a month, forever, and notices on their
    -- statement rather than in our UI. A UNIQUE index ignores NULLs, so
    -- collapsing every non-active row to NULL leaves only the live ones
    -- competing. Checkout must therefore cancel an existing active order
    -- before creating the next one -- which is exactly what changing
    -- plan has to do anyway, since ECPay cannot amend an agreement.
    active_user_id INT UNSIGNED GENERATED ALWAYS AS (IF(status = 'active', user_id, NULL)) STORED,

    PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES castor.user(id),
    UNIQUE KEY unique_merchant_trade_no (merchant_trade_no),
    UNIQUE KEY unique_active_order (active_user_id),
    INDEX idx_user_created (user_id, created_at)
);
