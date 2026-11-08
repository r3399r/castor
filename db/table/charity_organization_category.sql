-- Which public-interest categories an organisation is offered under.
--
-- Many-to-many rather than a category_id column on the organisation: a
-- large foundation plausibly belongs under two categories at once (child
-- welfare and education, say), and widening it later would mean a
-- migration plus rewriting every query that reads it.
--
-- Was charity_organization_guardian, pointing at guardian. It never meant
-- "this organisation belongs to this egg" -- it meant category all along,
-- which is now a table of its own. See db/table/charity_category.sql.
CREATE TABLE IF NOT EXISTS castor.charity_organization_category (
    organization_id INT UNSIGNED NOT NULL,
    category_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (organization_id, category_id),
    FOREIGN KEY (organization_id) REFERENCES castor.charity_organization(id),
    FOREIGN KEY (category_id) REFERENCES castor.charity_category(id),
    -- The chooser always reads "given this category, which organisations",
    -- which the primary key alone cannot serve efficiently.
    INDEX idx_category (category_id)
);
