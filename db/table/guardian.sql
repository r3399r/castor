CREATE TABLE IF NOT EXISTS castor.guardian (
    id INT UNSIGNED AUTO_INCREMENT,
    -- Names the species *drawn*, not the category supported ('deer' is
    -- the forest egg): it is the key webapp/lib/guardianArtwork.ts
    -- resolves to artwork. Not shown to users. These were named after
    -- the category until 2026-11-21, which read as though an egg's code
    -- and its category's slug were one namespace; uk_code means they
    -- cannot stay equal anyway, since a category's second egg needs a
    -- different code.
    code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    cost INT UNSIGNED NOT NULL, -- points required to redeem one of this guardian in the store
    -- The public-interest category this species supports, or NULL for a
    -- species that is not tied to one. NULL is what the VIP spirit is:
    -- its owner may direct the donation at any category. That replaced
    -- an unrestricted_category TINYINT flag, which said the same thing
    -- without the database being able to enforce it.
    category_id INT UNSIGNED NULL,
    -- Subscriber-only: store.ts's redeem answers SUBSCRIPTION_REQUIRED
    -- without paid access. Replaced a hardcoded `code = 'vip'` on
    -- 2026-11-21, so the paywall is data rather than a slug a rename
    -- would silently switch off. Independent of category_id -- the
    -- fennec egg sets both, but either stands alone.
    requires_subscription TINYINT NOT NULL DEFAULT 0,
    sort_order TINYINT UNSIGNED NOT NULL DEFAULT 0,
    is_active TINYINT NOT NULL DEFAULT 1, -- inactive guardians stay in the catalog (existing owners keep theirs) but drop out of the store listing
    created_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_code (code),
    FOREIGN KEY (category_id) REFERENCES castor.charity_category(id)
);

-- There is deliberately no `theme` column. It held a per-egg display
-- label, which was a copy of charity_category.name for the seven bound
-- eggs and the sentence "any category" for the eighth -- so every screen
-- that printed it printed either a duplicate or a constant. Dropped
-- 2026-11-21: the APIs carry `category` instead, and the null case is a
-- label in the frontend, which is all it ever was.
