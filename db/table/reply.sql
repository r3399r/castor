CREATE TABLE IF NOT EXISTS castor.reply (
    id INT UNSIGNED AUTO_INCREMENT,
    question_id INT UNSIGNED NOT NULL,
    subject_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    parent_id INT UNSIGNED NULL,
    score DOUBLE NOT NULL DEFAULT 0,
    replied_answer VARCHAR(255) NULL,
    duration_ms INT UNSIGNED NULL,
    replied_at DATETIME(3) NOT NULL,
    created_at DATETIME(3) NULL,
    updated_at DATETIME(3) NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (question_id) REFERENCES question(id),
    FOREIGN KEY (subject_id) REFERENCES subject(id),
    FOREIGN KEY (user_id) REFERENCES user(id),
    FOREIGN KEY (parent_id) REFERENCES question(id),
    INDEX idx_subject_user_created_at (subject_id, user_id, created_at)
);