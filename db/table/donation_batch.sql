-- One actual transfer of money from the platform to one organisation.
--
-- Payouts are batched because a NT$1,000 wire costs more in fees than it
-- carries: several confirmed donations to the same organisation are paid
-- together and share one set of evidence. A single-donation payout is
-- simply a batch holding one donation, so nothing special is needed for
-- the one-at-a-time case.
--
-- What makes a batch verifiable to the person whose NT$1,000 is inside
-- it is that the public page prints the member count as well as the
-- total: 57 donations x NT$1,000 plus NT$3,000 of platform top-up is
-- NT$60,000, and the receipt says NT$60,000. That arithmetic only works
-- while every donation carries the same amount. If amounts ever become
-- tiered, the page has to group by donation.amount instead.
CREATE TABLE IF NOT EXISTS castor.donation_batch (
    id INT UNSIGNED AUTO_INCREMENT,
    organization_id INT UNSIGNED NOT NULL,

    -- What actually left the platform's account. A fact about the bank,
    -- so it is stored. The member count and their subtotal are NOT
    -- stored: they are aggregated from donation.batch_id on read, since
    -- a batch's membership is frozen once created (donation rows cannot
    -- be cancelled or re-pointed at another batch). Caching them here
    -- would only add two columns that can disagree with the rows.
    --
    -- transferred_amount minus that subtotal is the platform's top-up,
    -- which is how the public page labels it. A negative difference
    -- means less was sent than was promised, so the admin UI must refuse
    -- to publish such a batch rather than display it.
    transferred_amount INT UNSIGNED NOT NULL,

    -- The date the money moved, not the date this row was typed in.
    transferred_at DATETIME(3) NOT NULL,
    reference VARCHAR(100) NULL, -- bank transaction number, or the last digits of the account

    note TEXT NULL,

    -- The public record page lists published batches only, so a batch can
    -- be entered, checked and have its evidence attached before anyone
    -- outside sees it.
    published TINYINT(1) NOT NULL DEFAULT 0,

    created_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    FOREIGN KEY (organization_id) REFERENCES castor.charity_organization(id),
    INDEX idx_published_transferred (published, transferred_at)
);
