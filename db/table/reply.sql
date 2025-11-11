CREATE TABLE IF NOT EXISTS caster.reply (
    id INT UNSIGNED AUTO_INCREMENT,
    question_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    score DOUBLE NOT NULL DEFAULT 0,
    elapsed_time_ms INT UNSIGNED NULL,
    replied_answer VARCHAR(255) NULL,
    complete BOOLEAN NOT NULL DEFAULT FALSE,
    recorded_at DATETIME(3) NULL,
    created_at DATETIME(3) NULL,
    updated_at DATETIME(3) NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (question_id) REFERENCES question(id),
    FOREIGN KEY (user_id) REFERENCES user(id)
);