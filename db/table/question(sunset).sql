CREATE TABLE IF NOT EXISTS castor.question (
    id INT UNSIGNED AUTO_INCREMENT,
    uuid VARCHAR(36) NOT NULL,
    title VARCHAR(255) NULL,
    category_id INT UNSIGNED NOT NULL,
    content TEXT NULL,
    fb_post_id VARCHAR(255) NULL,
    source VARCHAR(255) NULL,
    difficulty TINYINT UNSIGNED NULL,
    -- count INT UNSIGNED NOT NULL DEFAULT 0, -- sunset
    -- scoring_rate DOUBLE NULL, -- sunset
    attemp_count INT UNSIGNED NOT NULL DEFAULT 0, -- replace count
    scoring_total DOUBLE NOT NULL DEFAULT 0, -- scoring_rate = scoring_total / attemp_count
    discrimination FLOAT NULL, -- first 33% - last 33% scoring_rate
    created_at DATETIME(3) NULL,
    updated_at DATETIME(3) NULL,
    PRIMARY KEY (id),
    UNIQUE (uuid),
    FOREIGN KEY (category_id) REFERENCES category(id)
);