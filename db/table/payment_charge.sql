-- One row per authorisation notification ECPay sends us: the first
-- charge and every scheduled renewal after it, failures included.
--
-- This is the local billing ledger user_subscription.sql says belongs in
-- its own table, standing to payment_order as point_transaction stands
-- to user.total_points. ECPay holds the authoritative record; this
-- exists so a support question ("why was I charged?", "why did my
-- access stop?") can be answered from our own database, and so a
-- replayed webhook cannot grant a second period.
CREATE TABLE IF NOT EXISTS castor.payment_charge (
    id INT UNSIGNED AUTO_INCREMENT,
    payment_order_id INT UNSIGNED NOT NULL,

    -- ECPay's gwsr: the authorisation transaction number, unique per
    -- successful charge, and so the idempotency key for granting a
    -- period. ECPay retries a notification it did not get a `1|OK` for,
    -- so without this a retry would extend the subscription twice.
    --
    -- NULL on a failed authorisation, which carries no usable
    -- authorisation number (ECPay sends 0 or omits it). That is why the
    -- column is nullable rather than defaulted: MySQL's UNIQUE ignores
    -- NULLs, so several failures on one order can coexist, while every
    -- success still gets deduplicated. Duplicating a failure row is
    -- harmless -- a failure grants nothing.
    gwsr VARCHAR(32) NULL,

    rtn_code INT NOT NULL, -- 1 = authorised; anything else is a failure
    rtn_msg VARCHAR(255) NULL,
    amount INT UNSIGNED NOT NULL,
    auth_code VARCHAR(10) NULL,
    process_date DATETIME(3) NULL, -- ECPay's authorisation time, not ours
    -- ECPay's running count of successful charges on this agreement.
    -- Kept for reconciliation: if it ever runs ahead of the rows here, a
    -- notification was lost and the order query has to be used to catch
    -- up.
    total_success_times INT UNSIGNED NULL,
    -- 1 when the charge was simulated from ECPay's back office. Such a
    -- notification looks exactly like a real one but no money moved, so
    -- it must never grant a period.
    simulate_paid TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (id),
    FOREIGN KEY (payment_order_id) REFERENCES castor.payment_order(id),
    UNIQUE KEY unique_gwsr (gwsr),
    INDEX idx_order_created (payment_order_id, created_at)
);
