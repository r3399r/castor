CREATE TABLE IF NOT EXISTS castor.user_concept_stat (
    id INT UNSIGNED AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    concept_id INT UNSIGNED NOT NULL,
    mastery FLOAT NULL, -- Accuracy, RecentPerformance, Exposure
    score_rolling VARCHAR(255) NULL, -- for Accuracy & Exposure 0.1|0.1|1.0|1.0|0.0...
    weighted_sum FLOAT NULL, -- sum of (score * decay), for RecentPerformance
    decay_sum FLOAT NULL,    -- sum of decay, for RecentPerformance
    created_at DATETIME(3) NULL,
    updated_at DATETIME(3) NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES user(id),
    FOREIGN KEY (concept_id) REFERENCES concept(id)
);