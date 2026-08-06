CREATE TABLE IF NOT EXISTS castor.question (
    id INT UNSIGNED AUTO_INCREMENT,
    uuid VARCHAR(36) NOT NULL,
    subject_id INT UNSIGNED NOT NULL,
    parent_id INT UNSIGNED NULL,
    fb_post_id VARCHAR(255) NULL,
    is_group TINYINT NOT NULL DEFAULT 0,
    type VARCHAR(255) NOT NULL, -- GROUP, SINGLE, MULTIPLE, TRUE_FALSE, FILL
    sort_order INT NULL, -- for GROUP
    content TEXT NULL,
    options VARCHAR(255) NULL, -- A|B|C|D or True|False or 0|1|2|3
    answer VARCHAR(255) NULL, -- A or OXOX or True or 301
    difficulty TINYINT UNSIGNED NOT NULL, -- 1~10
    attemp_count INT UNSIGNED NOT NULL DEFAULT 0,
    scoring_total DOUBLE NOT NULL DEFAULT 0, -- scoring_rate = scoring_total / attemp_count
    adjusted_difficulty DOUBLE NOT NULL, -- difficulty adjusted by user reply
    duration_p5_ms INT UNSIGNED NULL, -- 5th percentile of reply.duration_ms for this question; NULL until computed in batch
    created_at DATETIME(3) NULL,
    updated_at DATETIME(3) NULL,
    PRIMARY KEY (id),
    UNIQUE (uuid),
    FOREIGN KEY (subject_id) REFERENCES castor.subject(id),
    FOREIGN KEY (parent_id) REFERENCES castor.question(id),
    INDEX idx_subject_difficulty (subject_id, adjusted_difficulty)
);