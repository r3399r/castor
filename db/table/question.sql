CREATE TABLE IF NOT EXISTS castor.question (
    id INT UNSIGNED AUTO_INCREMENT,
    rid VARCHAR(16) NOT NULL,
    title VARCHAR(255) NOT NULL,
    category_id INT UNSIGNED NOT NULL,
    content TEXT NOT NULL,
    fb_post_id VARCHAR(255) NULL,
    source VARCHAR(255) NULL,
    count INT UNSIGNED NOT NULL DEFAULT 0,
    scoring_rate DOUBLE NULL,
    avg_elapsed_time_ms DOUBLE NULL,
    created_at DATETIME(3) NULL,
    updated_at DATETIME(3) NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (category_id) REFERENCES category(id)
);