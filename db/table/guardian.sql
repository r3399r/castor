CREATE TABLE IF NOT EXISTS castor.guardian (
    id INT UNSIGNED AUTO_INCREMENT,
    code VARCHAR(50) NOT NULL, -- stable slug (e.g. 'forest'), not shown to users
    name VARCHAR(100) NOT NULL,
    -- This egg's own displayed theme. For the seven themed eggs it reads
    -- the same as their category's name today, but it is the *species'*
    -- label, not the category's: /api/guardian and /api/store print it,
    -- including for a species with no category at all (VIP). Once one
    -- category holds several eggs their themes will differ from it.
    theme VARCHAR(100) NOT NULL,
    cost INT UNSIGNED NOT NULL, -- points required to redeem one of this guardian in the store
    -- The public-interest category this species supports, or NULL for a
    -- species that is not tied to one. NULL is what the VIP spirit is:
    -- its owner may direct the donation at any category. That replaced
    -- an unrestricted_category TINYINT flag, which said the same thing
    -- without the database being able to enforce it.
    category_id INT UNSIGNED NULL,
    sort_order TINYINT UNSIGNED NOT NULL DEFAULT 0,
    is_active TINYINT NOT NULL DEFAULT 1, -- inactive guardians stay in the catalog (existing owners keep theirs) but drop out of the store listing
    created_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_code (code),
    -- Named, unlike every other foreign key in this schema, because this
    -- is the one table built by two different paths: a fresh environment
    -- gets it from this file, while an existing database got it from
    -- db/script/v1.1.0/donation.sql, whose ALTER names it. Leaving it
    -- unnamed here gives a rebuilt dev database `guardian_ibfk_1` while
    -- production carries `fk_guardian_category` -- two schemas that look
    -- identical until something tries to DROP FOREIGN KEY by name.
    CONSTRAINT fk_guardian_category
      FOREIGN KEY (category_id) REFERENCES castor.charity_category(id)
);
