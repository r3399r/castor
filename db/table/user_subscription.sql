-- One row per subscription *period*, not per user: a renewal or a
-- re-subscribe after cancelling inserts a new row rather than updating
-- the old one, so the table records both the current state and the
-- history. A UNIQUE(user_id) would have made renewals overwrite the
-- previous period and lose exactly the history this table exists to keep.
--
-- Billing history (individual charges, refunds, invoices) is deliberately
-- NOT here -- that is a different grain, and the payment provider holds
-- the authoritative record. provider_ref is what reconciles the two. If a
-- local ledger is ever needed it belongs in its own table, standing to
-- this one as point_transaction stands to user.total_points.
--
-- Nothing is added to the user table: the foreign key lives on this side,
-- the same way user_concept_stat, user_stat_history, user_guardian,
-- user_wrong_question and point_transaction already do it.
CREATE TABLE IF NOT EXISTS castor.user_subscription (
    id INT UNSIGNED AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    plan VARCHAR(32) NOT NULL, -- monthly, annual
    status VARCHAR(16) NOT NULL, -- active, cancelled, expired, past_due
    current_period_start DATETIME(3) NOT NULL,
    -- Access is granted on status = 'active' AND this being in the future,
    -- so a lapsed row stops granting access without anything having to
    -- sweep it.
    current_period_end DATETIME(3) NOT NULL,
    provider VARCHAR(32) NULL, -- payment provider, NULL while seeded by hand
    provider_ref VARCHAR(255) NULL, -- that provider's subscription id, for reconciliation
    created_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    -- Enforces "at most one active subscription per user" in the database
    -- rather than in application code. MySQL has no partial indexes, but a
    -- UNIQUE index ignores NULLs, so collapsing every non-active row to
    -- NULL leaves only the active ones competing for uniqueness. Worth the
    -- indirection because the duplicate-active bug is one a retried
    -- payment webhook creates, which is the hardest case to get right by
    -- hand. Doubles as the lookup index for the access check.
    active_user_id INT UNSIGNED GENERATED ALWAYS AS (IF(status = 'active', user_id, NULL)) STORED,

    PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES castor.user(id),
    UNIQUE KEY unique_active_subscription (active_user_id),
    INDEX idx_user_created (user_id, created_at)
);
