-- Proof that a batch was actually paid: the transfer slip, the receipt
-- the organisation issued, a thank-you letter. Its own table rather than
-- a column on donation_batch because one payout routinely produces more
-- than one document, and they arrive at different times (the slip the
-- same day, the receipt weeks later).
CREATE TABLE IF NOT EXISTS castor.donation_batch_evidence (
    id INT UNSIGNED AUTO_INCREMENT,
    batch_id INT UNSIGNED NOT NULL,

    -- TRANSFER_RECEIPT, ORG_RECEIPT, THANK_YOU_LETTER. A varchar rather
    -- than an enum, matching point_transaction.type: new kinds of proof
    -- should not need a schema change.
    kind VARCHAR(50) NOT NULL,

    url VARCHAR(500) NOT NULL,

    -- Stored alongside the URL instead of being parsed back out of it.
    -- deleteFromS3 takes a key, and deriving one from a URL breaks
    -- silently the moment the bucket or region changes.
    s3_key VARCHAR(500) NOT NULL,

    caption VARCHAR(255) NULL,
    sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    created_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    FOREIGN KEY (batch_id) REFERENCES castor.donation_batch(id),
    INDEX idx_batch_sort (batch_id, sort_order)
);
