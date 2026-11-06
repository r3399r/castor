-- Which public-interest categories an organisation is offered under.
--
-- The category IS the guardian: guardian.theme holds the seven category
-- names, so there is no separate category table to join through. A user
-- who maxes the forest spirit is shown the organisations linked to the
-- forest guardian.
--
-- Many-to-many rather than a guardian_id column on the organisation: a
-- large foundation plausibly belongs under two eggs at once (child
-- welfare and education, say), and widening it later would mean a
-- migration plus rewriting every query that reads it.
CREATE TABLE IF NOT EXISTS castor.charity_organization_guardian (
    organization_id INT UNSIGNED NOT NULL,
    guardian_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (organization_id, guardian_id),
    FOREIGN KEY (organization_id) REFERENCES castor.charity_organization(id),
    FOREIGN KEY (guardian_id) REFERENCES castor.guardian(id),
    -- The chooser always reads "given this category, which organisations",
    -- which the primary key alone cannot serve efficiently.
    INDEX idx_guardian (guardian_id)
);
