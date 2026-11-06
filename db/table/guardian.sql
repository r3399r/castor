CREATE TABLE IF NOT EXISTS castor.guardian (
    id INT UNSIGNED AUTO_INCREMENT,
    code VARCHAR(50) NOT NULL, -- stable slug (e.g. 'forest'), not shown to users
    name VARCHAR(100) NOT NULL,
    theme VARCHAR(100) NOT NULL,
    cost INT UNSIGNED NOT NULL, -- points required to redeem one of this guardian in the store
    -- 1 = this spirit may direct its LV5 donation to any public-interest
    -- category, instead of being confined to its own. Planned for the VIP
    -- spirit; 0 for all seven themed guardians, which is today's
    -- behaviour. A flag rather than a hard-coded check on `code`, so the
    -- rule stays data like the rest of the guardian catalog. A guardian
    -- with this set is not itself a category and must never be stored in
    -- donation.guardian_id.
    unrestricted_category TINYINT(1) NOT NULL DEFAULT 0,
    sort_order TINYINT UNSIGNED NOT NULL DEFAULT 0,
    is_active TINYINT NOT NULL DEFAULT 1, -- inactive guardians stay in the catalog (existing owners keep theirs) but drop out of the store listing
    created_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_code (code)
);
