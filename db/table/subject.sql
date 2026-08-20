CREATE TABLE IF NOT EXISTS castor.subject (
    id INT UNSIGNED AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    sort_order TINYINT UNSIGNED NOT NULL DEFAULT 0,
    duration_median_ms INT UNSIGNED NULL, -- median of reply.duration_ms across this subject's questions; NULL until enough samples exist (see questionStat.ts)
    created_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id)
);