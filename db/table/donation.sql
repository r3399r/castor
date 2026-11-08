-- One user's contribution, earned by growing one spirit to MAX_LEVEL and
-- directed at one organisation. The user pays nothing; the platform does.
--
-- The row is created when the user confirms a choice, not when the
-- spirit reaches max level. That means a spirit that is maxed but whose
-- owner has not chosen yet has no row here, so the public page's
-- "promised so far" figure is counted from user_guardian at max level
-- rather than from SUM(amount) over this table.
CREATE TABLE IF NOT EXISTS castor.donation (
    id INT UNSIGNED AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,

    -- The entitlement itself: one maxed spirit buys one choice. The
    -- unique key on this column is the load-bearing constraint of the
    -- whole feature -- without it a replayed confirmation becomes a
    -- second promise of real money.
    user_guardian_id INT UNSIGNED NOT NULL,

    -- The public-interest category the user actually chose. Usually the
    -- category of the spirit's own species, which is why it looks
    -- redundant -- but a species with no category of its own (VIP, whose
    -- guardian.category_id is NULL) may donate to any of them, so it
    -- cannot be recovered by joining through user_guardian.
    category_id INT UNSIGNED NOT NULL,

    organization_id INT UNSIGNED NOT NULL,

    -- Frozen at confirmation. Never read from a constant at display
    -- time: the amount is still provisional, and a later change must not
    -- silently rewrite what past records say was promised.
    amount INT UNSIGNED NOT NULL,

    -- NULL means awaiting payout, set means paid. There is deliberately
    -- no separate status column -- status and batch_id would be two
    -- sources for one fact -- and no disbursed_at either, since that
    -- date belongs to donation_batch.transferred_at.
    batch_id INT UNSIGNED NULL,

    confirmed_at DATETIME(3) NOT NULL,
    created_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES castor.user(id),
    FOREIGN KEY (user_guardian_id) REFERENCES castor.user_guardian(id),
    FOREIGN KEY (category_id) REFERENCES castor.charity_category(id),
    FOREIGN KEY (organization_id) REFERENCES castor.charity_organization(id),
    FOREIGN KEY (batch_id) REFERENCES castor.donation_batch(id),
    UNIQUE KEY uk_user_guardian (user_guardian_id),
    INDEX idx_user_confirmed (user_id, confirmed_at),
    -- Serves the admin question "what is still owed to this
    -- organisation", and the batch page's aggregate over its members.
    INDEX idx_organization_batch (organization_id, batch_id)
);
