CREATE TABLE IF NOT EXISTS castor.pending_reply (
    id INT UNSIGNED AUTO_INCREMENT,
    question_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    created_at DATETIME(3) NULL,
    updated_at DATETIME(3) NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (question_id) REFERENCES question(id),
    FOREIGN KEY (user_id) REFERENCES user(id),
    INDEX idx_user (user_id),
    INDEX idx_created_at (created_at)
);