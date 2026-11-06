-- The foundations and associations a user can direct the platform's LV5
-- contribution to. Curated by hand through the admin UI -- there is no
-- sign-up flow and never will be, since every row here is a real
-- organisation the platform has an arrangement with.
--
-- Rows are never deleted. A donation made years ago still has to render
-- its recipient's name and introduction on the public record page, so a
-- withdrawn organisation is switched to is_active = 0 and simply stops
-- appearing in the chooser.
CREATE TABLE IF NOT EXISTS castor.charity_organization (
    id INT UNSIGNED AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,

    -- The Taiwanese unified business number. The only identifier that
    -- genuinely does not collide, and the one that goes on the transfer.
    -- Nullable because small associations are not always findable, but
    -- unique when present, so the same foundation cannot be entered
    -- twice under two spellings of its name.
    tax_id VARCHAR(8) NULL,

    introduction TEXT NOT NULL,
    website_url VARCHAR(500) NULL,
    logo_url VARCHAR(500) NULL,

    sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,

    created_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_tax_id (tax_id),
    INDEX idx_active_sort (is_active, sort_order)
);
