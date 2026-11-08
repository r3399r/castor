-- A public-interest category a donation can be directed at.
--
-- This used to be the guardian row itself: guardian.theme held the seven
-- category names, so "the category" and "the egg you grow" were one
-- record. That worked only while they were exactly 1:1, and nothing
-- enforced it -- guardian has a unique key on code but none on theme, so
-- a second egg sharing a theme would have split one category into two
-- identically-named groups on the public page, silently.
--
-- Separating them buys three things the coupled version could not do:
--
--   * a category can be added without shipping a new egg (artwork, a
--     store listing, a price);
--   * several eggs can belong to one category, which is how artwork
--     variety gets added later;
--   * VIP stops needing a flag. A guardian that is not a category simply
--     has category_id NULL, which is the same statement
--     guardian.unrestricted_category was making, except the schema now
--     enforces it instead of the application remembering to check.
--
-- Note which column names mean what from here on: user_guardian.guardian_id
-- is a *species*, donation.category_id is a *category*. Those were both
-- called guardian_id before, in two tables, meaning two different things.
CREATE TABLE IF NOT EXISTS castor.charity_category (
    id INT UNSIGNED AUTO_INCREMENT,

    -- Stable slug, not shown to users. The join key for anything outside
    -- the database that needs to name a category, the same role
    -- guardian.code plays for artwork.
    code VARCHAR(50) NOT NULL,

    -- The displayed category name, e.g. '兒少、家庭與婦幼'. This is the
    -- string guardian.theme used to hold.
    name VARCHAR(100) NOT NULL,

    sort_order TINYINT UNSIGNED NOT NULL DEFAULT 0,

    -- Inactive categories stay here: existing donations point at them and
    -- the public record has to keep naming them. They drop out of the
    -- picker only.
    is_active TINYINT NOT NULL DEFAULT 1,

    created_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_code (code),
    -- The 1:1-with-eggs accident is not repeated: name is unique, so two
    -- categories cannot be created with the same label.
    UNIQUE KEY uk_name (name),
    INDEX idx_active_sort (is_active, sort_order)
);
