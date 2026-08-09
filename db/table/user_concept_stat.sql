CREATE TABLE IF NOT EXISTS castor.user_concept_stat (
    id INT UNSIGNED AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    concept_id INT UNSIGNED NOT NULL,
    mastery DOUBLE NULL, -- Accuracy, RecentPerformance, Exposure
    attempt_count INT UNSIGNED NOT NULL DEFAULT 0, -- for Accuracy and Exposure
    scoring_total DOUBLE NOT NULL DEFAULT 0,    -- sum of all scores, for Accuracy
    last_attempt_at DATETIME(3) NULL, -- for RecentPerformance
    weighted_sum DOUBLE NOT NULL DEFAULT 0, -- sum of (score * decay), for RecentPerformance
    decay_sum DOUBLE NOT NULL DEFAULT 0,    -- sum of decay, for RecentPerformance
    created_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES user(id),
    FOREIGN KEY (concept_id) REFERENCES concept(id),
    UNIQUE KEY unique_user_concept (user_id, concept_id)
);