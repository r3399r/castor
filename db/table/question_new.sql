CREATE TABLE IF NOT EXISTS castor.question (
    id INT UNSIGNED AUTO_INCREMENT,
    uuid VARCHAR(36) NOT NULL,
    subject_id INT UNSIGNED NOT NULL,
    exam_id INT UNSIGNED NOT NULL,
    parent_id INT UNSIGNED NULL,
    fb_post_id VARCHAR(255) NULL,
    is_group TINYINT(1) NOT NULL DEFAULT 0,
    type VARCHAR(255) NOT NULL, -- GROUP, SINGLE, MULTIPLE, TRUE_FALSE, FILL
    sort_order INT NOT NULL DEFAULT 0, -- for GROUP
    content TEXT NULL,
    options VARCHAR(255) NULL, -- A|B|C|D or True|False or 0|1|2|3
    answer VARCHAR(255) NULL, -- A or AC or True or 301
    difficulty TINYINT UNSIGNED NOT NULL DEFAULT 1, -- 1~10

    attemp_count INT UNSIGNED NOT NULL DEFAULT 0,
    scoring_total DOUBLE NOT NULL DEFAULT 0, -- scoring_rate = scoring_total / attemp_count
    discrimination DOUBLE NULL, -- first 33% - last 33% scoring_rate
    created_at DATETIME(3) NULL,
    updated_at DATETIME(3) NULL,
    PRIMARY KEY (id),
    UNIQUE (uuid),
    FOREIGN KEY (subject_id) REFERENCES castor.subject(id),
    FOREIGN KEY (exam_id) REFERENCES castor.exam(id),
    FOREIGN KEY (parent_id) REFERENCES castor.question(id)
);