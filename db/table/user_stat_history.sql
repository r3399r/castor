CREATE TABLE IF NOT EXISTS castor.user_stat_history (
    id INT UNSIGNED AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    subject_id INT UNSIGNED NOT NULL,
    date DATE NOT NULL,
    weighted_mastery DOUBLE NULL,
    daily_attempts INT UNSIGNED NOT NULL DEFAULT 0,
    daily_correct DOUBLE NOT NULL DEFAULT 0,
    daily_points INT UNSIGNED NOT NULL DEFAULT 0, -- earn-only, unaffected by spending
    created_at DATETIME(3) NULL,
    updated_at DATETIME(3) NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES user(id),
    FOREIGN KEY (subject_id) REFERENCES subject(id),
    UNIQUE KEY unique_user_subject_date (user_id, subject_id, date)
);
